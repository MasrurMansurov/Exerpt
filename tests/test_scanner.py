from __future__ import annotations

from codepact.scanner import ProjectScanner


def test_gitignore_rules_are_honored(tmp_path):
    (tmp_path / ".gitignore").write_text("ignored.py\nignored_dir/\n*.secret\n", encoding="utf-8")
    (tmp_path / "app.py").write_text("print('visible')\n", encoding="utf-8")
    (tmp_path / "ignored.py").write_text("print('hidden')\n", encoding="utf-8")
    (tmp_path / "token.secret").write_text("hidden\n", encoding="utf-8")

    ignored_dir = tmp_path / "ignored_dir"
    ignored_dir.mkdir()
    (ignored_dir / "secret.py").write_text("print('hidden')\n", encoding="utf-8")

    files = ProjectScanner().scan(tmp_path)
    relative_paths = {file.relative_path for file in files}

    assert "app.py" in relative_paths
    assert "ignored.py" not in relative_paths
    assert "ignored_dir/secret.py" not in relative_paths
    assert "token.secret" not in relative_paths
