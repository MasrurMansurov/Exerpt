"""Shared domain models for Codepact."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class TokenBudgetExceeded(RuntimeError):
    """Raised when required context cannot fit the configured token budget."""


class Priority(str, Enum):
    """Rendering priority assigned to each source file."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass(frozen=True)
class BuildOptions:
    """User-provided build settings."""

    root: Path
    task: str
    token_limit: int
    output: Path
    model: str = "gpt-4o-mini"
    include_tests: bool = True


@dataclass(slots=True)
class SourceFile:
    """Text source discovered in the repository."""

    path: Path
    relative_path: str
    text: str
    imports: set[str] = field(default_factory=set)


@dataclass(slots=True)
class RankedFile:
    """Source file plus graph-aware priority metadata."""

    source: SourceFile
    priority: Priority
    reason: str
    lexical_score: int = 0
    graph_distance: int | None = None


@dataclass(frozen=True)
class RenderProfile:
    """Controls budget fitting without mutating ranked files."""

    include_medium_code: bool = True
    include_low_code: bool = True
    low_file_limit: int | None = None


@dataclass(frozen=True)
class BuildResult:
    """Completed Markdown prompt and metrics."""

    markdown: str
    tokens: int
    files_scanned: int
    priority_counts: dict[str, int]
