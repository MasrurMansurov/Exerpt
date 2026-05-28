"""Graph-aware task relevance ranking."""

from __future__ import annotations

import re
from math import exp, log1p
from pathlib import Path
from typing import cast

import networkx as nx  # type: ignore[import-untyped]

from codepact.language import (
    FileCategory,
    detect_language,
    file_category,
    is_android_source_path,
    is_config_exception,
    is_source_code,
)
from codepact.models import Priority, RankedFile, SourceFile


class SmartRanker:
    """Assign file priority using task relevance, graph position, and file role."""

    min_context_score = 0.3
    large_file_without_match_bytes = 20_000

    stop_words = {
        "a",
        "an",
        "and",
        "fix",
        "for",
        "from",
        "in",
        "of",
        "on",
        "the",
        "to",
        "with",
    }

    def rank(self, files: list[SourceFile], graph: nx.DiGraph, task: str) -> list[RankedFile]:
        task_terms = self.task_terms(task)
        lexical_scores = {
            source.relative_path: self._lexical_score(source, task_terms) for source in files
        }
        seeds = {path for path, score in lexical_scores.items() if score > 0}
        if not seeds:
            seeds = self._fallback_entrypoints(files)

        distances = self._graph_distances(graph, seeds)
        centrality_scores = self._incoming_centrality(graph)
        ranked: list[RankedFile] = []
        final_scores: dict[str, float] = {}

        for source in files:
            path = source.relative_path
            if not source.detected_language or source.detected_language == "unknown":
                source.detected_language = detect_language(path)
            score = lexical_scores.get(path, 0)
            distance = distances.get(path)
            centrality = centrality_scores.get(path, 0.0)
            final_score = self._importance_score(source, score, centrality, distance)
            role_boost = self._file_role_boost(source, task_terms)
            final_score += role_boost
            boilerplate_penalty = self._has_boilerplate_penalty(source, score)
            if boilerplate_penalty:
                final_score *= 0.35
            config_limited = self._is_config_limited(source, task_terms)
            if config_limited:
                final_score = self._config_limited_score(final_score, score)
            final_scores[path] = final_score
            if self._should_drop(source, final_score, score):
                continue

            priority = self._priority_for(
                source,
                final_score,
                score,
                centrality,
                distance,
                boilerplate_penalty,
                config_limited,
            )
            reason = self._reason_for(
                source,
                task_terms,
                score,
                centrality,
                distance,
                final_score,
                boilerplate_penalty,
                config_limited,
            )
            ranked.append(
                RankedFile(
                    source=source,
                    priority=priority,
                    reason=reason,
                    lexical_score=score,
                    graph_distance=distance,
                    importance_score=final_score,
                )
            )

        priority_order = {Priority.HIGH: 0, Priority.MEDIUM: 1, Priority.LOW: 2}
        return sorted(
            ranked,
            key=lambda item: (
                priority_order[item.priority],
                item.graph_distance if item.graph_distance is not None else 99,
                -final_scores[item.source.relative_path],
                -item.lexical_score,
                item.source.relative_path,
            ),
        )

    def task_terms(self, task: str) -> set[str]:
        words = {word.lower() for word in re.findall(r"[A-Za-z0-9_]+", task)}
        return {word for word in words if len(word) > 2 and word not in self.stop_words}

    def _lexical_score(self, source: SourceFile, task_terms: set[str]) -> int:
        haystack = f"{source.relative_path}\n{source.text[:50_000]}".lower()
        return sum(haystack.count(term) for term in task_terms)

    def _graph_distances(self, graph: nx.DiGraph, seeds: set[str]) -> dict[str, int]:
        if not seeds:
            return {}

        undirected = graph.to_undirected()
        valid_seeds = [seed for seed in seeds if seed in undirected]
        if not valid_seeds:
            return {}

        distances: dict[str, int] = {}
        for seed in valid_seeds:
            seed_distances = cast(
                dict[str, int],
                nx.single_source_shortest_path_length(undirected, seed),
            )
            for node, distance in seed_distances.items():
                distances[node] = min(distance, distances.get(node, distance))

        return distances

    def _incoming_centrality(self, graph: nx.DiGraph) -> dict[str, float]:
        if graph.number_of_nodes() <= 1:
            return {node: 0.0 for node in graph.nodes}

        return cast(dict[str, float], nx.in_degree_centrality(graph))

    def _importance_score(
        self,
        source: SourceFile,
        lexical_score: int,
        centrality: float,
        graph_distance: int | None,
    ) -> float:
        lexical_component = 0.0
        if lexical_score > 0:
            lexical_component = 1.0 + min(2.5, log1p(lexical_score) * 1.4)

        centrality_component = centrality * 1.6 * self._distance_decay(graph_distance)
        proximity_component = self._proximity_score(graph_distance)
        entrypoint_component = 0.2 if self._is_entrypoint(source) else 0.0

        return lexical_component + centrality_component + proximity_component + entrypoint_component

    def _distance_decay(self, graph_distance: int | None) -> float:
        if graph_distance is None:
            return 0.25
        if graph_distance <= 1:
            return 1.0
        return exp(-1.25 * (graph_distance - 1))

    def _proximity_score(self, graph_distance: int | None) -> float:
        if graph_distance is None:
            return 0.0
        if graph_distance <= 1:
            return 0.85
        return 0.85 * exp(-1.25 * (graph_distance - 1))

    def _priority_for(
        self,
        source: SourceFile,
        final_score: float,
        lexical_score: int,
        centrality: float,
        graph_distance: int | None,
        boilerplate_penalty: bool,
        config_limited: bool,
    ) -> Priority:
        if config_limited:
            return Priority.MEDIUM if lexical_score > 0 and final_score >= 0.45 else Priority.LOW
        if boilerplate_penalty:
            return Priority.MEDIUM if final_score >= 0.45 else Priority.LOW

        is_task_match = lexical_score > 0
        is_central = centrality >= 0.25
        is_near_entrypoint = self._is_entrypoint(source) and graph_distance in {0, 1}

        if final_score >= 1.0 and (is_task_match or is_central or is_near_entrypoint):
            return Priority.HIGH
        if final_score >= 0.45:
            return Priority.MEDIUM
        return Priority.LOW

    def _reason_for(
        self,
        source: SourceFile,
        task_terms: set[str],
        lexical_score: int,
        centrality: float,
        graph_distance: int | None,
        final_score: float,
        boilerplate_penalty: bool,
        config_limited: bool,
    ) -> str:
        parts: list[str] = []
        if lexical_score > 0:
            parts.append(f"task keyword match ({lexical_score})")
        if centrality >= 0.25:
            parts.append(f"inbound centrality {centrality:.2f}")
        if graph_distance is not None:
            parts.append(f"dependency graph distance {graph_distance}")
        if is_android_source_path(source.relative_path):
            parts.append("Android source boost")
        elif is_source_code(source.relative_path):
            parts.append("source file boost")
        if is_config_exception(source.relative_path, task_terms):
            parts.append("task-relevant config")
        if boilerplate_penalty:
            parts.append("boilerplate penalty")
        if config_limited:
            parts.append("config/data priority cap")

        if not parts:
            parts.append("background context")
        parts.append(f"score {final_score:.2f}")
        return "; ".join(parts)

    def _file_role_boost(self, source: SourceFile, task_terms: set[str]) -> float:
        boost = 0.0
        if is_source_code(source.relative_path):
            boost += 0.05
        if is_android_source_path(source.relative_path):
            boost += 0.45
        if is_config_exception(source.relative_path, task_terms):
            boost += 0.2
        return boost

    def _is_config_limited(self, source: SourceFile, task_terms: set[str]) -> bool:
        if file_category(source.relative_path) is not FileCategory.CONFIG_DATA:
            return False
        return not is_config_exception(source.relative_path, task_terms)

    def _config_limited_score(self, final_score: float, lexical_score: int) -> float:
        if lexical_score > 0:
            return min(final_score * 0.55, 0.95)
        return final_score * 0.2

    def _has_boilerplate_penalty(self, source: SourceFile, lexical_score: int) -> bool:
        return lexical_score == 0 and self._is_boilerplate(source)

    def _should_drop(self, source: SourceFile, final_score: float, lexical_score: int) -> bool:
        if final_score < self.min_context_score:
            return True
        return lexical_score == 0 and len(source.text.encode("utf-8")) > self.large_file_without_match_bytes

    def _is_boilerplate(self, source: SourceFile) -> bool:
        path = Path(source.relative_path)
        name = path.name.lower()
        return (name.startswith("test_") and name.endswith(".py")) or name in {
            "constants.py",
            "types.ts",
        }

    def _is_entrypoint(self, source: SourceFile) -> bool:
        path = Path(source.relative_path)
        name = path.name.lower()
        src_root_entrypoint = len(path.parts) == 2 and path.parts[0] == "src"
        return src_root_entrypoint or name in {
            "__main__.py",
            "app.tsx",
            "index.ts",
            "main.py",
        }

    def _fallback_entrypoints(self, files: list[SourceFile]) -> set[str]:
        entrypoint_names = {
            "__main__.py",
            "app.py",
            "cli.py",
            "index.js",
            "index.ts",
            "main.go",
            "main.py",
            "main.ts",
            "app.tsx",
            "server.js",
        }
        matches = {
            source.relative_path
            for source in files
            if Path(source.relative_path).name in entrypoint_names
        }
        if matches:
            return matches
        return {files[0].relative_path} if files else set()
