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
    assert "src/theme.py" not in priorities


def test_ranker_promotes_inbound_central_files_near_task_matches():
    files = [
        SourceFile(
            path=Path("src/app.py"),
            relative_path="src/app.py",
            text="from .core import run\n# billing workflow starts here\n",
        ),
        SourceFile(
            path=Path("src/core.py"),
            relative_path="src/core.py",
            text="def run():\n    return None\n",
        ),
        SourceFile(
            path=Path("src/cli.py"),
            relative_path="src/cli.py",
            text="from .core import run\nrun()\n",
        ),
        SourceFile(
            path=Path("src/worker.py"),
            relative_path="src/worker.py",
            text="from .core import run\nrun()\n",
        ),
        SourceFile(
            path=Path("src/sidebar.py"),
            relative_path="src/sidebar.py",
            text="def paint():\n    return 'blue'\n",
        ),
    ]
    graph = DependencyAnalyzer().analyze(files)

    ranked = SmartRanker().rank(files, graph, "billing workflow")
    priorities = {item.source.relative_path: item.priority for item in ranked}

    assert priorities["src/app.py"] is Priority.HIGH
    assert priorities["src/core.py"] is Priority.HIGH
    assert priorities["src/cli.py"] is not Priority.HIGH
    assert priorities["src/worker.py"] is not Priority.HIGH
    assert "src/sidebar.py" not in priorities


def test_ranker_penalizes_boilerplate_without_direct_task_match():
    files = [
        SourceFile(
            path=Path("src/app.py"),
            relative_path="src/app.py",
            text="from .constants import FLAGS\n# checkout flow\n",
        ),
        SourceFile(
            path=Path("src/worker.py"),
            relative_path="src/worker.py",
            text="from .constants import FLAGS\n",
        ),
        SourceFile(
            path=Path("src/cli.py"),
            relative_path="src/cli.py",
            text="from .constants import FLAGS\n",
        ),
        SourceFile(
            path=Path("src/constants.py"),
            relative_path="src/constants.py",
            text="FLAGS = {'beta': True}\n",
        ),
    ]
    graph = DependencyAnalyzer().analyze(files)

    ranked = SmartRanker().rank(files, graph, "checkout flow")
    priorities = {item.source.relative_path: item.priority for item in ranked}

    assert priorities["src/app.py"] is Priority.HIGH
    assert priorities["src/constants.py"] is Priority.MEDIUM


def test_ranker_applies_exponential_decay_for_distant_dependencies():
    files = [
        SourceFile(
            path=Path("src/feature.py"),
            relative_path="src/feature.py",
            text="from .core.service import run\n# billing invoice workflow\n",
        ),
        SourceFile(
            path=Path("src/core/service.py"),
            relative_path="src/core/service.py",
            text="from .repository import load\n\ndef run():\n    return load()\n",
        ),
        SourceFile(
            path=Path("src/core/repository.py"),
            relative_path="src/core/repository.py",
            text="from .adapters.cache import get\n\ndef load():\n    return get()\n",
        ),
        SourceFile(
            path=Path("src/core/adapters/cache.py"),
            relative_path="src/core/adapters/cache.py",
            text="def get():\n    return {}\n",
        ),
    ]
    graph = DependencyAnalyzer().analyze(files)

    ranked = SmartRanker().rank(files, graph, "billing invoice")
    priorities = {item.source.relative_path: item.priority for item in ranked}
    distances = {item.source.relative_path: item.graph_distance for item in ranked}

    assert distances["src/core/repository.py"] == 2
    assert "src/core/adapters/cache.py" not in distances
    assert priorities["src/core/repository.py"] is not Priority.HIGH


def test_ranker_drops_large_files_without_direct_task_match():
    files = [
        SourceFile(
            path=Path("src/app.py"),
            relative_path="src/app.py",
            text="from .generated import DATA\n# billing workflow\n",
        ),
        SourceFile(
            path=Path("src/generated.py"),
            relative_path="src/generated.py",
            text="DATA = '" + ("x" * 21_000) + "'\n",
        ),
    ]
    graph = DependencyAnalyzer().analyze(files)

    ranked = SmartRanker().rank(files, graph, "billing workflow")
    priorities = {item.source.relative_path: item.priority for item in ranked}

    assert priorities["src/app.py"] is Priority.HIGH
    assert "src/generated.py" not in priorities
