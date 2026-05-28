from __future__ import annotations

import sys
from types import SimpleNamespace

from fastapi.testclient import TestClient

from codepact.api import app


class FakeEncoding:
    def encode(self, text: str) -> list[str]:
        return text.split()


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
    assert "# Codepact Context" in payload["markdown"]
    assert payload["files_scanned"] == 1
    assert payload["tokens"] > 0
    assert payload["graph"]["nodes"][0]["id"] == "src/graph.py"
    assert payload["graph"]["nodes"][0]["detected_language"] == "python"
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
    assert "# Контекст Codepact" in payload["markdown"]
    assert "## Карта проекта" in payload["markdown"]
    assert "Обнаруженный язык" in payload["markdown"]
    assert "[Отладка] Лимит:" in payload["markdown"]
