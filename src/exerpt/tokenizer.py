"""Token counting helpers."""

from __future__ import annotations

from typing import Any


class ApproximateEncoding:
    """Small offline fallback used only when explicitly enabled."""

    def encode(self, text: str) -> list[str]:
        return text.replace("\n", " \n ").split()


class TokenCounter:
    """Thin tiktoken wrapper with model fallback."""

    def __init__(self, model: str, *, allow_approximate: bool = False) -> None:
        self.model = model
        self.allow_approximate = allow_approximate
        self._encoding = self._load_encoding(model)

    def count(self, text: str) -> int:
        normalized = text.encode("utf-8", errors="replace").decode("utf-8")
        return len(self._encoding.encode(normalized))

    def _load_encoding(self, model: str) -> Any:
        try:
            import tiktoken
        except Exception:
            if self.allow_approximate:
                return ApproximateEncoding()
            raise

        try:
            return tiktoken.encoding_for_model(model)
        except KeyError:
            try:
                return tiktoken.get_encoding("cl100k_base")
            except Exception:
                if self.allow_approximate:
                    return ApproximateEncoding()
                raise
        except Exception:
            if self.allow_approximate:
                return ApproximateEncoding()
            raise
