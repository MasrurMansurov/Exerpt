"""Command line interface for Codepact."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from codepact.engine import CodepactEngine
from codepact.models import BuildOptions, TokenBudgetExceeded

app = typer.Typer(
    name="codepact",
    help="Sift a codebase into a compact, task-oriented Markdown prompt.",
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
    ] = Path("codepact.md"),
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

    engine = CodepactEngine()

    try:
        with console.status("[bold]Sifting project context...[/bold]"):
            result = engine.build_prompt(options)
    except TokenBudgetExceeded as exc:
        console.print(f"[red]Token budget exceeded:[/red] {exc}")
        raise typer.Exit(code=2) from exc
    except Exception as exc:
        console.print(f"[red]Codepact failed:[/red] {exc}")
        raise typer.Exit(code=1) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result.markdown, encoding="utf-8")

    table = Table(title="Codepact Output")
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
