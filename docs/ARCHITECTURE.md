# Exerpt Architecture

## Proposed File Structure

```text
exerpt/
  pyproject.toml
  README.md
  docs/
    ARCHITECTURE.md
  src/
    exerpt/
      __init__.py
      cli.py              # Typer/Rich command surface.
      engine.py           # Orchestrates scan -> graph -> rank -> sift -> render.
      models.py           # Shared dataclasses/enums.
      scanner.py          # Gitignore-aware filesystem traversal and decoding.
      graph.py            # Dependency graph construction and traversal.
      ranker.py           # Task relevance scoring and priority assignment.
      sifter.py           # Full, signature-only, and summary compression modes.
      tokenizer.py        # tiktoken wrapper and budget fitting.
      renderer.py         # Markdown prompt rendering.
      config.py           # Defaults, ignore rules, extension registry.
  tests/
    test_dependency_analysis.py
    test_scanner.py
    test_sifter.py
    test_tokenizer.py
```

The initial skeleton keeps the orchestration in `engine.py` while preserving the
module boundaries above. As behavior stabilizes, each private engine method can
move behind those modules without changing the CLI contract.

## Dependencies

Runtime:

- `tiktoken`: exact token counts for the selected model or encoding.
- `typer`: ergonomic CLI commands and typed options.
- `rich`: readable progress, status, tables, and errors.
- `pathspec`: strict `.gitignore` semantics.
- `tree-sitter`: language-aware parsing for signatures and body replacement.
- `tree-sitter-language-pack`: prebuilt grammars for Python, JS, and TS.
- `networkx`: dependency graph modeling and traversal.
- `charset-normalizer`: robust text decoding for mixed repositories.

Development:

- `pytest` and `pytest-cov`: unit and coverage testing.
- `ruff`: linting and import hygiene.
- `mypy`: type checking.
- `build`: packaging validation.

## Priority Model

- High priority: files matching the task directly by path, symbol, or content.
  Render full code after removing comments and blank lines.
- Medium priority: direct dependencies of high-priority files. Render public
  signatures and replace implementation bodies with `[implementation hidden]`.
- Low priority: remaining text files. Render compressed signatures/docstrings
  with implementation bodies replaced by `[implementation hidden]`.

## Prompt Contract

Every generated Markdown file should contain:

1. `Project Map`: ranked file list and dependency hints.
2. `Task Context`: original task, token budget, and ranking notes.
3. `In-depth Code`: sifted source content by priority.
4. `System Instructions`: instructions telling the LLM how to use the context.
