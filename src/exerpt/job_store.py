"""SQLite-backed job persistence for the API."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_DB_PATH = Path(".exerpt/jobs.sqlite3")
DEFAULT_STALE_SECONDS = 300.0


@dataclass(slots=True)
class JobRecord:
    """Persisted asynchronous sift job state."""

    id: str
    status: str
    progress: int
    message: str
    message_code: str
    result: dict[str, Any] | None
    error: str | None
    created_at: float
    updated_at: float


class SQLiteJobStore:
    """Small persistent job store for single-node FastAPI deployments."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        configured_path = db_path or os.environ.get("EXERPT_JOBS_DB_PATH") or DEFAULT_DB_PATH
        self.db_path = Path(configured_path)
        self.stale_after_seconds = self._configured_stale_seconds()
        self._lock = threading.RLock()
        self._initialized = False

    def initialize(self, *, mark_active_failed: bool = False) -> None:
        """Create the schema and optionally close jobs interrupted by a restart."""
        with self._lock:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as connection:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS jobs (
                        id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        progress INTEGER NOT NULL,
                        message TEXT NOT NULL,
                        message_code TEXT NOT NULL,
                        result_json TEXT,
                        error TEXT,
                        created_at REAL NOT NULL,
                        updated_at REAL NOT NULL
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at)"
                )
                if mark_active_failed:
                    now = time.time()
                    interrupted = "Server restarted before this job completed."
                    connection.execute(
                        """
                        UPDATE jobs
                        SET status = 'failed',
                            progress = 100,
                            message = ?,
                            message_code = 'jobFailed',
                            error = ?,
                            updated_at = ?
                        WHERE status IN ('queued', 'running')
                        """,
                        (interrupted, interrupted, now),
                    )
                connection.commit()
            self._initialized = True

    def create(self, job_id: str) -> JobRecord:
        """Insert a queued job and return its initial persisted state."""
        now = time.time()
        with self._lock:
            self._ensure_initialized()
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO jobs (
                        id, status, progress, message, message_code,
                        result_json, error, created_at, updated_at
                    )
                    VALUES (?, 'queued', 0, 'Queued', 'jobQueued', NULL, NULL, ?, ?)
                    """,
                    (job_id, now, now),
                )
                connection.commit()
        job = self.get(job_id)
        if job is None:
            raise RuntimeError("Created job could not be loaded")
        return job

    def update(
        self,
        job_id: str,
        *,
        status: str,
        progress: int,
        message: str,
        message_code: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> bool:
        """Update a job row, preserving result/error when omitted."""
        result_json = json.dumps(result, ensure_ascii=False) if result is not None else None
        now = time.time()
        with self._lock:
            self._ensure_initialized()
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    UPDATE jobs
                    SET status = ?,
                        progress = ?,
                        message = ?,
                        message_code = ?,
                        result_json = COALESCE(?, result_json),
                        error = COALESCE(?, error),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (status, progress, message, message_code, result_json, error, now, job_id),
                )
                connection.commit()
                return cursor.rowcount > 0

    def get(self, job_id: str) -> JobRecord | None:
        """Load a persisted job by id."""
        with self._lock:
            self._ensure_initialized()
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT id, status, progress, message, message_code,
                           result_json, error, created_at, updated_at
                    FROM jobs
                    WHERE id = ?
                    """,
                    (job_id,),
                ).fetchone()
        return self._record_from_row(row)

    def fail_stale_jobs(self, *, stale_after_seconds: float | None = None) -> int:
        """Fail queued/running jobs that have stopped receiving updates."""
        cutoff = time.time() - (stale_after_seconds or self.stale_after_seconds)
        message = "Job stopped before it completed. Please run it again."
        with self._lock:
            self._ensure_initialized()
            with self._connect() as connection:
                cursor = connection.execute(
                    """
                    UPDATE jobs
                    SET status = 'failed',
                        progress = 100,
                        message = ?,
                        message_code = 'jobFailed',
                        error = ?,
                        updated_at = ?
                    WHERE status IN ('queued', 'running')
                      AND updated_at < ?
                    """,
                    (message, message, time.time(), cutoff),
                )
                connection.commit()
                return cursor.rowcount

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            self.initialize()

    def _configured_stale_seconds(self) -> float:
        raw_value = os.environ.get("EXERPT_JOB_STALE_SECONDS")
        if raw_value is None:
            return DEFAULT_STALE_SECONDS
        try:
            return max(10.0, float(raw_value))
        except ValueError:
            return DEFAULT_STALE_SECONDS

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    def _record_from_row(self, row: sqlite3.Row | None) -> JobRecord | None:
        if row is None:
            return None
        result_json = row["result_json"]
        return JobRecord(
            id=row["id"],
            status=row["status"],
            progress=row["progress"],
            message=row["message"],
            message_code=row["message_code"],
            result=json.loads(result_json) if result_json else None,
            error=row["error"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
