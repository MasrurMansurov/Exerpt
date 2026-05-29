"""Gitignore-aware project scanner."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pathspec import PathSpec

from exerpt.language import detect_language, is_ignored_project_path
from exerpt.models import SourceFile


class ProjectScanner:
    """Read text files from a project while respecting ignore rules."""

    ignored_dirs = {
        ".git",
        ".gradle",
        ".hg",
        ".idea",
        ".mypy_cache",
        ".nox",
        ".pytest_cache",
        ".ruff_cache",
        ".tox",
        ".venv",
        "__pycache__",
        "build",
        "dist",
        "node_modules",
        "target",
        "vendor",
    }
    binary_extensions = {
        ".7z",
        ".a",
        ".avi",
        ".bin",
        ".bmp",
        ".class",
        ".dll",
        ".dmg",
        ".doc",
        ".docx",
        ".eot",
        ".exe",
        ".gif",
        ".gz",
        ".ico",
        ".jar",
        ".jpeg",
        ".jpg",
        ".mov",
        ".mp3",
        ".mp4",
        ".o",
        ".otf",
        ".pdf",
        ".png",
        ".pyc",
        ".rar",
        ".so",
        ".sqlite",
        ".tar",
        ".ttf",
        ".wav",
        ".webm",
        ".webp",
        ".woff",
        ".woff2",
        ".zip",
    }

    def scan(self, root: Path, *, include_tests: bool = True) -> list[SourceFile]:
        """Return readable text files under ``root``."""
        if not root.exists():
            raise FileNotFoundError(f"Root does not exist: {root}")

        root = root.resolve()
        ignore_spec = self._load_gitignore_rules(root)
        discovered: list[SourceFile] = []

        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue

            relative_path = path.relative_to(root).as_posix()
            if self._is_ignored(relative_path, ignore_spec):
                continue
            if not include_tests and self._looks_like_test(relative_path):
                continue
            if self._looks_binary(path):
                continue

            text = self._read_text(path)
            if text is None:
                continue

            discovered.append(
                SourceFile(
                    path=path,
                    relative_path=relative_path,
                    text=text,
                    detected_language=detect_language(relative_path),
                )
            )

        return discovered

    def _load_gitignore_rules(self, root: Path) -> PathSpec[Any]:
        patterns: list[str] = []
        for gitignore in sorted(root.rglob(".gitignore")):
            base = gitignore.parent.relative_to(root).as_posix()
            if base == ".":
                base = ""
            for raw_line in gitignore.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                patterns.append(self._scope_gitignore_pattern(line, base))

        return PathSpec.from_lines("gitignore", patterns)

    def _scope_gitignore_pattern(self, pattern: str, base: str) -> str:
        negated = pattern.startswith("!")
        clean = pattern[1:] if negated else pattern
        anchored = clean.startswith("/")
        clean = clean.lstrip("/")

        if base:
            if anchored or "/" in clean:
                scoped = f"{base}/{clean}"
            else:
                scoped = f"{base}/**/{clean}"
        else:
            scoped = clean

        return f"!{scoped}" if negated else scoped

    def _is_ignored(self, relative_path: str, ignore_spec: PathSpec[Any]) -> bool:
        parts = set(Path(relative_path).parts)
        if parts.intersection(self.ignored_dirs):
            return True
        if is_ignored_project_path(relative_path):
            return True
        return ignore_spec.match_file(relative_path)

    def _looks_binary(self, path: Path) -> bool:
        if path.suffix.lower() in self.binary_extensions:
            return True
        try:
            sample = path.read_bytes()[:4096]
        except OSError:
            return True
        return b"\0" in sample

    def _read_text(self, path: Path) -> str | None:
        data = path.read_bytes()
        if not data:
            return ""

        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            from charset_normalizer import from_bytes

            result = from_bytes(data).best()
            return str(result) if result is not None else None

    def _looks_like_test(self, relative_path: str) -> bool:
        path = relative_path.lower()
        name = Path(path).name
        return (
            "/test/" in path
            or "/tests/" in path
            or path.startswith("test/")
            or path.startswith("tests/")
            or name.startswith("test_")
            or name.endswith("_test.py")
            or name.endswith(".test.js")
            or name.endswith(".test.jsx")
            or name.endswith(".test.ts")
            or name.endswith(".test.tsx")
            or name.endswith(".spec.js")
            or name.endswith(".spec.jsx")
            or name.endswith(".spec.ts")
            or name.endswith(".spec.tsx")
        )
