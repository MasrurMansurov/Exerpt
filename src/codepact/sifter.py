"""Code compression strategies."""

from __future__ import annotations

import ast
import io
import re
import tokenize
from pathlib import Path
from typing import Any

from codepact.models import Priority, SourceFile


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
