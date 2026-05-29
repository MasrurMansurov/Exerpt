"""Dependency extraction and graph construction."""

from __future__ import annotations

import ast
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import networkx as nx  # type: ignore[import-untyped]

from exerpt.language import SOURCE_CODE_EXTENSIONS, detect_language
from exerpt.models import SourceFile


class DependencyAnalyzer:
    """Build a directed local dependency graph from common language imports."""

    parallel_import_threshold = 24
    source_extensions = SOURCE_CODE_EXTENSIONS
    javascript_extensions = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
    dotted_import_extensions = (".kt", ".kts", ".java", ".cs", ".swift", ".go", ".rs")
    path_import_extensions = (
        ".c",
        ".cc",
        ".cpp",
        ".cs",
        ".cxx",
        ".dart",
        ".go",
        ".h",
        ".hh",
        ".hpp",
        ".hxx",
        ".java",
        ".kt",
        ".kts",
        ".php",
        ".rb",
        ".rs",
        ".swift",
    )

    def analyze(self, files: list[SourceFile]) -> nx.DiGraph:
        """Populate imports and return a graph with edges importer -> dependency."""
        by_relative = {source.relative_path: source for source in files}
        graph = nx.DiGraph()
        extracted_imports = self._extract_imports_for_files(files)

        for source, imports in zip(files, extracted_imports, strict=True):
            source.imports = imports
            graph.add_node(source.relative_path, source=source)

        for source in files:
            for import_name in source.imports:
                target = self.resolve_import(import_name, source, by_relative)
                if target is not None:
                    graph.add_edge(source.relative_path, target.relative_path, import_name=import_name)

        return graph

    def _extract_imports_for_files(self, files: list[SourceFile]) -> list[set[str]]:
        if len(files) < self.parallel_import_threshold:
            return [self.extract_imports(source) for source in files]

        with ThreadPoolExecutor() as executor:
            return list(executor.map(self.extract_imports, files))

    def extract_imports(self, source: SourceFile) -> set[str]:
        language = self._language_for(source)
        if language == "python":
            return self._extract_python_imports(source.text)
        if language in {"javascript", "typescript"}:
            return self._extract_javascript_imports(source.text)
        if language == "go":
            return self._extract_go_imports(source.text)
        if language in {"java", "kotlin", "csharp", "swift"}:
            return self._extract_dotted_imports(source.text)
        if language == "rust":
            return self._extract_rust_imports(source.text)
        if language in {"c", "cpp"}:
            return self._extract_c_includes(source.text)
        if language == "php":
            return self._extract_php_imports(source.text)
        if language == "ruby":
            return self._extract_ruby_imports(source.text)
        if language == "dart":
            return self._extract_dart_imports(source.text)
        return set()

    def resolve_import(
        self,
        import_name: str,
        source: SourceFile,
        by_relative: dict[str, SourceFile],
    ) -> SourceFile | None:
        import_name = self._clean_import_name(import_name)
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
        imports = set(
            re.findall(
                r"""^\s*import\s+(?:type\s+)?(?:[^"';]+?\s+from\s+)?["']([^"']+)["']""",
                text,
                re.MULTILINE,
            )
        )
        imports.update(re.findall(r"""require\(\s*["']([^"']+)["']\s*\)""", text))
        imports.update(re.findall(r"""import\(\s*["']([^"']+)["']\s*\)""", text))
        imports.update(
            re.findall(
                r"""^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\}|[^{"']+?)\s+from\s+["']([^"']+)["']""",
                text,
                re.MULTILINE,
            )
        )
        return imports

    def _extract_dotted_imports(self, text: str) -> set[str]:
        imports: set[str] = set()
        for match in re.finditer(
            r"^\s*import\s+(?:static\s+)?([A-Za-z_][\w.]*)(\.\*)?(?:\s+as\s+\w+)?\s*;?",
            text,
            re.MULTILINE,
        ):
            imports.add(f"{match.group(1)}.*" if match.group(2) else match.group(1))
        imports.update(re.findall(r"^\s*using\s+([A-Za-z_][\w.]*);", text, re.MULTILINE))
        return imports

    def _extract_go_imports(self, text: str) -> set[str]:
        imports = set(
            re.findall(
                r"""^\s*import\s+(?:[A-Za-z_.]\w*\s+)?["']([^"']+)["']""",
                text,
                re.MULTILINE,
            )
        )
        for block in re.findall(r"^\s*import\s*\((.*?)\)", text, re.MULTILINE | re.DOTALL):
            imports.update(re.findall(r"""(?:^|\s)(?:[A-Za-z_.]\w*\s+)?["']([^"']+)["']""", block))
        return imports

    def _extract_rust_imports(self, text: str) -> set[str]:
        imports = set(re.findall(r"^\s*use\s+([A-Za-z_][\w:]*)(?:::\*)?;", text, re.MULTILINE))
        imports.update(re.findall(r"^\s*mod\s+([A-Za-z_]\w*)\s*;", text, re.MULTILINE))
        return imports

    def _extract_c_includes(self, text: str) -> set[str]:
        return set(re.findall(r'^\s*#\s*include\s+["<]([^">]+)[">]', text, re.MULTILINE))

    def _extract_php_imports(self, text: str) -> set[str]:
        imports = set(re.findall(r"^\s*use\s+([A-Za-z_\\][\w\\]*);", text, re.MULTILINE))
        imports.update(re.findall(r"""(?:require|include)(?:_once)?\s*\(?\s*["']([^"']+)["']""", text))
        return imports

    def _extract_ruby_imports(self, text: str) -> set[str]:
        imports = set(re.findall(r"""^\s*require_relative\s+["']([^"']+)["']""", text, re.MULTILINE))
        imports.update(re.findall(r"""^\s*require\s+["']([^"']+)["']""", text, re.MULTILINE))
        return imports

    def _extract_dart_imports(self, text: str) -> set[str]:
        return set(re.findall(r"""^\s*(?:import|export|part)\s+["']([^"']+)["']""", text, re.MULTILINE))

    def _candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        language = self._language_for(source)
        if language == "python":
            return self._python_candidate_paths(import_name, source)
        if language in {"javascript", "typescript"}:
            return self._javascript_candidate_paths(import_name, source)
        if language == "go":
            return self._go_candidate_paths(import_name, source)
        if language in {"java", "kotlin", "csharp", "swift", "go"} and "." in import_name:
            return self._dotted_candidate_paths(import_name, self.dotted_import_extensions)
        if language == "rust":
            return self._rust_candidate_paths(import_name, source)
        if language == "php" and "\\" in import_name:
            return self._dotted_candidate_paths(import_name.replace("\\", "."), (".php",))
        if language == "dart":
            return self._dart_candidate_paths(import_name, source)
        return self._path_candidate_paths(import_name, source, self.path_import_extensions)

    def _language_for(self, source: SourceFile) -> str:
        if source.detected_language and source.detected_language != "unknown":
            return source.detected_language
        return detect_language(source.relative_path)

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

    def _go_candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        module_path = Path(import_name)
        if import_name.startswith("."):
            module_path = Path(source.relative_path).parent / import_name
        candidates = self._expand_candidate(module_path, (".go",), include_index=False)
        if "/" in import_name:
            candidates.extend(self._expand_candidate(Path(import_name.rsplit("/", maxsplit=1)[-1]), (".go",), include_index=False))
        return candidates

    def _dotted_candidate_paths(self, import_name: str, extensions: tuple[str, ...]) -> list[str]:
        module_path = Path(import_name.replace(".", "/"))
        return self._expand_candidate(module_path, extensions, include_index=False)

    def _rust_candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        cleaned = re.sub(r"^(?:crate|self|super)::", "", import_name)
        module_path = Path(source.relative_path).parent / cleaned.replace("::", "/")
        candidates = self._expand_candidate(module_path, (".rs",), include_index=False)
        candidates.append(f"{module_path.as_posix()}/mod.rs")
        return candidates

    def _dart_candidate_paths(self, import_name: str, source: SourceFile) -> list[str]:
        if import_name.startswith("package:"):
            package_path = import_name.removeprefix("package:")
            parts = package_path.split("/", maxsplit=1)
            module_path = Path("lib") / (parts[1] if len(parts) > 1 else parts[0])
            return self._expand_candidate(module_path, (".dart",), include_index=False)
        return self._path_candidate_paths(import_name, source, (".dart",))

    def _path_candidate_paths(
        self,
        import_name: str,
        source: SourceFile,
        extensions: tuple[str, ...],
    ) -> list[str]:
        if import_name.startswith("."):
            module_path = Path(source.relative_path).parent / import_name
        else:
            module_path = Path(import_name)
        return self._expand_candidate(module_path, extensions, include_index=True)

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

        if candidate.endswith(".*"):
            prefix = candidate[:-2]
            package_matches = self._package_matches(prefix, by_relative)
            if package_matches:
                return package_matches[0]

        package_matches = self._package_matches(candidate, by_relative)
        if package_matches:
            return package_matches[0]

        suffix_matches = [
            source
            for relative_path, source in by_relative.items()
            if relative_path.endswith(f"/{candidate}")
        ]
        if len(suffix_matches) == 1:
            return suffix_matches[0]

        return None

    def _package_matches(
        self,
        candidate: str,
        by_relative: dict[str, SourceFile],
    ) -> list[SourceFile]:
        normalized = candidate.strip("/").removeprefix("./")
        if not normalized or Path(normalized).suffix:
            return []

        matches = [
            source
            for relative_path, source in sorted(by_relative.items())
            if relative_path.startswith(f"{normalized}/")
            or relative_path.endswith(f"/{normalized}.go")
            or relative_path.endswith(f"/{normalized}/mod.rs")
        ]
        return matches

    def _clean_import_name(self, import_name: str) -> str:
        cleaned = import_name.strip().split("?", maxsplit=1)[0].split("#", maxsplit=1)[0]
        if cleaned.startswith("file://"):
            cleaned = cleaned.removeprefix("file://")
        return cleaned
