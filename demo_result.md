<!-- Token note: generated with a local fallback tokenizer because tiktoken encoding cache was unavailable in this environment. -->

# Exerpt Context

## Table of Contents

- [Project Map](#project-map)
- [Task Context](#task-context)
- [In-depth Code](#in-depth-code)
- [System Instructions](#system-instructions)

---

## Project Map

| Priority | File | Reason | Graph Distance | Local Dependencies |
| --- | --- | --- | --- | --- |
| HIGH | `exerpt/ranker.py` | task keyword match (21) | 0 | `exerpt/models.py` |
| HIGH | `exerpt/engine.py` | task keyword match (19) | 0 | `exerpt/graph.py`, `exerpt/models.py`, `exerpt/ranker.py`, `exerpt/renderer.py`, `exerpt/scanner.py`, `exerpt/tokenizer.py` |
| HIGH | `exerpt/renderer.py` | task keyword match (17) | 0 | `exerpt/models.py`, `exerpt/sifter.py` |
| HIGH | `exerpt/graph.py` | task keyword match (14) | 0 | `exerpt/models.py` |
| HIGH | `exerpt/models.py` | task keyword match (2) | 0 | none |
| HIGH | `exerpt/cli.py` | dependency graph distance 1 | 1 | `exerpt/engine.py`, `exerpt/models.py` |
| HIGH | `exerpt/scanner.py` | dependency graph distance 1 | 1 | `exerpt/models.py` |
| HIGH | `exerpt/sifter.py` | dependency graph distance 1 | 1 | `exerpt/models.py` |
| HIGH | `exerpt/tokenizer.py` | dependency graph distance 1 | 1 | none |
| LOW | `exerpt/__init__.py` | background context | n/a | none |

---

## Task Context

- Task: Optimize dependency graph
- Token budget: 24,000
- Model tokenizer: gpt-4o-mini
- Files ranked high: 9
- Files ranked medium: 0
- Files ranked low: 1

---

## In-depth Code

### HIGH Priority

#### `exerpt/ranker.py`

- Reason: task keyword match (21)
- Graph distance: 0
- Summary: ranker; imports __future__, exerpt.models, networkx

```python
"""Graph-aware task relevance ranking."""
from __future__ import annotations
import re
from pathlib import Path
from typing import cast
import networkx as nx
from exerpt.models import Priority, RankedFile, SourceFile
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
```

---

#### `exerpt/engine.py`

- Reason: task keyword match (19)
- Graph distance: 0
- Summary: engine; imports __future__, exerpt.graph, exerpt.models

```python
"""Core Exerpt orchestration engine."""
from __future__ import annotations
from collections import Counter
import networkx as nx
from exerpt.graph import DependencyAnalyzer
from exerpt.models import (
    BuildOptions,
    BuildResult,
    RankedFile,
    RenderProfile,
    TokenBudgetExceeded,
)
from exerpt.ranker import SmartRanker
from exerpt.renderer import MarkdownRenderer
from exerpt.scanner import ProjectScanner
from exerpt.tokenizer import TokenCounter
class ExerptEngine:
    """Build a focused, task-oriented LLM context from a repository."""
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
```

---

#### `exerpt/renderer.py`

- Reason: task keyword match (17)
- Graph distance: 0
- Summary: renderer; imports __future__, exerpt.models, exerpt.sifter

```python
"""Markdown prompt renderer."""
from __future__ import annotations
from pathlib import Path
import networkx as nx
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
        lines: list[str] = [
            "# Exerpt Context",
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
```

---

#### `exerpt/graph.py`

- Reason: task keyword match (14)
- Graph distance: 0
- Summary: graph; imports __future__, ast, exerpt.models

```python
"""Dependency extraction and graph construction."""
from __future__ import annotations
import ast
import re
from pathlib import Path
import networkx as nx
from exerpt.models import SourceFile
class DependencyAnalyzer:
    """Build a directed local dependency graph from Python and JS/TS imports."""
    source_extensions = {
        ".py",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".mjs",
        ".cjs",
    }
    javascript_extensions = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
    def analyze(self, files: list[SourceFile]) -> nx.DiGraph:
        """Populate imports and return a graph with edges importer -> dependency."""
        by_relative = {source.relative_path: source for source in files}
        graph = nx.DiGraph()
        for source in files:
            source.imports = self.extract_imports(source)
            graph.add_node(source.relative_path, source=source)
        for source in files:
            for import_name in source.imports:
                target = self.resolve_import(import_name, source, by_relative)
                if target is not None:
                    graph.add_edge(source.relative_path, target.relative_path, import_name=import_name)
        return graph
    def extract_imports(self, source: SourceFile) -> set[str]:
        suffix = source.path.suffix.lower()
        if suffix == ".py":
            return self._extract_python_imports(source.text)
        if suffix in self.javascript_extensions:
            return self._extract_javascript_imports(source.text)
        return set()
    def resolve_import(
        self,
        import_name: str,
        source: SourceFile,
        by_relative: dict[str, SourceFile],
    ) -> SourceFile | None:
        if not import_name or import_name.startswith(("http://", "https://")):
            return None
        candidates = self._candidate_paths(import_name, source)
        for candidate in candidates:
            match = self._lookup_candidate(candidate, by_relative)
            if match is not None:
                return match
        return None
    def _extract_python_imports(self, text: str) -> set[str]:
        imports: set[str] = set()
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return imports
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                prefix = "." * node.level
                if node.module:
                    imports.add(f"{prefix}{node.module}")
                elif node.level:
                    imports.update(f"{prefix}{alias.name}" for alias in node.names)
        return imports
    def _extract_javascript_imports(self, text: str) -> set[str]:
        imports = set(re.findall(r"""from\s+["']([^"']+)["']""", text))
        imports.update(re.findall(r"""require\(\s*["']([^"']+)["']\s*\)""", text))
        imports.update(re.findall(r"""import\(\s*["']([^"']+)["']\s*\)""", text))
        imports.update(re.findall(r"""export\s+.+?\s+from\s+["']([^"']+)["']""", text))
        return imports
    def _candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        if source.path.suffix.lower() == ".py":
            return self._python_candidate_paths(import_name, source)
        return self._javascript_candidate_paths(import_name, source)
    def _python_candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        if import_name.startswith("."):
            level = len(import_name) - len(import_name.lstrip("."))
            remainder = import_name[level:].replace(".", "/")
            base = Path(source.relative_path).parent
            for _ in range(max(level - 1, 0)):
                base = base.parent
            module_path = base / remainder if remainder else base
        else:
            module_path = Path(import_name.replace(".", "/"))
        return self._expand_candidate(module_path, (".py",), include_index=True)
    def _javascript_candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        if import_name.startswith("."):
            module_path = Path(source.relative_path).parent / import_name
        elif import_name.startswith("/"):
            module_path = Path(import_name.lstrip("/"))
        else:
            module_path = Path(import_name)
        return self._expand_candidate(
            module_path,
            self.javascript_extensions,
            include_index=True,
        )
    def _expand_candidate(
        self,
        module_path: Path,
        extensions: tuple[str, ...],
        *,
        include_index: bool,
    ) -> list[str]:
        normalized = module_path.as_posix().removeprefix("./")
        candidates = [normalized]
        if Path(normalized).suffix:
            return candidates
        candidates.extend(f"{normalized}{extension}" for extension in extensions)
        if include_index:
            if ".py" in extensions:
                candidates.append(f"{normalized}/__init__.py")
            candidates.extend(f"{normalized}/index{extension}" for extension in extensions)
        return candidates
    def _lookup_candidate(
        self,
        candidate: str,
        by_relative: dict[str, SourceFile],
    ) -> SourceFile | None:
        if candidate in by_relative:
            return by_relative[candidate]
        suffix_matches = [
            source
            for relative_path, source in by_relative.items()
            if relative_path.endswith(f"/{candidate}")
        ]
        if len(suffix_matches) == 1:
            return suffix_matches[0]
        return None
```

---

#### `exerpt/models.py`

- Reason: task keyword match (2)
- Graph distance: 0
- Summary: models; imports __future__, dataclasses, enum

```python
"""Shared domain models for Exerpt."""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
class TokenBudgetExceeded(RuntimeError):
    """Raised when required context cannot fit the configured token budget."""
class Priority(str, Enum):
    """Rendering priority assigned to each source file."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
@dataclass(frozen=True)
class BuildOptions:
    """User-provided build settings."""
    root: Path
    task: str
    token_limit: int
    output: Path
    model: str = "gpt-4o-mini"
    include_tests: bool = True
@dataclass(slots=True)
class SourceFile:
    """Text source discovered in the repository."""
    path: Path
    relative_path: str
    text: str
    imports: set[str] = field(default_factory=set)
@dataclass(slots=True)
class RankedFile:
    """Source file plus graph-aware priority metadata."""
    source: SourceFile
    priority: Priority
    reason: str
    lexical_score: int = 0
    graph_distance: int | None = None
@dataclass(frozen=True)
class RenderProfile:
    """Controls budget fitting without mutating ranked files."""
    include_medium_code: bool = True
    include_low_code: bool = True
    low_file_limit: int | None = None
@dataclass(frozen=True)
class BuildResult:
    """Completed Markdown prompt and metrics."""
    markdown: str
    tokens: int
    files_scanned: int
    priority_counts: dict[str, int]
```

---

#### `exerpt/cli.py`

- Reason: dependency graph distance 1
- Graph distance: 1
- Summary: cli; imports __future__, exerpt.engine, exerpt.models

```python
"""Command line interface for Exerpt."""
from __future__ import annotations
import re
from pathlib import Path
from typing import Annotated
import typer
from rich.console import Console
from rich.table import Table
from exerpt.engine import ExerptEngine
from exerpt.models import BuildOptions, TokenBudgetExceeded
app = typer.Typer(
    name="exerpt",
    help="Sift a codebase into a focused, task-oriented Markdown prompt.",
    no_args_is_help=True,
)
console = Console()
@app.callback()
def root() -> None:
    """Sift a repository into task-oriented LLM context."""
def parse_token_limit(value: str) -> int:
    """Parse token limits such as 8000, 8k, or 1m."""
    match = re.fullmatch(r"\s*(\d+)\s*([kKmM]?)\s*", value)
    if match is None:
        raise typer.BadParameter("Use a number such as 8000, 8k, or 1m.")
    amount = int(match.group(1))
    suffix = match.group(2).lower()
    multiplier = {"": 1, "k": 1_000, "m": 1_000_000}[suffix]
    return amount * multiplier
@app.command()
def build(
    task: Annotated[
        str,
        typer.Option("--task", "-t", help="Task the LLM should solve."),
    ],
    limit: Annotated[
        str,
        typer.Option("--limit", "-l", help="Maximum output tokens, e.g. 8k or 32000."),
    ] = "8k",
    output: Annotated[
        Path,
        typer.Option("--output", "-o", help="Markdown file to write."),
    ] = Path("exerpt.md"),
    root: Annotated[
        Path,
        typer.Option("--root", "-r", help="Repository root to scan."),
    ] = Path("."),
    model: Annotated[
        str,
        typer.Option("--model", help="Model name used by tiktoken for token counting."),
    ] = "gpt-4o-mini",
    include_tests: Annotated[
        bool,
        typer.Option("--include-tests/--exclude-tests", help="Include test files in scanning."),
    ] = True,
) -> None:
    """Build a task-oriented Markdown context file."""
    token_limit = parse_token_limit(limit)
    root_path = root.resolve()
    output_path = output if output.is_absolute() else Path.cwd() / output
    options = BuildOptions(
        root=root_path,
        task=task,
        token_limit=token_limit,
        output=output_path,
        model=model,
        include_tests=include_tests,
    )
    engine = ExerptEngine()
    try:
        with console.status("[bold]Sifting project context...[/bold]"):
            result = engine.build_prompt(options)
    except TokenBudgetExceeded as exc:
        console.print(f"[red]Token budget exceeded:[/red] {exc}")
        raise typer.Exit(code=2) from exc
    except Exception as exc:
        console.print(f"[red]Exerpt failed:[/red] {exc}")
        raise typer.Exit(code=1) from exc
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result.markdown, encoding="utf-8")
    table = Table(title="Exerpt Output")
    table.add_column("Metric", style="bold")
    table.add_column("Value")
    table.add_row("Output", str(output_path))
    table.add_row("Files scanned", str(result.files_scanned))
    table.add_row("High priority", str(result.priority_counts.get("high", 0)))
    table.add_row("Medium priority", str(result.priority_counts.get("medium", 0)))
    table.add_row("Low priority", str(result.priority_counts.get("low", 0)))
    table.add_row("Tokens", f"{result.tokens:,} / {token_limit:,}")
    console.print(table)
def main() -> None:
    """Console script entry point."""
    app()
if __name__ == "__main__":
    main()
```

---

#### `exerpt/scanner.py`

- Reason: dependency graph distance 1
- Graph distance: 1
- Summary: scanner; imports __future__, charset_normalizer, exerpt.models

```python
"""Gitignore-aware project scanner."""
from __future__ import annotations
from pathlib import Path
from typing import Any
from pathspec import PathSpec
from exerpt.models import SourceFile
class ProjectScanner:
    """Read text files from a project while respecting ignore rules."""
    ignored_dirs = {
        ".git",
        ".hg",
        ".mypy_cache",
        ".nox",
        ".pytest_cache",
        ".ruff_cache",
        ".tox",
        ".venv",
        "__pycache__",
        "build",
        "dist",
        "node_modules",
        "target",
        "vendor",
    }
    binary_extensions = {
        ".7z",
        ".a",
        ".avi",
        ".bin",
        ".bmp",
        ".class",
        ".dll",
        ".dmg",
        ".doc",
        ".docx",
        ".eot",
        ".exe",
        ".gif",
        ".gz",
        ".ico",
        ".jar",
        ".jpeg",
        ".jpg",
        ".mov",
        ".mp3",
        ".mp4",
        ".o",
        ".otf",
        ".pdf",
        ".png",
        ".pyc",
        ".rar",
        ".so",
        ".sqlite",
        ".tar",
        ".ttf",
        ".wav",
        ".webm",
        ".webp",
        ".woff",
        ".woff2",
        ".zip",
    }
    def scan(self, root: Path, *, include_tests: bool = True) -> list[SourceFile]:
        """Return readable text files under ``root``."""
        if not root.exists():
            raise FileNotFoundError(f"Root does not exist: {root}")
        root = root.resolve()
        ignore_spec = self._load_gitignore_rules(root)
        discovered: list[SourceFile] = []
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            relative_path = path.relative_to(root).as_posix()
            if self._is_ignored(relative_path, ignore_spec):
                continue
            if not include_tests and self._looks_like_test(relative_path):
                continue
            if self._looks_binary(path):
                continue
            text = self._read_text(path)
            if text is None:
                continue
            discovered.append(SourceFile(path=path, relative_path=relative_path, text=text))
        return discovered
    def _load_gitignore_rules(self, root: Path) -> PathSpec[Any]:
        patterns: list[str] = []
        for gitignore in sorted(root.rglob(".gitignore")):
            base = gitignore.parent.relative_to(root).as_posix()
            if base == ".":
                base = ""
            for raw_line in gitignore.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                patterns.append(self._scope_gitignore_pattern(line, base))
        return PathSpec.from_lines("gitignore", patterns)
    def _scope_gitignore_pattern(self, pattern: str, base: str) -> str:
        negated = pattern.startswith("!")
        clean = pattern[1:] if negated else pattern
        anchored = clean.startswith("/")
        clean = clean.lstrip("/")
        if base:
            if anchored or "/" in clean:
                scoped = f"{base}/{clean}"
            else:
                scoped = f"{base}/**/{clean}"
        else:
            scoped = clean
        return f"!{scoped}" if negated else scoped
    def _is_ignored(self, relative_path: str, ignore_spec: PathSpec[Any]) -> bool:
        parts = set(Path(relative_path).parts)
        if parts.intersection(self.ignored_dirs):
            return True
        return ignore_spec.match_file(relative_path)
    def _looks_binary(self, path: Path) -> bool:
        if path.suffix.lower() in self.binary_extensions:
            return True
        try:
            sample = path.read_bytes()[:4096]
        except OSError:
            return True
        return b"\0" in sample
    def _read_text(self, path: Path) -> str | None:
        data = path.read_bytes()
        if not data:
            return ""
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            from charset_normalizer import from_bytes
            result = from_bytes(data).best()
            return str(result) if result is not None else None
    def _looks_like_test(self, relative_path: str) -> bool:
        path = relative_path.lower()
        name = Path(path).name
        return (
            "/test/" in path
            or "/tests/" in path
            or path.startswith("test/")
            or path.startswith("tests/")
            or name.startswith("test_")
            or name.endswith("_test.py")
            or name.endswith(".test.js")
            or name.endswith(".test.jsx")
            or name.endswith(".test.ts")
            or name.endswith(".test.tsx")
            or name.endswith(".spec.js")
            or name.endswith(".spec.jsx")
            or name.endswith(".spec.ts")
            or name.endswith(".spec.tsx")
        )
```

---

#### `exerpt/sifter.py`

- Reason: dependency graph distance 1
- Graph distance: 1
- Summary: sifter; imports __future__, ast, exerpt.models

```python
"""Code compression strategies."""
from __future__ import annotations
import ast
import io
import re
import tokenize
from pathlib import Path
from typing import Any
from exerpt.models import Priority, SourceFile
class CodeSifter:
    """Compress files according to their assigned priority."""
    language_by_extension = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".mjs": "javascript",
        ".cjs": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
    }
    declaration_types = {
        "python": {"class_definition", "function_definition"},
        "javascript": {
            "class_declaration",
            "function_declaration",
            "generator_function_declaration",
            "method_definition",
        },
        "typescript": {
            "abstract_class_declaration",
            "class_declaration",
            "function_declaration",
            "generator_function_declaration",
            "method_definition",
        },
    }
    def sift(
        self,
        source: SourceFile,
        priority: Priority,
        *,
        include_medium_code: bool = True,
        include_low_code: bool = True,
    ) -> str:
        if priority is Priority.HIGH:
            return self.strip_comments_and_blank_lines(source)
        if priority is Priority.MEDIUM and not include_medium_code:
            return "[implementation hidden]"
        if priority is Priority.LOW and not include_low_code:
            return "[implementation hidden]"
        return self.signature_only(source)
    def strip_comments_and_blank_lines(self, source: SourceFile) -> str:
        if source.path.suffix.lower() == ".py":
            return self._strip_python_comments(source.text)
        return self._strip_generic_comments(source.text)
    def signature_only(self, source: SourceFile) -> str:
        tree_sitter_result = self._tree_sitter_signature_only(source)
        if tree_sitter_result:
            return tree_sitter_result
        if source.path.suffix.lower() == ".py":
            return self._python_ast_signature_only(source.text)
        return self._regex_signature_only(source.text)
    def summarize(self, source: SourceFile) -> str:
        stem = Path(source.relative_path).stem.replace("_", " ").replace("-", " ")
        if source.imports:
            imports = ", ".join(sorted(source.imports)[:3])
            return f"{stem}; imports {imports}"
        return f"{stem} source file"
    def _strip_python_comments(self, text: str) -> str:
        tokens: list[tokenize.TokenInfo] = []
        reader = io.StringIO(text).readline
        try:
            stream = tokenize.generate_tokens(reader)
            for token in stream:
                if token.type in {tokenize.COMMENT, tokenize.ENCODING}:
                    continue
                tokens.append(token)
        except tokenize.TokenError:
            return "\n".join(
                line.rstrip()
                for line in text.splitlines()
                if line.strip() and not line.lstrip().startswith("#")
            )
        stripped = tokenize.untokenize(tokens)
        return "\n".join(line.rstrip() for line in stripped.splitlines() if line.strip())
    def _strip_generic_comments(self, text: str) -> str:
        stripped: list[str] = []
        in_block_comment = False
        for line in text.splitlines():
            current = line.strip()
            if not current:
                continue
            if in_block_comment:
                if "*/" in current:
                    in_block_comment = False
                    current = current.split("*/", maxsplit=1)[1].strip()
                else:
                    continue
            if current.startswith("/*"):
                in_block_comment = "*/" not in current
                continue
            if current.startswith(("//", "#")):
                continue
            stripped.append(line.rstrip())
        return "\n".join(stripped)
    def _tree_sitter_signature_only(self, source: SourceFile) -> str | None:
        language = self.language_by_extension.get(source.path.suffix.lower())
        if language is None:
            return None
        parser = self._load_parser(language)
        if parser is None:
            return None
        source_bytes = source.text.encode("utf-8")
        tree = parser.parse(source_bytes)
        declarations = self._collect_declarations(tree.root_node, language)
        if not declarations:
            return None
        blocks: list[str] = []
        for node in declarations:
            body = self._body_node(node)
            if body is None:
                continue
            signature = source_bytes[node.start_byte : body.start_byte].decode(
                "utf-8",
                errors="replace",
            )
            rendered = self._render_tree_sitter_signature(signature, body, source_bytes, language)
            if rendered:
                blocks.append(rendered)
        return "\n".join(blocks) if blocks else None
    def _load_parser(self, language: str) -> Any | None:
        try:
            from tree_sitter_language_pack import get_parser
        except Exception:
            return None
        try:
            return get_parser(language)
        except Exception:
            return None
    def _collect_declarations(self, root: Any, language: str) -> list[Any]:
        wanted = self.declaration_types.get(language, set())
        declarations: list[Any] = []
        def visit(node: Any) -> None:
            if node.type in wanted:
                declarations.append(node)
            for child in node.children:
                visit(child)
        visit(root)
        return sorted(declarations, key=lambda item: item.start_byte)
    def _body_node(self, node: Any) -> Any | None:
        body = node.child_by_field_name("body")
        if body is not None:
            return body
        for child in node.children:
            if child.type in {"block", "class_body", "statement_block"}:
                return child
        return None
    def _render_tree_sitter_signature(
        self,
        signature: str,
        body: Any,
        source_bytes: bytes,
        language: str,
    ) -> str:
        clean_signature = signature.rstrip()
        if not clean_signature:
            return ""
        first_line = clean_signature.splitlines()[0]
        indent_match = re.match(r"\s*", first_line)
        declaration_indent = indent_match.group(0) if indent_match else ""
        body_indent = f"{declaration_indent}    "
        if language in {"javascript", "typescript"} and not clean_signature.endswith("{"):
            clean_signature = f"{clean_signature} {{"
        lines = [clean_signature]
        docstring = self._python_docstring_from_body(body, source_bytes) if language == "python" else None
        if docstring:
            lines.extend(self._indent_literal(docstring, body_indent))
        lines.append(f"{body_indent}[implementation hidden]")
        if language in {"javascript", "typescript"}:
            lines.append(f"{declaration_indent}}}")
        return "\n".join(lines)
    def _python_docstring_from_body(self, body: Any, source_bytes: bytes) -> str | None:
        body_text = source_bytes[body.start_byte : body.end_byte].decode("utf-8", errors="replace")
        match = re.match(
            r"^\s*(?P<literal>(?P<quote>\"\"\"|'''|\"|').*?(?P=quote))",
            body_text,
            re.DOTALL,
        )
        return match.group("literal").strip() if match else None
    def _indent_literal(self, literal: str, indent: str) -> list[str]:
        return [f"{indent}{line.strip()}" if line.strip() else indent for line in literal.splitlines()]
    def _python_ast_signature_only(self, text: str) -> str:
        signatures: list[str] = []
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return "[implementation hidden]"
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                signatures.extend(self._render_python_node_signature(node))
        return "\n".join(signatures) if signatures else "[implementation hidden]"
    def _render_python_node_signature(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef,
    ) -> list[str]:
        indent = " " * getattr(node, "col_offset", 0)
        body_indent = f"{indent}    "
        if isinstance(node, ast.ClassDef):
            bases = [ast.unparse(base) for base in node.bases]
            suffix = f"({', '.join(bases)})" if bases else ""
            lines = [f"{indent}class {node.name}{suffix}:"]
        else:
            prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
            returns = f" -> {ast.unparse(node.returns)}" if node.returns is not None else ""
            lines = [f"{indent}{prefix}def {node.name}({ast.unparse(node.args)}){returns}:"]
        docstring = ast.get_docstring(node, clean=False)
        if docstring:
            lines.append(f'{body_indent}"""{docstring}"""')
        lines.append(f"{body_indent}[implementation hidden]")
        return lines
    def _regex_signature_only(self, text: str) -> str:
        signatures: list[str] = []
        pattern = re.compile(
            r"^\s*(?:export\s+)?(?:async\s+)?"
            r"(?:function|class|interface|type|const|let|var)\s+.+",
            re.MULTILINE,
        )
        for match in pattern.finditer(text):
            line = match.group(0).rstrip()
            signatures.append(line if line.endswith("{") else f"{line} {{")
            signatures.append("  [implementation hidden]")
            signatures.append("}")
        return "\n".join(signatures) if signatures else "[implementation hidden]"
```

---

#### `exerpt/tokenizer.py`

- Reason: dependency graph distance 1
- Graph distance: 1
- Summary: tokenizer; imports __future__, tiktoken, typing

```python
"""Token counting helpers."""
from __future__ import annotations
from typing import Any
class TokenCounter:
    """Thin tiktoken wrapper with model fallback."""
    def __init__(self, model: str) -> None:
        self.model = model
        self._encoding = self._load_encoding(model)
    def count(self, text: str) -> int:
        return len(self._encoding.encode(text))
    def _load_encoding(self, model: str) -> Any:
        import tiktoken
        try:
            return tiktoken.encoding_for_model(model)
        except KeyError:
            return tiktoken.get_encoding("cl100k_base")
```

---

### LOW Priority

#### `exerpt/__init__.py`

- Reason: background context
- Graph distance: n/a
- Summary:   init   source file

```python
[implementation hidden]
```

---

---

## System Instructions

Use this sifted repository context to solve the task. Treat HIGH files as authoritative implementation detail, MEDIUM files as dependency contracts, and LOW files as compressed orientation. Do not assume omitted implementation details unless they follow directly from visible signatures, docstrings, imports, or dependency relationships.
