from __future__ import annotations

import sys
from types import SimpleNamespace

from codepact.tokenizer import TokenCounter


class FakeEncoding:
    def encode(self, text: str) -> list[str]:
        return text.split()


def test_token_counter_counts_tokens_from_tiktoken_encoding(monkeypatch):
    text = "Codepact compresses repositories into task-oriented context."
    model = "gpt-4o-mini"
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )

    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    assert TokenCounter(model).count(text) == len(text.split())


def test_token_counter_falls_back_to_cl100k_for_unknown_model(monkeypatch):
    calls: list[str] = []

    def encoding_for_model(model: str) -> FakeEncoding:
        raise KeyError(model)

    def get_encoding(encoding_name: str) -> FakeEncoding:
        calls.append(encoding_name)
        return FakeEncoding()

    fake_tiktoken = SimpleNamespace(
        encoding_for_model=encoding_for_model,
        get_encoding=get_encoding,
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    assert TokenCounter("unknown-model").count("one two") == 2
    assert calls == ["cl100k_base"]


def test_token_counter_can_use_approximate_fallback(monkeypatch):
    def encoding_for_model(model: str) -> FakeEncoding:
        raise RuntimeError(model)

    fake_tiktoken = SimpleNamespace(
        encoding_for_model=encoding_for_model,
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    assert TokenCounter("offline-model", allow_approximate=True).count("one two\nthree") == 3


def test_token_counter_can_use_approximate_fallback_when_tiktoken_is_missing(monkeypatch):
    monkeypatch.setitem(sys.modules, "tiktoken", None)

    assert TokenCounter("offline-model", allow_approximate=True).count("one two\nthree") == 3


def test_token_counter_handles_utf8_source_text(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    assert TokenCounter("gpt-4o-mini").count('fun привет() = "你好"') == 4
