"""Markdown prompt renderer."""

from __future__ import annotations

from pathlib import Path

import networkx as nx  # type: ignore[import-untyped]

from codepact.models import BuildOptions, Priority, RankedFile, RenderProfile
from codepact.sifter import CodeSifter


class MarkdownRenderer:
    """Render ranked files into a structured LLM prompt."""

    def __init__(self, sifter: CodeSifter | None = None) -> None:
        self.sifter = sifter or CodeSifter()

    def render(
        self,
        ranked_files: list[RankedFile],
        graph: nx.DiGraph,
        options: BuildOptions,
        profile: RenderProfile,
    ) -> str:
        lines: list[str] = [
            "# Codepact Context",
            "",
            "## Table of Contents",
            "",
            "- [Project Map](#project-map)",
            "- [Task Context](#task-context)",
            "- [In-depth Code](#in-depth-code)",
            "- [System Instructions](#system-instructions)",
            "",
            "---",
            "",
            "## Project Map",
            "",
            "| Priority | File | Reason | Graph Distance | Local Dependencies |",
            "| --- | --- | --- | --- | --- |",
        ]

        for item in ranked_files:
            dependencies = self._dependencies_for(graph, item.source.relative_path)
            distance = str(item.graph_distance) if item.graph_distance is not None else "n/a"
            lines.append(
                "| "
                f"{item.priority.value.upper()} | "
                f"`{item.source.relative_path}` | "
                f"{item.reason} | "
                f"{distance} | "
                f"{dependencies} |"
            )

        priority_counts = self._priority_counts(ranked_files)
        lines.extend(
            [
                "",
                "---",
                "",
                "## Task Context",
                "",
                f"- Task: {options.task}",
                f"- Token budget: {options.token_limit:,}",
                f"- Model tokenizer: {options.model}",
                f"- Files ranked high: {priority_counts.get(Priority.HIGH, 0)}",
                f"- Files ranked medium: {priority_counts.get(Priority.MEDIUM, 0)}",
                f"- Files ranked low: {priority_counts.get(Priority.LOW, 0)}",
                "",
                "---",
                "",
                "## In-depth Code",
                "",
            ]
        )

        for priority in (Priority.HIGH, Priority.MEDIUM, Priority.LOW):
            lines.extend(self._render_priority_group(ranked_files, priority, profile))

        lines.extend(
            [
                "---",
                "",
                "## System Instructions",
                "",
                "Use this sifted repository context to solve the task. Treat HIGH files as "
                "authoritative implementation detail, MEDIUM files as dependency contracts, "
                "and LOW files as compressed orientation. Do not assume omitted implementation "
                "details unless they follow directly from visible signatures, docstrings, "
                "imports, or dependency relationships.",
                "",
            ]
        )

        return "\n".join(lines)

    def _render_priority_group(
        self,
        ranked_files: list[RankedFile],
        priority: Priority,
        profile: RenderProfile,
    ) -> list[str]:
        group = [item for item in ranked_files if item.priority is priority]
        if not group:
            return []

        lines = [f"### {priority.value.upper()} Priority", ""]
        rendered_low = 0
        skipped_low = 0

        for item in group:
            if priority is Priority.LOW:
                if profile.low_file_limit is not None and rendered_low >= profile.low_file_limit:
                    skipped_low += 1
                    continue
                rendered_low += 1

            content = self.sifter.sift(
                item.source,
                priority,
                include_medium_code=profile.include_medium_code,
                include_low_code=profile.include_low_code,
            )
            lines.extend(self._render_file_block(item, content))

        if skipped_low:
            lines.append(f"_Skipped {skipped_low} low-priority files to fit the token budget._")
            lines.append("")

        return lines

    def _render_file_block(self, item: RankedFile, content: str) -> list[str]:
        language = self._markdown_language(item.source.path)
        summary = self.sifter.summarize(item.source)
        distance = item.graph_distance if item.graph_distance is not None else "n/a"
        return [
            f"#### `{item.source.relative_path}`",
            "",
            f"- Reason: {item.reason}",
            f"- Graph distance: {distance}",
            f"- Summary: {summary}",
            "",
            f"```{language}",
            content,
            "```",
            "",
            "---",
            "",
        ]

    def _dependencies_for(self, graph: nx.DiGraph, relative_path: str) -> str:
        if relative_path not in graph:
            return "none"
        dependencies = sorted(graph.successors(relative_path))
        if not dependencies:
            return "none"
        return ", ".join(f"`{dependency}`" for dependency in dependencies[:6])

    def _priority_counts(self, ranked_files: list[RankedFile]) -> dict[Priority, int]:
        counts = {Priority.HIGH: 0, Priority.MEDIUM: 0, Priority.LOW: 0}
        for item in ranked_files:
            counts[item.priority] += 1
        return counts

    def _markdown_language(self, path: Path) -> str:
        return {
            ".css": "css",
            ".go": "go",
            ".java": "java",
            ".js": "javascript",
            ".jsx": "jsx",
            ".json": "json",
            ".kt": "kotlin",
            ".md": "markdown",
            ".mjs": "javascript",
            ".php": "php",
            ".py": "python",
            ".rb": "ruby",
            ".rs": "rust",
            ".sh": "bash",
            ".sql": "sql",
            ".swift": "swift",
            ".ts": "typescript",
            ".tsx": "tsx",
            ".yaml": "yaml",
            ".yml": "yaml",
        }.get(path.suffix.lower(), "")
