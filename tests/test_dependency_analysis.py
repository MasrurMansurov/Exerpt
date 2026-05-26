from __future__ import annotations

from pathlib import Path

from codepact.graph import DependencyAnalyzer
from codepact.models import Priority, SourceFile
from codepact.ranker import SmartRanker


def test_python_and_typescript_imports_build_dependency_graph():
    files = [
        SourceFile(
            path=Path("src/app.py"),
            relative_path="src/app.py",
            text="from .db import connect\nconnect()\n",
        ),
        SourceFile(
            path=Path("src/db.py"),
            relative_path="src/db.py",
            text="def connect():\n    return 'database connection'\n",
        ),
        SourceFile(
            path=Path("web/index.ts"),
            relative_path="web/index.ts",
            text="import { connect } from './client'\nconnect()\n",
        ),
        SourceFile(
            path=Path("web/client.ts"),
            relative_path="web/client.ts",
            text="export function connect() { return fetch('/db') }\n",
        ),
    ]

    graph = DependencyAnalyzer().analyze(files)

    assert graph.has_edge("src/app.py", "src/db.py")
    assert graph.has_edge("web/index.ts", "web/client.ts")


def test_ranker_promotes_files_close_to_task_matches_in_graph():
    files = [
        SourceFile(
            path=Path("src/app.py"),
            relative_path="src/app.py",
            text="from .db import connect\nconnect()\n",
        ),
        SourceFile(
            path=Path("src/db.py"),
            relative_path="src/db.py",
            text="def connect():\n    return 'database connection'\n",
        ),
        SourceFile(
            path=Path("src/theme.py"),
            relative_path="src/theme.py",
            text="COLORS = ['blue']\n",
        ),
    ]
    graph = DependencyAnalyzer().analyze(files)

    ranked = SmartRanker().rank(files, graph, "fix database connection")
    priorities = {item.source.relative_path: item.priority for item in ranked}

    assert priorities["src/db.py"] is Priority.HIGH
    assert priorities["src/app.py"] is Priority.HIGH
    assert priorities["src/theme.py"] is Priority.LOW
