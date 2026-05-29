from __future__ import annotations

from pathlib import Path

from exerpt.graph import DependencyAnalyzer
from exerpt.models import Priority, SourceFile
from exerpt.ranker import SmartRanker
from exerpt.scanner import ProjectScanner
from exerpt.sifter import CodeSifter


def test_generic_parser_skeletonizes_kotlin_without_body_or_comments():
    source = SourceFile(
        path=Path("app/src/main/kotlin/com/example/MainActivity.kt"),
        relative_path="app/src/main/kotlin/com/example/MainActivity.kt",
        text=(
            "package com.example\n"
            "// implementation comment\n"
            "class MainActivity : Activity() {\n"
            "    fun onCreate(savedInstanceState: Bundle?) {\n"
            "        setContentView(R.layout.main)\n"
            "    }\n"
            "}\n"
        ),
    )

    focused = CodeSifter().signature_only(source)

    assert source.detected_language == "kotlin"
    assert "class MainActivity" in focused
    assert "fun onCreate" in focused
    assert "setContentView" not in focused
    assert "implementation comment" not in focused


def test_generic_parser_handles_unknown_language_structs_and_functions():
    source = SourceFile(
        path=Path("src/widget.zig"),
        relative_path="src/widget.zig",
        text=(
            "const Widget = struct {\n"
            "    name: []const u8,\n"
            "};\n"
            "pub fn render(value: i32) void {\n"
            "    expensiveRender(value);\n"
            "}\n"
        ),
    )

    focused = CodeSifter().signature_only(source)

    assert source.detected_language == "unknown"
    assert "const Widget = struct" in focused
    assert "pub fn render" in focused
    assert "expensiveRender" not in focused


def test_scanner_ignores_android_project_trash(tmp_path: Path):
    keep = tmp_path / "app/src/main/kotlin/com/example/MainActivity.kt"
    keep.parent.mkdir(parents=True)
    keep.write_text("class MainActivity\n", encoding="utf-8")

    for ignored in (
        tmp_path / ".idea/workspace.xml",
        tmp_path / ".gradle/cache.bin",
        tmp_path / "app/build/generated/BuildConfig.kt",
        tmp_path / "app/src/main/res/raw/sample.json",
    ):
        ignored.parent.mkdir(parents=True, exist_ok=True)
        ignored.write_text("ignored", encoding="utf-8")

    files = ProjectScanner().scan(tmp_path)

    assert [file.relative_path for file in files] == [
        "app/src/main/kotlin/com/example/MainActivity.kt"
    ]
    assert files[0].detected_language == "kotlin"


def test_polyglot_imports_build_edges_for_kotlin_and_java():
    files = [
        SourceFile(
            path=Path("app/src/main/kotlin/com/example/MainActivity.kt"),
            relative_path="app/src/main/kotlin/com/example/MainActivity.kt",
            text="import com.example.core.Router\nclass MainActivity\n",
        ),
        SourceFile(
            path=Path("app/src/main/java/com/example/core/Router.java"),
            relative_path="app/src/main/java/com/example/core/Router.java",
            text="package com.example.core;\npublic class Router {}\n",
        ),
    ]

    graph = DependencyAnalyzer().analyze(files)

    assert graph.has_edge(
        "app/src/main/kotlin/com/example/MainActivity.kt",
        "app/src/main/java/com/example/core/Router.java",
    )


def test_config_files_are_capped_unless_task_targets_config():
    files = [
        SourceFile(
            path=Path("src/app.py"),
            relative_path="src/app.py",
            text="# checkout flow\n",
        ),
        SourceFile(
            path=Path("package.json"),
            relative_path="package.json",
            text='{"checkout": {"enabled": true}}\n',
        ),
        SourceFile(
            path=Path("app/src/main/AndroidManifest.xml"),
            relative_path="app/src/main/AndroidManifest.xml",
            text="<manifest><application android:label='Exerpt' /></manifest>\n",
        ),
    ]
    graph = DependencyAnalyzer().analyze(files)

    capped = SmartRanker().rank(files, graph, "checkout flow")
    capped_priorities = {item.source.relative_path: item.priority for item in capped}
    assert capped_priorities["package.json"] is not Priority.HIGH

    config_targeted = SmartRanker().rank(files, graph, "manifest layout config")
    config_priorities = {item.source.relative_path: item.priority for item in config_targeted}
    assert config_priorities["app/src/main/AndroidManifest.xml"] is Priority.HIGH
