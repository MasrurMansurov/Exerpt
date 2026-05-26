"""Graph-aware task relevance ranking."""

from __future__ import annotations

import re
from pathlib import Path
from typing import cast

import networkx as nx  # type: ignore[import-untyped]

from codepact.models import Priority, RankedFile, SourceFile


class SmartRanker:
    """Assign file priority using task keywords and graph distance."""

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
        ranked: list[RankedFile] = []

        for source in files:
            score = lexical_scores.get(source.relative_path, 0)
            distance = distances.get(source.relative_path)
            priority = self._priority_for(score, distance)
            reason = self._reason_for(score, distance)
            ranked.append(
                RankedFile(
                    source=source,
                    priority=priority,
                    reason=reason,
                    lexical_score=score,
                    graph_distance=distance,
                )
            )

        priority_order = {Priority.HIGH: 0, Priority.MEDIUM: 1, Priority.LOW: 2}
        return sorted(
            ranked,
            key=lambda item: (
                priority_order[item.priority],
                item.graph_distance if item.graph_distance is not None else 99,
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

    def _priority_for(self, lexical_score: int, graph_distance: int | None) -> Priority:
        if lexical_score > 0 or graph_distance in {0, 1}:
            return Priority.HIGH
        if graph_distance == 2:
            return Priority.MEDIUM
        return Priority.LOW

    def _reason_for(self, lexical_score: int, graph_distance: int | None) -> str:
        if lexical_score > 0:
            return f"task keyword match ({lexical_score})"
        if graph_distance is not None:
            return f"dependency graph distance {graph_distance}"
        return "background context"

    def _fallback_entrypoints(self, files: list[SourceFile]) -> set[str]:
        entrypoint_names = {
            "__main__.py",
            "app.py",
            "cli.py",
            "index.js",
            "main.go",
            "main.py",
            "main.ts",
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
