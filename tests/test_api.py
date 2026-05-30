from __future__ import annotations

import sys
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient

from exerpt.api import app
from exerpt.i18n import translate
from exerpt.job_store import SQLiteJobStore


class FakeEncoding:
    def encode(self, text: str) -> list[str]:
        return text.split()


def test_root_endpoint_returns_api_status():
    client = TestClient(app)
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "name": "Exerpt API",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


def test_sift_endpoint_returns_markdown(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    client = TestClient(app)
    response = client.post(
        "/sift",
        json={
            "task": "Optimize dependency graph",
            "limit": 8000,
            "files": [
                {
                    "name": "src/graph.py",
                    "content": "def build_graph(files):\n    return {'graph': files}\n",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "# Exerpt Context" in payload["markdown"]
    assert payload["files_scanned"] == 1
    assert payload["tokens"] > 0
    assert payload["graph"]["nodes"][0]["id"] == "src/graph.py"
    assert payload["graph"]["nodes"][0]["detected_language"] == "python"
    assert payload["graph"]["nodes"][0]["reason_codes"][0]["code"] == "TASK_MATCH"
    assert "Detected Language" in payload["markdown"]


def test_sift_endpoint_localizes_generated_markdown(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    client = TestClient(app)
    response = client.post(
        "/sift",
        json={
            "task": "Optimize dependency graph",
            "limit": 8000,
            "locale": "ru",
            "files": [
                {
                    "name": "src/graph.py",
                    "content": "def build_graph(files):\n    return {'graph': files}\n",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "# Контекст Exerpt" in payload["markdown"]
    assert "## Карта проекта" in payload["markdown"]
    assert "Обнаруженный язык" in payload["markdown"]
    assert "[Отладка] Лимит:" in payload["markdown"]


def test_compression_and_token_limit_messages_are_localized():
    assert (
        translate("en", "compression_warning", limit="8k")
        == "Aggressively compressed to fit 8k limit"
    )
    assert (
        translate("ru", "compression_warning", limit="8k")
        == "Максимально сжато для соответствия лимиту 8k"
    )
    assert (
        translate("zh", "compression_warning", limit="8k")
        == "已大幅压缩以符合 8k 限制"
    )
    assert (
        translate("ja", "compression_warning", limit="8k")
        == "8k制限に合わせて大幅に圧縮されました"
    )
    assert (
        translate("hi", "compression_warning", limit="8k")
        == "8k सीमा में फिट होने के लिए आक्रामक रूप से संकुचित"
    )
    assert translate("ru", "token_limit_reached", limit="8k") == "Достигнут лимит токенов 8k."


def test_cors_allows_local_frontend_and_exerpt_domain():
    client = TestClient(app)

    for origin in ("http://localhost:3001", "https://exerpt.dev"):
        response = client.options(
            "/jobs",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_jobs_endpoint_completes_with_result_artifact(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    with TestClient(app) as client:
        response = client.post(
            "/jobs",
            json={
                "task": "Optimize dependency graph",
                "limit": 8000,
                "files": [
                    {
                        "name": "src/graph.py",
                        "content": "def build_graph(files):\n    return {'graph': files}\n",
                    }
                ],
            },
        )

        assert response.status_code == 202
        payload = response.json()
        assert payload["status"] == "queued"
        assert payload["message_code"] == "jobQueued"
        job_id = payload["id"]

        final_payload = None
        for _ in range(30):
            job_response = client.get(f"/jobs/{job_id}")
            assert job_response.status_code == 200
            final_payload = job_response.json()
            if final_payload["status"] == "completed":
                break
            time.sleep(0.1)

        assert final_payload is not None
        assert final_payload["status"] == "completed"
        assert final_payload["progress"] == 100
        assert "# Exerpt Context" in final_payload["result"]["markdown"]

        events_response = client.get(f"/jobs/{job_id}/events")
        assert events_response.status_code == 200
        assert "event: result" in events_response.text


def test_sqlite_job_store_persists_job_snapshots(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    first_store = SQLiteJobStore(db_path)
    first_store.initialize()
    first_store.create("job-1")
    first_store.update(
        "job-1",
        status="completed",
        progress=100,
        message="Complete",
        message_code="jobComplete",
        result={
            "markdown": "# Exerpt Context",
            "tokens": 12,
            "files_scanned": 1,
            "priority_counts": {"high": 1},
            "graph": {"nodes": [], "edges": []},
        },
    )

    second_store = SQLiteJobStore(db_path)
    persisted_job = second_store.get("job-1")

    assert persisted_job is not None
    assert persisted_job.status == "completed"
    assert persisted_job.progress == 100
    assert persisted_job.result is not None
    assert persisted_job.result["markdown"] == "# Exerpt Context"


def test_sqlite_job_store_marks_interrupted_jobs_failed(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    first_store = SQLiteJobStore(db_path)
    first_store.create("job-1")
    first_store.update(
        "job-1",
        status="running",
        progress=40,
        message="Building dependency graph...",
        message_code="jobBuildingGraph",
    )

    second_store = SQLiteJobStore(db_path)
    second_store.initialize(mark_active_failed=True)
    interrupted_job = second_store.get("job-1")

    assert interrupted_job is not None
    assert interrupted_job.status == "failed"
    assert interrupted_job.message_code == "jobFailed"
    assert interrupted_job.error == "Server restarted before this job completed."


def test_sqlite_job_store_fails_stale_jobs(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    store = SQLiteJobStore(db_path)
    store.create("job-1")

    assert store.fail_stale_jobs(stale_after_seconds=0.01) == 0
    time.sleep(0.02)
    assert store.fail_stale_jobs(stale_after_seconds=0.01) == 1

    stale_job = store.get("job-1")
    assert stale_job is not None
    assert stale_job.status == "failed"
    assert stale_job.error == "Job stopped before it completed. Please run it again."
