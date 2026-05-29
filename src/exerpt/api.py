"""FastAPI application for Exerpt."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from exerpt.engine import ExerptEngine
from exerpt.i18n import normalize_locale, translate
from exerpt.language import detect_language, is_ignored_project_path
from exerpt.models import BuildOptions, SourceFile, TokenBudgetExceeded

LOCAL_FRONTEND_ORIGINS = [
    "https://exerpt.dev",
    "https://www.exerpt.dev",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]


class InputFile(BaseModel):
    """A file submitted by the web playground."""

    name: str = Field(..., min_length=1, examples=["src/app.py"])
    content: str = Field(..., examples=["def main():\n    return 'hello'\n"])


class SiftRequest(BaseModel):
    """Request payload for the /sift endpoint."""

    files: list[InputFile] = Field(..., min_length=1)
    task: str = Field(..., min_length=1, examples=["Optimize dependency graph"])
    limit: int = Field(8000, gt=0, le=1_000_000)
    locale: str = Field("en", examples=["en"])


class RankReasonResponse(BaseModel):
    """Structured rank reason for frontend localization."""

    code: str
    score: float
    explanation: str
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class GraphNode(BaseModel):
    """A file node in the dependency graph."""

    id: str
    priority: str
    detected_language: str
    importance_score: float
    reason_codes: list[RankReasonResponse] = Field(default_factory=list)


class GraphEdge(BaseModel):
    """An import edge in the dependency graph."""

    source: str
    target: str


class DependencyGraphResponse(BaseModel):
    """Dependency graph payload for frontend visualization."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class SiftResponse(BaseModel):
    """Compressed Exerpt output plus useful metrics."""

    markdown: str
    tokens: int
    files_scanned: int
    priority_counts: dict[str, int]
    graph: DependencyGraphResponse
    compression_warning: str | None = None


class JobCreateResponse(BaseModel):
    """Initial response for an asynchronous sift job."""

    id: str
    status: str
    progress: int
    message: str
    message_code: str


class JobStatusResponse(JobCreateResponse):
    """Current state and optional result artifact for a sift job."""

    result: SiftResponse | None = None
    error: str | None = None


@dataclass(slots=True)
class SiftJob:
    """In-memory job state for local asynchronous processing."""

    id: str
    status: str = "queued"
    progress: int = 0
    message: str = "Queued"
    message_code: str = "jobQueued"
    result: SiftResponse | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


class InMemoryScanner:
    """Scanner adapter that feeds submitted files into the normal engine."""

    def __init__(self, files: list[InputFile]) -> None:
        self.files = files

    def scan(self, root: Path, *, include_tests: bool = True) -> list[SourceFile]:
        seen: set[str] = set()
        sources: list[SourceFile] = []

        for index, file in enumerate(self.files, start=1):
            relative_path = self._normalize_name(file.name, index, seen)
            if is_ignored_project_path(relative_path):
                continue
            sources.append(
                SourceFile(
                    path=Path(relative_path),
                    relative_path=relative_path,
                    text=file.content,
                    detected_language=detect_language(relative_path),
                )
            )

        return sources

    def _normalize_name(self, name: str, index: int, seen: set[str]) -> str:
        raw_parts = name.replace("\\", "/").split("/")
        parts = [part for part in raw_parts if part and part not in {".", ".."}]
        normalized = "/".join(parts) if parts else f"snippet_{index}.txt"

        if normalized not in seen:
            seen.add(normalized)
            return normalized

        path = Path(normalized)
        suffix = path.suffix
        stem = path.as_posix()[: -len(suffix)] if suffix else path.as_posix()
        deduped = f"{stem}_{index}{suffix}"
        seen.add(deduped)
        return deduped


jobs: dict[str, SiftJob] = {}
jobs_lock = asyncio.Lock()

app = FastAPI(
    title="Exerpt API",
    description="Precision Context Engineering for LLMs.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    """Friendly root response for browser checks."""
    return {
        "name": "Exerpt API",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict[str, str]:
    """Basic health check for local development."""
    return {"status": "ok"}


@app.post("/sift")
def sift(payload: SiftRequest) -> SiftResponse:
    """Compress submitted files into a task-oriented Markdown prompt."""
    locale = normalize_locale(payload.locale)

    try:
        return build_sift_response(payload, locale)
    except TokenBudgetExceeded as exc:
        detail = translate(
            locale,
            "token_limit_reached",
            limit=format_token_limit(payload.limit),
        )
        raise HTTPException(status_code=413, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/jobs", status_code=202)
async def create_job(payload: SiftRequest) -> JobCreateResponse:
    """Create an asynchronous sift job and return its tracking id."""
    job_id = uuid.uuid4().hex
    job = SiftJob(id=job_id)

    async with jobs_lock:
        jobs[job_id] = job

    asyncio.create_task(run_sift_job(job_id, payload))
    return JobCreateResponse(
        id=job.id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        message_code=job.message_code,
    )


@app.get("/jobs/{job_id}")
async def get_job(job_id: str) -> JobStatusResponse:
    """Fetch a job's current state or final artifact."""
    return await job_snapshot(job_id)


@app.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: str) -> StreamingResponse:
    """Stream job progress as Server-Sent Events."""
    await ensure_job(job_id)

    async def event_stream() -> AsyncIterator[str]:
        previous_payload = ""
        while True:
            snapshot = await job_snapshot(job_id)
            payload = json.dumps(model_to_data(snapshot), ensure_ascii=False)
            if payload != previous_payload:
                event_name = (
                    "result"
                    if snapshot.status == "completed"
                    else "error"
                    if snapshot.status == "failed"
                    else "progress"
                )
                yield f"event: {event_name}\ndata: {payload}\n\n"
                previous_payload = payload

            if snapshot.status in {"completed", "failed"}:
                break

            await asyncio.sleep(0.25)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def build_sift_response(payload: SiftRequest, locale: str) -> SiftResponse:
    """Run the synchronous engine and shape the API response."""
    scanner = InMemoryScanner(payload.files)
    engine = ExerptEngine(scanner=scanner)
    result = engine.build_prompt(
        BuildOptions(
            root=Path("."),
            task=payload.task,
            token_limit=payload.limit,
            output=Path("exerpt.md"),
            allow_approximate_tokens=True,
            locale=locale,
        )
    )

    return SiftResponse(
        markdown=result.markdown,
        tokens=result.tokens,
        files_scanned=result.files_scanned,
        priority_counts=result.priority_counts,
        compression_warning=result.compression_warning,
        graph=DependencyGraphResponse(
            nodes=[
                GraphNode(
                    id=node.id,
                    priority=node.priority,
                    detected_language=node.detected_language,
                    importance_score=node.importance_score,
                    reason_codes=[
                        RankReasonResponse(
                            code=reason.code,
                            score=reason.score,
                            explanation=reason.explanation,
                            metadata=reason.metadata,
                        )
                        for reason in node.reason_codes
                    ],
                )
                for node in result.dependency_nodes
            ],
            edges=[
                GraphEdge(source=edge.source, target=edge.target)
                for edge in result.dependency_edges
            ],
        ),
    )


async def run_sift_job(job_id: str, payload: SiftRequest) -> None:
    """Execute a sift job outside the request/response path."""
    locale = normalize_locale(payload.locale)
    worker = asyncio.create_task(asyncio.to_thread(build_sift_response, payload, locale))
    stages = [
        (10, "Scanning virtual file system...", "jobScanning"),
        (40, "Building dependency graph...", "jobBuildingGraph"),
        (70, "Ranking relevant files...", "jobRanking"),
        (90, "Fitting token budget...", "jobFittingTokens"),
    ]

    try:
        for progress, message, message_code in stages:
            await update_job(
                job_id,
                status="running",
                progress=progress,
                message=message,
                message_code=message_code,
            )
            if worker.done():
                break
            await asyncio.sleep(0.2)

        result = await worker
        await update_job(
            job_id,
            status="completed",
            progress=100,
            message="Complete",
            message_code="jobComplete",
            result=result,
        )
    except TokenBudgetExceeded:
        detail = translate(
            locale,
            "token_limit_reached",
            limit=format_token_limit(payload.limit),
        )
        await update_job(
            job_id,
            status="failed",
            progress=100,
            message=detail,
            message_code="jobFailed",
            error=detail,
        )
    except Exception as exc:
        await update_job(
            job_id,
            status="failed",
            progress=100,
            message=str(exc),
            message_code="jobFailed",
            error=str(exc),
        )


async def update_job(
    job_id: str,
    *,
    status: str,
    progress: int,
    message: str,
    message_code: str,
    result: SiftResponse | None = None,
    error: str | None = None,
) -> None:
    """Update job state in a single event-loop critical section."""
    async with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            return
        job.status = status
        job.progress = progress
        job.message = message
        job.message_code = message_code
        job.updated_at = time.time()
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error


async def ensure_job(job_id: str) -> SiftJob:
    async with jobs_lock:
        job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def job_snapshot(job_id: str) -> JobStatusResponse:
    job = await ensure_job(job_id)
    return JobStatusResponse(
        id=job.id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        message_code=job.message_code,
        result=job.result,
        error=job.error,
    )


def model_to_data(model: BaseModel) -> dict[str, Any]:
    """Support both Pydantic v1 and v2 model serialization."""
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def format_token_limit(token_limit: int) -> str:
    """Format token limits consistently for localized user-facing messages."""
    if token_limit >= 1000 and token_limit % 1000 == 0:
        return f"{token_limit // 1000}k"
    return f"{token_limit:,} tokens"


def main() -> None:
    """Run the local API server on the port expected by the web workspace."""
    import uvicorn

    uvicorn.run("exerpt.api:app", host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
