"""Markdown prompt renderer."""

from __future__ import annotations

from collections.abc import Mapping

import networkx as nx  # type: ignore[import-untyped]

from exerpt.i18n import translate
from exerpt.language import detect_language
from exerpt.models import BuildOptions, Priority, RankedFile, RenderProfile
from exerpt.sifter import CodeSifter


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
        included_files = self._included_files(ranked_files, profile)
        included_paths = {item.source.relative_path for item in included_files}
        if profile.minimal:
            return self.render_minimal(included_files, options, profile)

        project_map = translate(options.locale, "project_map")
        task_context = translate(options.locale, "task_context")
        in_depth_code = translate(options.locale, "in_depth_code")
        system_instructions = translate(options.locale, "system_instructions")
        lines: list[str] = [
            f"# {translate(options.locale, 'exerpt_context')}",
            "",
            f"## {translate(options.locale, 'table_of_contents')}",
            "",
            f"- [{project_map}](#project-map)",
            f"- [{task_context}](#task-context)",
            f"- [{in_depth_code}](#in-depth-code)",
            f"- [{system_instructions}](#system-instructions)",
            "",
            "---",
            "",
            '<a id="project-map"></a>',
            "",
            f"## {project_map}",
            "",
            "| "
            f"{translate(options.locale, 'priority')} | "
            f"{translate(options.locale, 'file')} | "
            f"{translate(options.locale, 'detected_language')} | "
            f"{translate(options.locale, 'reason')} | "
            f"{translate(options.locale, 'graph_distance')} | "
            f"{translate(options.locale, 'local_dependencies')} |",
            "| --- | --- | --- | --- | --- | --- |",
        ]

        for item in included_files:
            dependencies = self._dependencies_for(
                graph,
                item.source.relative_path,
                included_paths,
                options.locale,
            )
            distance = (
                str(item.graph_distance)
                if item.graph_distance is not None
                else translate(options.locale, "not_available")
            )
            detected_language = self._detected_language(item)
            lines.append(
                "| "
                f"{item.priority.value.upper()} | "
                f"`{item.source.relative_path}` | "
                f"{detected_language} | "
                f"{self._localized_reason(item, options.locale)} | "
                f"{distance} | "
                f"{dependencies} |"
            )

        priority_counts = self._priority_counts(included_files)
        lines.extend(
            [
                "",
                "---",
                "",
                '<a id="task-context"></a>',
                "",
                f"## {task_context}",
                "",
                f"- {translate(options.locale, 'task')}: {options.task}",
                f"- {translate(options.locale, 'token_budget')}: {options.token_limit:,}",
                f"- {translate(options.locale, 'model_tokenizer')}: {options.model}",
                f"- {translate(options.locale, 'files_ranked_high')}: {priority_counts.get(Priority.HIGH, 0)}",
                f"- {translate(options.locale, 'files_ranked_medium')}: {priority_counts.get(Priority.MEDIUM, 0)}",
                f"- {translate(options.locale, 'files_ranked_low')}: {priority_counts.get(Priority.LOW, 0)}",
                "",
                "---",
                "",
                '<a id="in-depth-code"></a>',
                "",
                f"## {in_depth_code}",
                "",
            ]
        )

        for priority in (Priority.HIGH, Priority.MEDIUM, Priority.LOW):
            lines.extend(self._render_priority_group(included_files, priority, options, profile))

        lines.extend(
            [
                "---",
                "",
                '<a id="system-instructions"></a>',
                "",
                f"## {system_instructions}",
                "",
                translate(options.locale, "system_instruction_body"),
                "",
            ]
        )

        return "\n".join(lines)

    def render_minimal(
        self,
        ranked_files: list[RankedFile],
        options: BuildOptions,
        profile: RenderProfile,
    ) -> str:
        lines = [
            f"# {translate(options.locale, 'exerpt_context')}",
            "",
            f"{translate(options.locale, 'task')}: {options.task}",
            translate(options.locale, "minimal_compressed"),
            "",
        ]
        for item in ranked_files[:3]:
            content = self.sifter.smart_snippet(
                item.source,
                options.task,
                max_lines=profile.snippet_max_lines,
            )
            lines.extend(self._render_file_block(item, content, options.locale))
        return "\n".join(lines)

    def _render_priority_group(
        self,
        ranked_files: list[RankedFile],
        priority: Priority,
        options: BuildOptions,
        profile: RenderProfile,
    ) -> list[str]:
        group = [item for item in ranked_files if item.priority is priority]
        if not group:
            return []

        if priority is Priority.LOW:
            return self._render_low_summary_group(group, options.locale)

        lines = [
            f"### {translate(options.locale, 'priority_heading', priority=priority.value.upper())}",
            "",
        ]
        full_medium_paths = self._full_medium_paths(group, profile) if priority is Priority.MEDIUM else set()
        for item in group:
            if priority is Priority.HIGH:
                if profile.high_render_mode == "snippets":
                    content = self.sifter.smart_snippet(
                        item.source,
                        options.task,
                        max_lines=profile.snippet_max_lines,
                    )
                else:
                    content = self.sifter.strip_comments_and_blank_lines(item.source)
            elif item.source.relative_path in full_medium_paths:
                content = self.sifter.strip_comments_and_blank_lines(item.source)
            elif self._should_render_code(item, priority, profile):
                content = self.sifter.strip_comments_and_blank_lines(item.source)
            else:
                content = self.sifter.signature_only(item.source)
            lines.extend(self._render_file_block(item, content, options.locale))

        return lines

    def _render_low_summary_group(self, group: list[RankedFile], locale: str = "en") -> list[str]:
        if not group:
            return []

        lines = [f"### {translate(locale, 'priority_heading', priority='LOW')}", ""]
        for item in group:
            lines.append(f"- `{item.source.relative_path}`: {self.sifter.summarize(item.source)}.")
        lines.append("")
        return lines

    def _render_file_block(self, item: RankedFile, content: str, locale: str = "en") -> list[str]:
        detected_language = self._detected_language(item)
        language = self._markdown_language(detected_language)
        summary = self.sifter.summarize(item.source)
        distance = (
            item.graph_distance if item.graph_distance is not None else translate(locale, "not_available")
        )
        return [
            f"#### `{item.source.relative_path}`",
            "",
            f"- {translate(locale, 'detected_language')}: {detected_language}",
            f"- {translate(locale, 'reason')}: {self._localized_reason(item, locale)}",
            f"- {translate(locale, 'graph_distance')}: {distance}",
            f"- {translate(locale, 'summary')}: {summary}",
            "",
            f"```{language}",
            content,
            "```",
            "",
            "---",
            "",
        ]

    def _dependencies_for(
        self,
        graph: nx.DiGraph,
        relative_path: str,
        included_paths: set[str],
        locale: str = "en",
    ) -> str:
        if relative_path not in graph:
            return translate(locale, "none")
        dependencies = sorted(
            dependency for dependency in graph.successors(relative_path) if dependency in included_paths
        )
        if not dependencies:
            return translate(locale, "none")
        return ", ".join(f"`{dependency}`" for dependency in dependencies[:6])

    def _localized_reason(self, item: RankedFile, locale: str) -> str:
        if item.reason_codes:
            return "; ".join(self._localized_rank_reason(reason.code, reason.metadata, locale) for reason in item.reason_codes)

        reason = item.reason
        if locale == "en":
            return reason
        replacements = {
            "task keyword match": {
                "ru": "совпадение с ключевыми словами задачи",
                "zh": "任务关键词匹配",
                "ja": "タスクキーワード一致",
                "hi": "टास्क keyword match",
            },
            "inbound centrality": {
                "ru": "входящая центральность",
                "zh": "入向中心性",
                "ja": "入力中心性",
                "hi": "inbound centrality",
            },
            "dependency graph distance": {
                "ru": "дистанция в графе зависимостей",
                "zh": "依赖图距离",
                "ja": "依存グラフ距離",
                "hi": "dependency graph दूरी",
            },
            "Android source boost": {
                "ru": "бонус Android-исходника",
                "zh": "Android 源码加权",
                "ja": "Android ソース加点",
                "hi": "Android source boost",
            },
            "source file boost": {
                "ru": "бонус исходного файла",
                "zh": "源码文件加权",
                "ja": "ソースファイル加点",
                "hi": "source file boost",
            },
            "task-relevant config": {
                "ru": "конфиг относится к задаче",
                "zh": "任务相关配置",
                "ja": "タスク関連設定",
                "hi": "task-relevant config",
            },
            "boilerplate penalty": {
                "ru": "штраф за boilerplate",
                "zh": "样板代码惩罚",
                "ja": "boilerplate ペナルティ",
                "hi": "boilerplate penalty",
            },
            "config/data priority cap": {
                "ru": "ограничение приоритета для config/data",
                "zh": "配置/数据优先级上限",
                "ja": "config/data 優先度上限",
                "hi": "config/data priority cap",
            },
            "background context": {
                "ru": "фоновый контекст",
                "zh": "背景上下文",
                "ja": "背景コンテキスト",
                "hi": "background context",
            },
            "score": {
                "ru": "оценка",
                "zh": "分数",
                "ja": "スコア",
                "hi": "score",
            },
        }
        localized = reason
        locale_replacements = {key: value.get(locale, key) for key, value in replacements.items()}
        for source, target in locale_replacements.items():
            localized = localized.replace(source, target)
        return localized

    def _localized_rank_reason(self, code: str, metadata: Mapping[str, object], locale: str) -> str:
        values = {
            "matches": metadata.get("matches", 0),
            "centrality": metadata.get("centrality", 0),
            "distance": metadata.get("distance", translate(locale, "not_available")),
            "final_score": metadata.get("final_score", 0),
        }
        return translate(locale, f"rank_reason_{code.lower()}", **values)

    def _included_files(
        self,
        ranked_files: list[RankedFile],
        profile: RenderProfile,
    ) -> list[RankedFile]:
        included: list[RankedFile] = []
        high_count = 0
        medium_count = 0
        for item in ranked_files:
            if (
                profile.min_importance_score is not None
                and item.importance_score < profile.min_importance_score
            ):
                continue
            if item.priority is Priority.HIGH and profile.high_full_limit is not None:
                if high_count >= profile.high_full_limit:
                    continue
                high_count += 1
            if item.priority is Priority.LOW and not profile.include_low:
                continue
            if item.priority is Priority.MEDIUM:
                if not profile.include_medium:
                    continue
                if profile.medium_file_limit is not None and medium_count >= profile.medium_file_limit:
                    continue
                medium_count += 1
            included.append(item)
        return included

    def _full_medium_paths(
        self,
        medium_files: list[RankedFile],
        profile: RenderProfile,
    ) -> set[str]:
        if profile.medium_full_limit <= 0:
            return set()
        return {
            item.source.relative_path
            for item in medium_files[: profile.medium_full_limit]
        }

    def _should_render_code(
        self,
        item: RankedFile,
        priority: Priority,
        profile: RenderProfile,
    ) -> bool:
        if priority is Priority.HIGH:
            return True
        return (
            profile.full_code_score_threshold is not None
            and item.importance_score >= profile.full_code_score_threshold
        )

    def _priority_counts(self, ranked_files: list[RankedFile]) -> dict[Priority, int]:
        counts = {Priority.HIGH: 0, Priority.MEDIUM: 0, Priority.LOW: 0}
        for item in ranked_files:
            counts[item.priority] += 1
        return counts

    def _detected_language(self, item: RankedFile) -> str:
        if item.source.detected_language and item.source.detected_language != "unknown":
            return item.source.detected_language
        return detect_language(item.source.relative_path)

    def _markdown_language(self, detected_language: str) -> str:
        return {
            "c": "c",
            "cpp": "cpp",
            "csharp": "csharp",
            "dart": "dart",
            "dockerfile": "dockerfile",
            "go": "go",
            "gradle": "gradle",
            "ini": "ini",
            "java": "java",
            "javascript": "javascript",
            "json": "json",
            "kotlin": "kotlin",
            "lockfile": "",
            "markdown": "markdown",
            "php": "php",
            "python": "python",
            "ruby": "ruby",
            "rust": "rust",
            "swift": "swift",
            "toml": "toml",
            "typescript": "typescript",
            "xml": "xml",
            "yaml": "yaml",
        }.get(detected_language, "")
