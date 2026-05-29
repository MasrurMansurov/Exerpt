"""Generate a self-hosted Exerpt demo prompt."""

from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
OUTPUT_FILE = PROJECT_ROOT / "demo_result.md"
TASK = "Optimize dependency graph"


def main() -> None:
    """Run Exerpt against its own source tree and write demo_result.md."""
    sys.path.insert(0, str(SRC_ROOT))

    try:
        markdown, tokens = build_demo(use_fallback_tokenizer=False)
        fallback_note = ""
    except Exception:
        markdown, tokens = build_demo(use_fallback_tokenizer=True)
        fallback_note = (
            "<!-- Token note: generated with a local fallback tokenizer because "
            "tiktoken encoding cache was unavailable in this environment. -->\n\n"
        )

    OUTPUT_FILE.write_text(f"{fallback_note}{markdown}", encoding="utf-8")
    print(f"Wrote {OUTPUT_FILE.relative_to(PROJECT_ROOT)} ({tokens:,} tokens)")


def build_demo(*, use_fallback_tokenizer: bool) -> tuple[str, int]:
    if use_fallback_tokenizer:
        install_fallback_tiktoken()

    from exerpt.engine import ExerptEngine
    from exerpt.models import BuildOptions

    result = ExerptEngine().build_prompt(
        BuildOptions(
            root=SRC_ROOT,
            task=TASK,
            token_limit=24_000,
            output=OUTPUT_FILE,
            model="gpt-4o-mini",
            include_tests=True,
        )
    )
    return result.markdown, result.tokens


def install_fallback_tiktoken() -> None:
    """Install a deterministic tokenizer shim for offline demo generation only."""

    class FallbackEncoding:
        def encode(self, text: str) -> list[str]:
            return text.replace("\n", " \n ").split()

    encoding = FallbackEncoding()
    fallback_module: Any = ModuleType("tiktoken")
    fallback_module.encoding_for_model = lambda model: encoding
    fallback_module.get_encoding = lambda name: encoding
    sys.modules["tiktoken"] = fallback_module


if __name__ == "__main__":
    main()
