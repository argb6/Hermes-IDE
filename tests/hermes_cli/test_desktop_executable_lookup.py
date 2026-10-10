"""The Windows desktop executable lookup accepts the fork's product name.

`_desktop_packaged_executable_in` is what `hermes desktop` launches and what
`hermes_cli.desktop_update_verify` checks after an update. It used to probe
only upstream's `Hermes.exe`, so a build carrying the renamed
`Hermes-IDE.exe` verified as "The updated Desktop executable is missing" —
the 🔴 that fired on every self-update in the 2026-10-05..10 logs.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from hermes_cli.main_desktop import _desktop_packaged_executable_in


@pytest.mark.platforms("win32")
class TestWindowsExecutableLookup:
    def test_finds_the_renamed_product_executable(self, tmp_path: Path):
        exe_dir = tmp_path / "win-unpacked"
        exe_dir.mkdir()
        exe = exe_dir / "Hermes-IDE.exe"
        exe.write_bytes(b"MZ stub")
        assert _desktop_packaged_executable_in(tmp_path) == exe

    def test_still_finds_the_upstream_name(self, tmp_path: Path):
        exe_dir = tmp_path / "win-unpacked"
        exe_dir.mkdir()
        exe = exe_dir / "Hermes.exe"
        exe.write_bytes(b"MZ stub")
        assert _desktop_packaged_executable_in(tmp_path) == exe

    def test_missing_bundle_returns_none(self, tmp_path: Path):
        (tmp_path / "win-unpacked").mkdir()
        assert _desktop_packaged_executable_in(tmp_path) is None

    def test_arch_suffixed_unpacked_trees_are_searched(self, tmp_path: Path):
        exe_dir = tmp_path / "win-arm64-unpacked"
        exe_dir.mkdir()
        exe = exe_dir / "Hermes-IDE.exe"
        exe.write_bytes(b"MZ stub")
        assert _desktop_packaged_executable_in(tmp_path) == exe
