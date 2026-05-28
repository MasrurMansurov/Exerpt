"""FastAPI application for Codepact."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from codepact.engine import CodepactEngine
from codepact.i18n import normalize_locale, translate
from codepact.language import detect_language, is_ignored_project_path
from codepact.models import BuildOptions, SourceFile, TokenBudgetExceeded

LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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


class GraphNode(BaseModel):
    """A file node in the dependency graph."""

    id: str
    priority: str
    detected_language: str


class GraphEdge(BaseModel):
    """An import edge in the dependency graph."""

    source: str
    target: str


class DependencyGraphResponse(BaseModel):
    """Dependency graph payload for frontend visualization."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class SiftResponse(BaseModel):
    """Compressed Codepact output plus useful metrics."""

    markdown: str
    tokens: int
    files_scanned: int
    priority_counts: dict[str, int]
    graph: DependencyGraphResponse
    compression_warning: str | None = None


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


app = FastAPI(
    title="Codepact API",
    description="REST API for task-oriented codebase sifting.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Basic health check for local development."""
    return {"status": "ok"}


@app.post("/sift")
def sift(payload: SiftRequest) -> SiftResponse:
    """Compress submitted files into a task-oriented Markdown prompt."""
    locale = normalize_locale(payload.locale)
    scanner = InMemoryScanner(payload.files)
    engine = CodepactEngine(scanner=scanner)

    try:
        result = engine.build_prompt(
            BuildOptions(
                root=Path("."),
                task=payload.task,
                token_limit=payload.limit,
                output=Path("codepact.md"),
                allow_approximate_tokens=True,
                locale=locale,
            )
        )
    except TokenBudgetExceeded as exc:
        detail = str(exc) or translate(locale, "compression_warning", limit=payload.limit)
        raise HTTPException(status_code=413, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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
                )
                for node in result.dependency_nodes
            ],
            edges=[
                GraphEdge(source=edge.source, target=edge.target)
                for edge in result.dependency_edges
            ],
        ),
    )


def main() -> None:
    """Run the local API server on the port expected by the web workspace."""
    import uvicorn

    uvicorn.run("codepact.api:app", host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
