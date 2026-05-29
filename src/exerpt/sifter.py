"""Code compression strategies."""

from __future__ import annotations

import ast
import io
import re
import tokenize
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from exerpt.language import LANGUAGE_BY_EXTENSION, detect_language
from exerpt.models import Priority, SourceFile


@dataclass(frozen=True)
class DeclarationRange:
    """Line and byte span for a class/function-like declaration."""

    kind: str
    start_offset: int
    end_offset: int
    start_line: int
    end_line: int
    signature: str


class GenericParser:
    """Regex parser used when no language-specific parser is available."""

    control_keywords = {
        "catch",
        "do",
        "else",
        "for",
        "foreach",
        "if",
        "return",
        "sizeof",
        "switch",
        "try",
        "using",
        "while",
    }

    class_pattern = re.compile(
        r"^\s*(?:export\s+)?"
        r"(?:(?:public|private|protected|internal|abstract|sealed|final|open|data|static|partial)\s+)*"
        r"(?:class|struct|interface|enum|trait|protocol|object|record)\s+"
        r"[A-Za-z_$][\w$]*(?:\s*[:(<][^\n{;]*)?",
        re.MULTILINE,
    )
    type_alias_pattern = re.compile(
        r"^\s*(?:export\s+)?(?:type|alias|typedef)\s+[A-Za-z_$][\w$]*\b[^\n{;]*",
        re.MULTILINE,
    )
    zig_struct_pattern = re.compile(
        r"^\s*(?:pub\s+)?const\s+[A-Za-z_]\w*\s*=\s*(?:extern\s+|packed\s+)?struct\b[^\n{;]*",
        re.MULTILINE,
    )
    keyword_function_pattern = re.compile(
        r"^\s*(?:export\s+)?"
        r"(?:(?:public|private|protected|internal|static|async|override|open|final|inline|suspend|virtual|abstract|pub|mutating)\s+)*"
        r"(?:def|func|fun|fn|function|subroutine|method|proc|procedure)\s+"
        r"[A-Za-z_$][\w$]*(?:\s*<[^>\n]+>)?\s*\([^;\n]*\)"
        r"(?:\s*(?:->|=>|:)\s*[^;\n{]+)?",
        re.MULTILINE,
    )
    visibility_function_pattern = re.compile(
        r"^\s*(?!(?:if|for|while|switch|catch|return|else|do|try|using)\b)"
        r"(?:(?:public|private|protected|internal|static|async|override|virtual|final|extern|inline|constexpr|friend|native|synchronized)\s+)+"
        r"(?:[\w:<>\[\],.?*&~]+\s+)+[A-Za-z_$][\w$]*\s*\([^;\n]*\)"
        r"(?:\s*(?:const|throws\s+[A-Za-z0-9_., ]+))?",
        re.MULTILINE,
    )
    constructor_pattern = re.compile(
        r"^\s*(?:public|private|protected|internal)\s+[A-Z][A-Za-z0-9_$]*\s*\([^;\n]*\)",
        re.MULTILINE,
    )
    typed_function_pattern = re.compile(
        r"^\s*(?!(?:if|for|while|switch|catch|return|sizeof)\b)"
        r"(?:void|int|long|short|float|double|bool|boolean|char|byte|auto|var|let|String|string|[A-Z][\w:<>\[\].?*&~]*)\s+"
        r"[A-Za-z_$][\w$]*\s*\([^;\n]*\)(?:\s*const)?",
        re.MULTILINE,
    )
    arrow_function_pattern = re.compile(
        r"^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*"
        r"(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>",
        re.MULTILINE,
    )

    def strip_comments(self, text: str) -> str:
        """Strip common line/block comments while preserving source lines."""
        without_blocks = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
        without_blocks = re.sub(r"<!--.*?-->", "", without_blocks, flags=re.DOTALL)
        stripped: list[str] = []

        for line in without_blocks.splitlines():
            clean = self._strip_inline_comment(line).rstrip()
            if clean.strip():
                stripped.append(clean)

        return "\n".join(stripped)

    def signature_only(self, text: str) -> str:
        """Return a declaration skeleton for languages without Tree-Sitter support."""
        comment_free = self.strip_comments(text)
        matches: list[tuple[int, str]] = []
        for _, pattern in self.declaration_patterns():
            matches.extend((match.start(), match.group(0).rstrip()) for match in pattern.finditer(comment_free))

        deduped: list[tuple[int, str]] = []
        seen_lines: set[str] = set()
        for start, line in sorted(matches, key=lambda item: item[0]):
            normalized = re.sub(r"\s+", " ", line.strip())
            first_word = normalized.split(" ", maxsplit=1)[0].lower() if normalized else ""
            if not normalized or first_word in self.control_keywords or normalized in seen_lines:
                continue
            seen_lines.add(normalized)
            deduped.append((start, line))

        if not deduped:
            return "[implementation hidden]"

        rendered: list[str] = []
        for _, signature in deduped:
            rendered.extend(self._render_signature(signature))

        return "\n".join(rendered)

    def declaration_patterns(self) -> tuple[tuple[str, re.Pattern[str]], ...]:
        """Return declaration patterns tagged by broad declaration kind."""
        return (
            ("class", self.class_pattern),
            ("class", self.type_alias_pattern),
            ("class", self.zig_struct_pattern),
            ("function", self.keyword_function_pattern),
            ("function", self.visibility_function_pattern),
            ("function", self.constructor_pattern),
            ("function", self.typed_function_pattern),
            ("function", self.arrow_function_pattern),
        )

    def _strip_inline_comment(self, line: str) -> str:
        quote: str | None = None
        escape = False
        index = 0

        while index < len(line):
            char = line[index]
            if quote is not None:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == quote:
                    quote = None
                index += 1
                continue

            if char in {'"', "'", "`"}:
                quote = char
                index += 1
                continue
            if line.startswith("//", index) or line.startswith("--", index):
                return line[:index]
            if char == "#" and (index == 0 or line[index - 1].isspace()):
                directive = line[index:].lstrip()
                if directive.startswith(
                    ("#define", "#elif", "#else", "#endif", "#if", "#ifdef", "#ifndef", "#include", "#pragma")
                ):
                    index += 1
                    continue
                return line[:index]
            index += 1

        return line

    def _render_signature(self, signature: str) -> list[str]:
        indent_match = re.match(r"\s*", signature)
        indent = indent_match.group(0) if indent_match else ""
        clean = signature.rstrip()
        body_indent = f"{indent}  "

        if clean.endswith(":"):
            return [clean, f"{body_indent}[implementation hidden]"]
        if clean.endswith("{"):
            return [clean, f"{body_indent}[implementation hidden]", f"{indent}}}"]
        if clean.endswith(";"):
            return [clean]
        return [f"{clean} {{", f"{body_indent}[implementation hidden]", f"{indent}}}"]


class CodeSifter:
    """Compress files according to their assigned priority."""

    language_by_extension = LANGUAGE_BY_EXTENSION
    tree_sitter_aliases = {
        "c": ("c",),
        "cpp": ("cpp", "c++"),
        "csharp": ("c_sharp", "c-sharp", "csharp"),
        "dart": ("dart",),
        "go": ("go",),
        "java": ("java",),
        "javascript": ("javascript",),
        "kotlin": ("kotlin",),
        "php": ("php",),
        "python": ("python",),
        "ruby": ("ruby",),
        "rust": ("rust",),
        "swift": ("swift",),
        "typescript": ("typescript", "tsx"),
    }
    declaration_types = {
        "c": {"function_definition", "struct_specifier", "union_specifier", "enum_specifier"},
        "cpp": {
            "class_specifier",
            "declaration",
            "function_definition",
            "namespace_definition",
            "struct_specifier",
        },
        "csharp": {
            "class_declaration",
            "constructor_declaration",
            "enum_declaration",
            "interface_declaration",
            "method_declaration",
            "record_declaration",
            "struct_declaration",
        },
        "dart": {
            "class_definition",
            "constructor_signature",
            "enum_declaration",
            "function_signature",
            "method_signature",
            "mixin_declaration",
        },
        "go": {"function_declaration", "method_declaration", "type_declaration"},
        "java": {
            "class_declaration",
            "constructor_declaration",
            "enum_declaration",
            "interface_declaration",
            "method_declaration",
            "record_declaration",
        },
        "javascript": {
            "class_declaration",
            "function_declaration",
            "generator_function_declaration",
            "lexical_declaration",
            "method_definition",
        },
        "kotlin": {
            "class_declaration",
            "function_declaration",
            "interface_declaration",
            "object_declaration",
        },
        "php": {
            "class_declaration",
            "function_definition",
            "interface_declaration",
            "method_declaration",
            "trait_declaration",
        },
        "python": {"class_definition", "function_definition"},
        "ruby": {"class", "method", "module", "singleton_method"},
        "rust": {
            "enum_item",
            "function_item",
            "impl_item",
            "struct_item",
            "trait_item",
            "type_item",
        },
        "swift": {
            "class_declaration",
            "enum_declaration",
            "function_declaration",
            "init_declaration",
            "protocol_declaration",
            "struct_declaration",
        },
        "typescript": {
            "abstract_class_declaration",
            "class_declaration",
            "function_declaration",
            "generator_function_declaration",
            "interface_declaration",
            "lexical_declaration",
            "method_definition",
            "type_alias_declaration",
        },
    }
    brace_languages = {
        "c",
        "cpp",
        "csharp",
        "dart",
        "go",
        "java",
        "javascript",
        "kotlin",
        "php",
        "rust",
        "swift",
        "typescript",
    }

    def __init__(self, generic_parser: GenericParser | None = None) -> None:
        self.generic_parser = generic_parser or GenericParser()

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
        if self._language_for(source) == "python":
            return self._strip_python_comments(source.text)
        return self._strip_generic_comments(source.text)

    def signature_only(self, source: SourceFile) -> str:
        tree_sitter_result = self._tree_sitter_signature_only(source)
        if tree_sitter_result:
            return tree_sitter_result
        if self._language_for(source) == "python":
            return self._python_ast_signature_only(source.text)
        return self._regex_signature_only(source.text)

    def smart_snippet(self, source: SourceFile, task: str, *, max_lines: int = 160) -> str:
        """Keep task-matching declarations from a large HIGH-priority file."""
        full_code = self.strip_comments_and_blank_lines(source)
        max_chars = max_lines * 120
        if len(full_code.splitlines()) <= max_lines and len(full_code) <= max_chars:
            return full_code

        task_terms = self._task_terms(task)
        if not task_terms:
            return self.signature_only(source)

        language = self._language_for(source)
        declarations = (
            self._python_declaration_ranges(source.text)
            if language == "python"
            else self._generic_declaration_ranges(source.text)
        )
        if not declarations:
            return self.signature_only(source)

        snippets: list[str] = []
        seen: set[tuple[int, int]] = set()
        for declaration in declarations:
            segment = source.text[declaration.start_offset : declaration.end_offset]
            signature_matches = self._contains_task_term(declaration.signature, task_terms)
            segment_matches = self._contains_task_term(segment, task_terms)
            if declaration.kind == "class" and signature_matches:
                snippets.append(self._render_class_marker(declaration.signature))
                continue
            if declaration.kind != "class" and segment_matches and (
                declaration.start_offset,
                declaration.end_offset,
            ) not in seen:
                seen.add((declaration.start_offset, declaration.end_offset))
                snippets.append(self._strip_segment_comments(segment, language))

        if not snippets:
            return self.signature_only(source)

        return self._join_snippets(snippets, max_lines)

    def summarize(self, source: SourceFile) -> str:
        stem = Path(source.relative_path).stem.replace("_", " ").replace("-", " ")
        if source.imports:
            imports = ", ".join(sorted(source.imports)[:3])
            return f"{stem}; imports {imports}"
        return f"{stem} source file"

    def _language_for(self, source: SourceFile) -> str:
        if source.detected_language and source.detected_language != "unknown":
            return source.detected_language
        return detect_language(source.relative_path)

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
        return self.generic_parser.strip_comments(text)

    def _tree_sitter_signature_only(self, source: SourceFile) -> str | None:
        language = self._language_for(source)
        if language not in self.declaration_types:
            return None

        parser = self._load_parser(language)
        if parser is None:
            return None

        source_bytes = source.text.encode("utf-8")
        try:
            tree = parser.parse(source_bytes)
        except TypeError:
            tree = parser.parse(source.text)
        root_node = tree.root_node() if callable(tree.root_node) else tree.root_node
        declarations = self._collect_declarations(root_node, language)
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

        for alias in self.tree_sitter_aliases.get(language, (language,)):
            try:
                return get_parser(alias)
            except Exception:
                continue
        return None

    def _collect_declarations(self, root: Any, language: str) -> list[Any]:
        wanted = self.declaration_types.get(language, set())
        declarations: list[Any] = []

        def visit(node: Any) -> None:
            if self._node_type(node) in wanted:
                declarations.append(node)
            for child in self._node_children(node):
                visit(child)

        visit(root)
        return sorted(declarations, key=lambda item: item.start_byte)

    def _body_node(self, node: Any) -> Any | None:
        body = node.child_by_field_name("body")
        if body is not None:
            return body
        for child in self._node_children(node):
            if self._node_type(child) in {
                "block",
                "body",
                "class_body",
                "compound_statement",
                "declaration_list",
                "enum_body",
                "field_declaration_list",
                "function_body",
                "interface_body",
                "protocol_body",
                "statement_block",
                "struct_body",
                "trait_body",
            }:
                return child
        return None

    def _node_type(self, node: Any) -> str:
        node_type = getattr(node, "type", None)
        if node_type is not None:
            return str(node_type)
        return str(getattr(node, "kind", ""))

    def _node_children(self, node: Any) -> list[Any]:
        children = getattr(node, "children", None)
        if children is not None:
            return list(children)

        child_count_attr = getattr(node, "child_count", 0)
        child_count = child_count_attr() if callable(child_count_attr) else child_count_attr
        children_from_method = []
        for index in range(child_count):
            child = node.child(index)
            if child is not None:
                children_from_method.append(child)
        return children_from_method

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

        lines = [clean_signature]
        docstring = self._python_docstring_from_body(body, source_bytes) if language == "python" else None
        if docstring:
            lines.extend(self._indent_literal(docstring, body_indent))
        lines.append(f"{body_indent}[implementation hidden]")

        if language in self.brace_languages:
            if not clean_signature.endswith("{"):
                lines[0] = f"{clean_signature} {{"
            lines.append(f"{declaration_indent}}}")
        elif language == "ruby":
            lines.append(f"{declaration_indent}end")

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
        return self.generic_parser.signature_only(text)

    def _task_terms(self, task: str) -> set[str]:
        terms = {term.lower() for term in re.findall(r"[A-Za-z0-9_]+", task)}
        return {term for term in terms if len(term) > 2}

    def _contains_task_term(self, text: str, task_terms: set[str]) -> bool:
        haystack = text.lower()
        return any(term in haystack for term in task_terms)

    def _strip_segment_comments(self, text: str, language: str) -> str:
        if language == "python":
            return self._strip_python_comments(text)
        return self._strip_generic_comments(text)

    def _render_class_marker(self, signature: str) -> str:
        clean = signature.rstrip()
        if clean.endswith("{"):
            return "\n".join([clean, "  ..."])
        if clean.endswith(":"):
            return "\n".join([clean, "    ..."])
        return "\n".join([f"{clean} {{", "  ...", "}"])

    def _join_snippets(self, snippets: list[str], max_lines: int) -> str:
        rendered: list[str] = []
        remaining = max(max_lines, 1)

        for snippet in snippets:
            lines = [self._trim_long_line(line.rstrip()) for line in snippet.splitlines() if line.strip()]
            if not lines or remaining <= 0:
                break
            if rendered:
                rendered.append("...")
                remaining -= 1
            if len(lines) > remaining:
                rendered.extend(lines[: max(remaining - 1, 0)])
                rendered.append("...")
                break
            rendered.extend(lines)
            remaining -= len(lines)

        return "\n".join(rendered) if rendered else "[implementation hidden]"

    def _trim_long_line(self, line: str, *, max_chars: int = 220) -> str:
        if len(line) <= max_chars:
            return line
        return f"{line[:max_chars].rstrip()} ..."

    def _python_declaration_ranges(self, text: str) -> list[DeclarationRange]:
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []

        lines = text.splitlines(keepends=True)
        starts = self._line_start_offsets(text)
        declarations: list[DeclarationRange] = []
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            start_line = max(getattr(node, "lineno", 1) - 1, 0)
            end_line = max(getattr(node, "end_lineno", start_line + 1) - 1, start_line)
            start_offset = starts[start_line] if start_line < len(starts) else 0
            if isinstance(node, ast.ClassDef):
                end_offset = start_offset + len(lines[start_line]) if start_line < len(lines) else start_offset
                kind = "class"
            else:
                end_offset = self._line_end_offset(starts, text, end_line)
                kind = "function"
            signature = lines[start_line].rstrip() if start_line < len(lines) else ""
            declarations.append(
                DeclarationRange(
                    kind=kind,
                    start_offset=start_offset,
                    end_offset=end_offset,
                    start_line=start_line,
                    end_line=end_line,
                    signature=signature,
                )
            )

        return sorted(declarations, key=lambda item: item.start_offset)

    def _generic_declaration_ranges(self, text: str) -> list[DeclarationRange]:
        starts = self._line_start_offsets(text)
        declarations: list[DeclarationRange] = []
        for kind, pattern in self.generic_parser.declaration_patterns():
            for match in pattern.finditer(text):
                signature = match.group(0).rstrip()
                normalized = re.sub(r"\s+", " ", signature.strip())
                first_word = normalized.split(" ", maxsplit=1)[0].lower() if normalized else ""
                if not normalized or first_word in self.generic_parser.control_keywords:
                    continue

                start_line = self._line_for_offset(starts, match.start())
                line_end = text.find("\n", match.end())
                if line_end == -1:
                    line_end = len(text)

                if kind == "class":
                    end_offset = line_end
                else:
                    brace = text.find("{", match.start(), line_end + 1)
                    end_offset = self._matching_brace_end(text, brace) if brace != -1 else line_end
                end_line = self._line_for_offset(starts, max(end_offset - 1, match.start()))
                declarations.append(
                    DeclarationRange(
                        kind=kind,
                        start_offset=starts[start_line],
                        end_offset=end_offset,
                        start_line=start_line,
                        end_line=end_line,
                        signature=signature,
                    )
                )

        return self._dedupe_declarations(sorted(declarations, key=lambda item: item.start_offset))

    def _line_start_offsets(self, text: str) -> list[int]:
        starts = [0]
        for match in re.finditer(r"\n", text):
            starts.append(match.end())
        return starts

    def _line_for_offset(self, starts: list[int], offset: int) -> int:
        line = 0
        for index, start in enumerate(starts):
            if start > offset:
                break
            line = index
        return line

    def _line_end_offset(self, starts: list[int], text: str, line: int) -> int:
        if line + 1 < len(starts):
            return starts[line + 1]
        return len(text)

    def _matching_brace_end(self, text: str, brace_offset: int) -> int:
        depth = 0
        quote: str | None = None
        escape = False
        for index in range(brace_offset, len(text)):
            char = text[index]
            if quote is not None:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == quote:
                    quote = None
                continue
            if char in {'"', "'", "`"}:
                quote = char
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index + 1
        return len(text)

    def _dedupe_declarations(self, declarations: list[DeclarationRange]) -> list[DeclarationRange]:
        deduped: list[DeclarationRange] = []
        seen: set[tuple[int, str]] = set()
        for declaration in declarations:
            key = (declaration.start_line, declaration.signature.strip())
            if key in seen:
                continue
            seen.add(key)
            deduped.append(declaration)
        return deduped
