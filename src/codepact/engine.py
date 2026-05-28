"""Core Codepact orchestration engine."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Protocol

import networkx as nx  # type: ignore[import-untyped]

from codepact.graph import DependencyAnalyzer
from codepact.i18n import translate
from codepact.language import detect_language
from codepact.models import (
    BuildOptions,
    BuildResult,
    DependencyEdge,
    DependencyNode,
    RankedFile,
    RenderProfile,
    SourceFile,
)
from codepact.ranker import SmartRanker
from codepact.renderer import MarkdownRenderer
from codepact.scanner import ProjectScanner
from codepact.tokenizer import TokenCounter


@dataclass(frozen=True)
class RenderAttempt:
    """A rendered prompt candidate and its measured token count."""

    markdown: str
    tokens: int
    compression_warning: str | None


class Scanner(Protocol):
    """Scanner contract used by filesystem and in-memory sources."""

    def scan(self, root: Path, *, include_tests: bool = True) -> list[SourceFile]:
        """Return source files for the engine pipeline."""


class CodepactEngine:
    """Build a compact, task-oriented LLM context from a repository."""

    def __init__(
        self,
        *,
        scanner: Scanner | None = None,
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
        render_attempt = self._render_with_budget(ranked_files, dependency_graph, options)
        included_paths = {item.source.relative_path for item in ranked_files}

        return BuildResult(
            markdown=render_attempt.markdown,
            tokens=render_attempt.tokens,
            files_scanned=len(files),
            priority_counts=dict(Counter(item.priority.value for item in ranked_files)),
            dependency_nodes=[
                DependencyNode(
                    id=item.source.relative_path,
                    priority=item.priority.value,
                    detected_language=(
                        item.source.detected_language
                        if item.source.detected_language != "unknown"
                        else detect_language(item.source.relative_path)
                    ),
                )
                for item in ranked_files
            ],
            dependency_edges=[
                DependencyEdge(source=source, target=target)
                for source, target in dependency_graph.edges()
                if source in included_paths and target in included_paths
            ],
            compression_warning=render_attempt.compression_warning,
        )

    def _render_with_budget(
        self,
        ranked_files: list[RankedFile],
        dependency_graph: nx.DiGraph,
        options: BuildOptions,
    ) -> RenderAttempt:
        token_counter = TokenCounter(
            options.model,
            allow_approximate=options.allow_approximate_tokens,
        )

        full_high_profile = RenderProfile(
            include_medium=False,
            include_low=False,
            label="high-full-code",
        )
        full_high_attempt = self._try_render(
            ranked_files,
            dependency_graph,
            options,
            token_counter,
            full_high_profile,
            strategy="FullCode",
            compression_warning=None,
        )
        if full_high_attempt is not None:
            return self._fill_with_medium_code(
                ranked_files,
                dependency_graph,
                options,
                token_counter,
                full_high_profile,
                full_high_attempt,
                strategy="FullCode",
                compression_warning=None,
            )

        for max_lines in (180, 120, 80, 40):
            snipped_high_profile = RenderProfile(
                include_medium=False,
                include_low=False,
                high_render_mode="snippets",
                snippet_max_lines=max_lines,
                label=f"high-snipped-{max_lines}",
            )
            snipped_attempt = self._try_render(
                ranked_files,
                dependency_graph,
                options,
                token_counter,
                snipped_high_profile,
                strategy="Snipped",
                compression_warning=self._compression_warning(options),
            )
            if snipped_attempt is not None:
                return self._fill_with_medium_code(
                    ranked_files,
                    dependency_graph,
                    options,
                    token_counter,
                    snipped_high_profile,
                    snipped_attempt,
                    strategy="Snipped",
                    compression_warning=self._compression_warning(options),
                )

        high_count = self._priority_count(ranked_files, "high")
        for max_lines in (80, 40, 20):
            for file_count in range(max(high_count - 1, 0), 0, -1):
                profile = RenderProfile(
                    include_medium=False,
                    include_low=False,
                    high_full_limit=file_count,
                    high_render_mode="snippets",
                    snippet_max_lines=max_lines,
                    label=f"top-{file_count}-high-snipped-{max_lines}",
                )
                attempt = self._try_render(
                    ranked_files,
                    dependency_graph,
                    options,
                    token_counter,
                    profile,
                    strategy="Snipped",
                    compression_warning=self._compression_warning(options),
                )
                if attempt is not None:
                    return attempt

        return self._render_emergency_context(
            ranked_files,
            dependency_graph,
            options,
            token_counter,
        )

    def _render_emergency_context(
        self,
        ranked_files: list[RankedFile],
        dependency_graph: nx.DiGraph,
        options: BuildOptions,
        token_counter: TokenCounter,
    ) -> RenderAttempt:
        warning = self._compression_warning(options)
        for max_lines in (40, 24, 12, 6):
            for file_count in range(min(3, len(ranked_files)), 0, -1):
                profile = RenderProfile(
                    include_medium=False,
                    include_low=False,
                    high_full_limit=file_count,
                    high_render_mode="snippets",
                    snippet_max_lines=max_lines,
                    minimal=True,
                    label="emergency-code",
                )
                attempt = self._try_render(
                    ranked_files,
                    dependency_graph,
                    options,
                    token_counter,
                    profile,
                    strategy="Snipped",
                    compression_warning=warning,
                )
                if attempt is not None:
                    return attempt

        markdown = self._emergency_markdown(options)
        markdown, tokens = self._with_debug_metadata(markdown, options, token_counter, "Snipped")
        if tokens <= options.token_limit:
            return RenderAttempt(markdown=markdown, tokens=tokens, compression_warning=warning)

        return RenderAttempt(markdown="", tokens=0, compression_warning=warning)

    def _emergency_markdown(self, options: BuildOptions) -> str:
        lines = [
            f"# {translate(options.locale, 'codepact_context')}",
            "",
            f"{translate(options.locale, 'task')}: {options.task}",
            translate(options.locale, "emergency_compressed"),
            "",
            "```text",
            f"[{translate(options.locale, 'code_omitted')}]",
            "```",
        ]
        return "\n".join(lines)

    def _try_render(
        self,
        ranked_files: list[RankedFile],
        dependency_graph: nx.DiGraph,
        options: BuildOptions,
        token_counter: TokenCounter,
        profile: RenderProfile,
        *,
        strategy: str,
        compression_warning: str | None,
    ) -> RenderAttempt | None:
        markdown = self.renderer.render(ranked_files, dependency_graph, options, profile)
        markdown, tokens = self._with_debug_metadata(markdown, options, token_counter, strategy)
        if tokens <= options.token_limit:
            return RenderAttempt(
                markdown=markdown,
                tokens=tokens,
                compression_warning=compression_warning,
            )
        return None

    def _fill_with_medium_code(
        self,
        ranked_files: list[RankedFile],
        dependency_graph: nx.DiGraph,
        options: BuildOptions,
        token_counter: TokenCounter,
        base_profile: RenderProfile,
        base_attempt: RenderAttempt,
        *,
        strategy: str,
        compression_warning: str | None,
    ) -> RenderAttempt:
        if base_attempt.tokens >= options.token_limit * 0.5:
            return base_attempt

        best_attempt = base_attempt
        medium_count = self._priority_count(ranked_files, "medium")
        for medium_limit in range(1, medium_count + 1):
            profile = replace(
                base_profile,
                include_medium=True,
                medium_file_limit=medium_limit,
                medium_full_limit=medium_limit,
                include_low=False,
                minimal=False,
                label=f"{base_profile.label}-medium-{medium_limit}",
            )
            attempt = self._try_render(
                ranked_files,
                dependency_graph,
                options,
                token_counter,
                profile,
                strategy=strategy,
                compression_warning=compression_warning,
            )
            if attempt is None:
                break

            best_attempt = attempt
            if attempt.tokens >= options.token_limit * 0.75:
                break

        return best_attempt

    def _with_debug_metadata(
        self,
        markdown: str,
        options: BuildOptions,
        token_counter: TokenCounter,
        strategy: str,
    ) -> tuple[str, int]:
        used = token_counter.count(markdown)
        rendered = markdown
        for _ in range(6):
            strategy_key = "strategy_full_code" if strategy == "FullCode" else "strategy_snipped"
            debug_line = translate(
                options.locale,
                "debug",
                budget=options.token_limit,
                used=used,
                strategy=translate(options.locale, strategy_key),
            )
            rendered = (
                f"{markdown.rstrip()}\n\n"
                f"{debug_line}\n"
            )
            next_used = token_counter.count(rendered)
            if next_used == used:
                return rendered, next_used
            used = next_used
        return rendered, used

    def _priority_count(self, ranked_files: list[RankedFile], priority: str) -> int:
        return sum(1 for item in ranked_files if item.priority.value == priority)

    def _compression_warning(self, options: BuildOptions) -> str:
        limit = self._format_token_limit(options.token_limit)
        return translate(options.locale, "compression_warning", limit=limit)

    def _format_token_limit(self, token_limit: int) -> str:
        if token_limit >= 1000 and token_limit % 1000 == 0:
            return f"{token_limit // 1000}k"
        return f"{token_limit:,} tokens"
