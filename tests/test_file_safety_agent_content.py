"""HERMES_WRITE_SAFE_ROOT must not block agent-managed skills/plugins trees."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from agent import file_safety


@pytest.fixture()
def hermes_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "hermes"
    home.mkdir()
    monkeypatch.setattr(file_safety, "_hermes_home_path", lambda: home)
    monkeypatch.setattr(file_safety, "_hermes_root_path", lambda: home)
    return home


def test_safe_root_allows_skills_and_plugins(hermes_home: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    workspace = tmp_path / "project"
    workspace.mkdir()
    monkeypatch.setenv("HERMES_WRITE_SAFE_ROOT", str(workspace))

    skill = hermes_home / "skills" / "demo" / "SKILL.md"
    plugin = hermes_home / "plugins" / "demo" / "plugin.py"
    desktop = hermes_home / "desktop-plugins" / "demo" / "plugin.js"
    outside = tmp_path / "elsewhere" / "notes.md"
    skill.parent.mkdir(parents=True)
    plugin.parent.mkdir(parents=True)
    desktop.parent.mkdir(parents=True)
    outside.parent.mkdir(parents=True)
    for path in (skill, plugin, desktop, outside):
        path.write_text("x", encoding="utf-8")

    assert file_safety.is_write_denied(str(skill)) is False
    assert file_safety.is_write_denied(str(plugin)) is False
    assert file_safety.is_write_denied(str(desktop)) is False
    assert file_safety.is_write_denied(str(outside)) is True
    assert file_safety.is_write_denied(str(workspace / "ok.txt")) is False


def test_safe_root_still_blocks_unrelated_hermes_paths(hermes_home: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    workspace = tmp_path / "project"
    workspace.mkdir()
    monkeypatch.setenv("HERMES_WRITE_SAFE_ROOT", str(workspace))

    memory = hermes_home / "MEMORY.md"
    memory.write_text("x", encoding="utf-8")

    assert file_safety.is_write_denied(str(memory)) is True
