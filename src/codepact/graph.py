"""Dependency extraction and graph construction."""

from __future__ import annotations

import ast
import re
from pathlib import Path

import networkx as nx  # type: ignore[import-untyped]

from codepact.models import SourceFile


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
