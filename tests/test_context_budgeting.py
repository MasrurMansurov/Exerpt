from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import networkx as nx  # type: ignore[import-untyped]

from codepact.engine import CodepactEngine
from codepact.models import BuildOptions, Priority, RankedFile, RenderProfile, SourceFile
from codepact.renderer import MarkdownRenderer


class FakeEncoding:
    def encode(self, text: str) -> list[str]:
        return text.replace("\n", " \n ").split()


class FakeScanner:
    def __init__(self, files: list[SourceFile]) -> None:
        self.files = files

    def scan(self, root: Path, *, include_tests: bool = True) -> list[SourceFile]:
        return self.files


class FakeRanker:
    def __init__(self, ranked_files: list[RankedFile]) -> None:
        self.ranked_files = ranked_files

    def rank(
        self,
        files: list[SourceFile],
        graph: nx.DiGraph,
        task: str,
    ) -> list[RankedFile]:
        return self.ranked_files


def test_renderer_uses_skeleton_for_medium_and_summary_only_for_low():
    medium = SourceFile(
        path=Path("src/service.py"),
        relative_path="src/service.py",
        text=(
            "def connect(url: str) -> str:\n"
            "    \"\"\"Open connection.\"\"\"\n"
            "    password = 'secret'\n"
            "    return password\n"
        ),
    )
    low = SourceFile(
        path=Path("src/theme.py"),
        relative_path="src/theme.py",
        text="COLORS = ['blue']\n",
    )
    graph = nx.DiGraph()
    graph.add_nodes_from([medium.relative_path, low.relative_path])

    markdown = MarkdownRenderer().render(
        [
            RankedFile(source=medium, priority=Priority.MEDIUM, reason="near task"),
            RankedFile(source=low, priority=Priority.LOW, reason="background"),
        ],
        graph,
        BuildOptions(root=Path("."), task="connect", token_limit=8000, output=Path("out.md")),
        RenderProfile(),
    )

    assert "def connect(url: str) -> str:" in markdown
    assert "Open connection." in markdown
    assert "password = 'secret'" not in markdown
    assert "- `src/theme.py`: theme source file." in markdown
    assert "COLORS = ['blue']" not in markdown


def test_engine_auto_shrinks_to_final_markdown_token_limit(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    files = [
        SourceFile(
            path=Path(f"src/feature_{index}.py"),
            relative_path=f"src/feature_{index}.py",
            text="def run():\n    return 'billing " + ("detail " * 500) + "'\n",
        )
        for index in range(6)
    ]
    result = CodepactEngine(scanner=FakeScanner(files)).build_prompt(
        BuildOptions(
            root=Path("."),
            task="billing",
            token_limit=120,
            output=Path("out.md"),
            allow_approximate_tokens=True,
        )
    )

    assert result.tokens <= 120
    assert result.tokens == len(FakeEncoding().encode(result.markdown))
    assert result.compression_warning == "Aggressively compressed to fit 120 tokens limit"
    assert "```python" in result.markdown
    assert "def run():" in result.markdown
    assert "Strategy: Snipped" in result.markdown


def test_engine_keeps_high_priority_code_when_aggressively_compressed(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    files = [
        SourceFile(
            path=Path("src/navigation.py"),
            relative_path="src/navigation.py",
            text=(
                "def handle_navigation(intent):\n"
                "    startActivity(intent)\n"
                "    return intent\n"
            ),
        ),
        *[
            SourceFile(
                path=Path(f"src/noise_{index}.py"),
                relative_path=f"src/noise_{index}.py",
                text="def helper():\n    return '" + ("background " * 80) + "'\n",
            )
            for index in range(8)
        ],
    ]

    result = CodepactEngine(scanner=FakeScanner(files)).build_prompt(
        BuildOptions(
            root=Path("."),
            task="Explain navigation intent startActivity",
            token_limit=140,
            output=Path("out.md"),
            allow_approximate_tokens=True,
        )
    )

    assert result.tokens <= 140
    assert "```python" in result.markdown
    assert "def handle_navigation(intent):" in result.markdown
    assert "startActivity(intent)" in result.markdown
    assert "Strategy: Snipped" in result.markdown


def test_engine_fills_underused_budget_with_medium_full_code(monkeypatch):
    fake_tiktoken = SimpleNamespace(
        encoding_for_model=lambda requested_model: FakeEncoding(),
        get_encoding=lambda encoding_name: FakeEncoding(),
    )
    monkeypatch.setitem(sys.modules, "tiktoken", fake_tiktoken)

    high = SourceFile(
        path=Path("app/src/main/java/tj/paykar/paykar_service/MainActivity.kt"),
        relative_path="app/src/main/java/tj/paykar/paykar_service/MainActivity.kt",
        text=(
            "class MainActivity : Activity() {\n"
            "    fun openNavigation(intent: Intent) {\n"
            "        startActivity(intent)\n"
            "    }\n"
            "}\n"
        ),
    )
    medium_files = [
        SourceFile(
            path=Path(f"app/src/main/java/tj/paykar/paykar_service/DirectUserAdapter{index}.kt"),
            relative_path=f"app/src/main/java/tj/paykar/paykar_service/DirectUserAdapter{index}.kt",
            text=(
                f"class DirectUserAdapter{index} {{\n"
                "    fun bind() {\n"
                "        val payload = \""
                + ("adapter token " * 520)
                + "\"\n"
                "    }\n"
                "}\n"
            ),
        )
        for index in range(12)
    ]
    ranked_files = [
        RankedFile(
            source=high,
            priority=Priority.HIGH,
            reason="task keyword match",
            importance_score=2.5,
        ),
        *[
            RankedFile(
                source=file,
                priority=Priority.MEDIUM,
                reason="near navigation dependency",
                importance_score=0.9,
            )
            for file in medium_files
        ],
    ]

    result = CodepactEngine(
        scanner=FakeScanner([high, *medium_files]),
        ranker=FakeRanker(ranked_files),
    ).build_prompt(
        BuildOptions(
            root=Path("."),
            task="Explain how MainActivity handles user navigation",
            token_limit=8000,
            output=Path("out.md"),
            allow_approximate_tokens=True,
        )
    )

    assert result.tokens <= 8000
    assert result.tokens >= 5600
    assert "Strategy: FullCode" in result.markdown
    assert "[Debug] Budget: 8000, Used:" in result.markdown
    assert "```kotlin" in result.markdown
    assert "fun openNavigation(intent: Intent)" in result.markdown
    assert "class DirectUserAdapter0" in result.markdown
    assert "adapter token adapter token" in result.markdown


def test_renderer_smart_snips_large_high_priority_kotlin_file():
    source = SourceFile(
        path=Path("app/src/main/java/tj/paykar/paykar_service/MainActivity.kt"),
        relative_path="app/src/main/java/tj/paykar/paykar_service/MainActivity.kt",
        text=(
            "class MainActivity : Activity() {\n"
            "    fun renderDebugPanel() {\n"
            + "\n".join(f"        val debug{index} = {index}" for index in range(40))
            + "\n    }\n"
            "    fun openNavigation(intent: Intent) {\n"
            "        startActivity(intent)\n"
            "    }\n"
            "}\n"
        ),
    )
    item = RankedFile(
        source=source,
        priority=Priority.HIGH,
        reason="task keyword match",
        importance_score=2.4,
    )
    graph = nx.DiGraph()
    graph.add_node(source.relative_path)

    markdown = MarkdownRenderer().render(
        [item],
        graph,
        BuildOptions(
            root=Path("."),
            task="Explain navigation intent startActivity",
            token_limit=8000,
            output=Path("out.md"),
        ),
        RenderProfile(
            include_medium=False,
            include_low=False,
            high_render_mode="snippets",
            snippet_max_lines=20,
        ),
    )

    assert "```kotlin" in markdown
    assert "fun openNavigation(intent: Intent)" in markdown
    assert "startActivity(intent)" in markdown
    assert "renderDebugPanel" not in markdown
    assert "val debug39" not in markdown
