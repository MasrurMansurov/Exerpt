from __future__ import annotations

from pathlib import Path

from exerpt.models import Priority, SourceFile
from exerpt.sifter import CodeSifter


def test_low_priority_sifting_keeps_signature_and_docstring_only():
    source = SourceFile(
        path=Path("service.py"),
        relative_path="service.py",
        text=(
            "def connect(url: str) -> str:\n"
            "    \"\"\"Open database connection.\"\"\"\n"
            "    password = 'secret'\n"
            "    return password\n"
        ),
    )

    focused = CodeSifter().sift(source, Priority.LOW)

    assert "def connect" in focused
    assert "Open database connection" in focused
    assert "[implementation hidden]" in focused
    assert "password" not in focused
