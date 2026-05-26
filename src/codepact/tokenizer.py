"""Token counting helpers."""

from __future__ import annotations

from typing import Any


class TokenCounter:
    """Thin tiktoken wrapper with model fallback."""

    def __init__(self, model: str) -> None:
        self.model = model
        self._encoding = self._load_encoding(model)

    def count(self, text: str) -> int:
        return len(self._encoding.encode(text))

    def _load_encoding(self, model: str) -> Any:
        import tiktoken

        try:
            return tiktoken.encoding_for_model(model)
        except KeyError:
            return tiktoken.get_encoding("cl100k_base")
