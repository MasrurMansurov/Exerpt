"""Language detection and project file classification."""

from __future__ import annotations

from enum import Enum
from pathlib import Path


class FileCategory(str, Enum):
    """Broad file role used by ranking and compression."""

    SOURCE_CODE = "source_code"
    CONFIG_DATA = "config_data"
    ASSET = "asset"


SOURCE_CODE_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".cxx",
    ".dart",
    ".go",
    ".h",
    ".hh",
    ".hpp",
    ".hxx",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".mjs",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".swift",
    ".ts",
    ".tsx",
}

CONFIG_DATA_EXTENSIONS = {
    ".gradle",
    ".ini",
    ".json",
    ".lock",
    ".md",
    ".toml",
    ".xml",
    ".yaml",
    ".yml",
}

LANGUAGE_BY_EXTENSION = {
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".cxx": "cpp",
    ".dart": "dart",
    ".go": "go",
    ".gradle": "gradle",
    ".h": "cpp",
    ".hh": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".ini": "ini",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".lock": "lockfile",
    ".md": "markdown",
    ".mjs": "javascript",
    ".php": "php",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
}

SPECIAL_LANGUAGE_FILENAMES = {
    "cargo.lock": "lockfile",
    "dockerfile": "dockerfile",
    "gemfile": "ruby",
    "go.mod": "go",
    "go.sum": "go",
    "package-lock.json": "lockfile",
    "pnpm-lock.yaml": "lockfile",
    "podfile": "ruby",
    "yarn.lock": "lockfile",
}

CONFIG_EXCEPTION_TERMS = {"api", "config", "layout", "manifest"}
ANDROID_IGNORED_DIRS = {".gradle", ".idea", "build"}


def detect_language(path: str | Path) -> str:
    """Return a stable, lower-case language id for ``path``."""
    normalized = Path(str(path).replace("\\", "/"))
    name = normalized.name.lower()
    if name in SPECIAL_LANGUAGE_FILENAMES:
        return SPECIAL_LANGUAGE_FILENAMES[name]
    return LANGUAGE_BY_EXTENSION.get(normalized.suffix.lower(), "unknown")


def file_category(path: str | Path) -> FileCategory:
    """Classify a file as source code, config/data, or asset/unknown."""
    normalized = Path(str(path).replace("\\", "/"))
    name = normalized.name.lower()
    suffix = normalized.suffix.lower()

    if suffix in SOURCE_CODE_EXTENSIONS:
        return FileCategory.SOURCE_CODE
    if suffix in CONFIG_DATA_EXTENSIONS or name in SPECIAL_LANGUAGE_FILENAMES:
        return FileCategory.CONFIG_DATA
    return FileCategory.ASSET


def is_source_code(path: str | Path) -> bool:
    """Return true when ``path`` is a source-code file."""
    return file_category(path) is FileCategory.SOURCE_CODE


def is_config_data(path: str | Path) -> bool:
    """Return true when ``path`` is low-value config/data by default."""
    return file_category(path) is FileCategory.CONFIG_DATA


def is_config_exception(path: str | Path, task_terms: set[str]) -> bool:
    """Return true when JSON/XML deserves relevance for the current task."""
    suffix = Path(str(path).replace("\\", "/")).suffix.lower()
    return suffix in {".json", ".xml"} and bool(task_terms.intersection(CONFIG_EXCEPTION_TERMS))


def is_android_source_path(relative_path: str | Path) -> bool:
    """Detect Android/Kotlin source roots under ``src/main``."""
    parts = tuple(part.lower() for part in Path(str(relative_path).replace("\\", "/")).parts)
    for index in range(len(parts) - 2):
        if parts[index : index + 3] in {("src", "main", "java"), ("src", "main", "kotlin")}:
            return True
    return False


def is_ignored_project_path(relative_path: str | Path) -> bool:
    """Return true for project directories that should be ignored by default."""
    parts = tuple(part.lower() for part in Path(str(relative_path).replace("\\", "/")).parts)
    if set(parts).intersection(ANDROID_IGNORED_DIRS):
        return True
    for index in range(len(parts) - 1):
        if parts[index : index + 2] == ("res", "raw"):
            return True
    return False
