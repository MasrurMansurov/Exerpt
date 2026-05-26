from __future__ import annotations

from pathlib import Path

from codepact.models import Priority, SourceFile
from codepact.sifter import CodeSifter


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

    compact = CodeSifter().sift(source, Priority.LOW)

    assert "def connect" in compact
    assert "Open database connection" in compact
    assert "[implementation hidden]" in compact
    assert "password" not in compact
