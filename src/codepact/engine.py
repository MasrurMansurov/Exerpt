"""Core Codepact orchestration engine."""

from __future__ import annotations

from collections import Counter

import networkx as nx  # type: ignore[import-untyped]

from codepact.graph import DependencyAnalyzer
from codepact.models import (
    BuildOptions,
    BuildResult,
    RankedFile,
    RenderProfile,
    TokenBudgetExceeded,
)
from codepact.ranker import SmartRanker
from codepact.renderer import MarkdownRenderer
from codepact.scanner import ProjectScanner
from codepact.tokenizer import TokenCounter


class CodepactEngine:
    """Build a compact, task-oriented LLM context from a repository."""

    def __init__(
        self,
        *,
        scanner: ProjectScanner | None = None,
        dependency_analyzer: DependencyAnalyzer | None = None,
        ranker: SmartRanker | None = None,
        renderer: MarkdownRenderer | None = None,
    ) -> None:
        self.scanner = scanner or ProjectScanner()
        self.dependency_analyzer = dependency_analyzer or DependencyAnalyzer()
        self.ranker = ranker or SmartRanker()
        self.renderer = renderer or MarkdownRenderer()

    def build_prompt(self, options: BuildOptions) -> BuildResult:
        """Scan, analyze, rank, sift, render, and fit a Markdown prompt."""
        files = self.scanner.scan(options.root, include_tests=options.include_tests)
        dependency_graph = self.dependency_analyzer.analyze(files)
        ranked_files = self.ranker.rank(files, dependency_graph, options.task)
        markdown, tokens = self._render_with_budget(ranked_files, dependency_graph, options)

        return BuildResult(
            markdown=markdown,
            tokens=tokens,
            files_scanned=len(files),
            priority_counts=dict(Counter(item.priority.value for item in ranked_files)),
        )

    def _render_with_budget(
        self,
        ranked_files: list[RankedFile],
        dependency_graph: nx.DiGraph,
        options: BuildOptions,
    ) -> tuple[str, int]:
        token_counter = TokenCounter(options.model)
        low_count = sum(1 for item in ranked_files if item.priority.value == "low")
        profiles = [
            RenderProfile(include_medium_code=True, include_low_code=True, low_file_limit=low_count),
            RenderProfile(include_medium_code=True, include_low_code=True, low_file_limit=50),
            RenderProfile(include_medium_code=True, include_low_code=True, low_file_limit=20),
            RenderProfile(include_medium_code=False, include_low_code=True, low_file_limit=20),
            RenderProfile(include_medium_code=False, include_low_code=False, low_file_limit=0),
        ]

        last_tokens = 0
        for profile in profiles:
            markdown = self.renderer.render(ranked_files, dependency_graph, options, profile)
            tokens = token_counter.count(markdown)
            if tokens <= options.token_limit:
                return markdown, tokens
            last_tokens = tokens

        raise TokenBudgetExceeded(
            "minimum high-priority context is "
            f"{last_tokens:,} tokens, above the {options.token_limit:,} token limit"
        )
