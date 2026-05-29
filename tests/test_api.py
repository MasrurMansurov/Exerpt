from __future__ import annotations

import sys
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient

from exerpt.api import app
from exerpt.i18n import translate


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
