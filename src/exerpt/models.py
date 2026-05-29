"""Shared domain models for Exerpt."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Literal

ReasonMetadata = dict[str, str | int | float | bool | None]


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
    allow_approximate_tokens: bool = False
    locale: str = "en"


@dataclass(slots=True)
class SourceFile:
    """Text source discovered in the repository."""

    path: Path
    relative_path: str
    text: str
    detected_language: str = "unknown"
    imports: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        if not self.detected_language or self.detected_language == "unknown":
            from exerpt.language import detect_language

            self.detected_language = detect_language(self.relative_path)


@dataclass(slots=True)
class RankReason:
    """Structured reason emitted by the ranker for frontend localization."""

    code: str
    score: float
    explanation: str
    metadata: ReasonMetadata = field(default_factory=dict)


@dataclass(slots=True)
class RankedFile:
    """Source file plus graph-aware priority metadata."""

    source: SourceFile
    priority: Priority
    reason: str = ""
    reason_codes: list[RankReason] = field(default_factory=list)
    lexical_score: int = 0
    graph_distance: int | None = None
    importance_score: float = 0.0


@dataclass(frozen=True)
class RenderProfile:
    """Controls budget fitting without mutating ranked files."""

    include_medium: bool = True
    include_low: bool = True
    medium_file_limit: int | None = None
    medium_full_limit: int = 0
    high_full_limit: int | None = None
    min_importance_score: float | None = None
    full_code_score_threshold: float | None = None
    high_render_mode: Literal["full", "snippets"] = "full"
    snippet_max_lines: int = 160
    minimal: bool = False
    label: str = "standard"


@dataclass(frozen=True)
class DependencyNode:
    """A file node with its assigned prompt priority."""

    id: str
    priority: str
    detected_language: str = "unknown"
    importance_score: float = 0.0
    reason_codes: tuple[RankReason, ...] = ()


@dataclass(frozen=True)
class DependencyEdge:
    """A local dependency edge discovered by import analysis."""

    source: str
    target: str


@dataclass(frozen=True)
class BuildResult:
    """Completed Markdown prompt and metrics."""

    markdown: str
    tokens: int
    files_scanned: int
    priority_counts: dict[str, int]
    dependency_nodes: list[DependencyNode]
    dependency_edges: list[DependencyEdge]
    compression_warning: str | None = None
