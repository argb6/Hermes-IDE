"""Shared argparse helpers for the ``hermes_cli/subcommands/*`` builders.

Import-cycle-free (no ``main`` import); ``main.py`` re-exports for compatibility.
"""

from __future__ import annotations

import argparse


def add_accept_hooks_flag(parser: argparse.ArgumentParser) -> None:
    """Attach ``--accept-hooks`` (shared by every agent subparser so it works in any position)."""
    parser.add_argument(
        "--accept-hooks", action="store_true", default=argparse.SUPPRESS,
        help="Auto-approve unseen shell hooks without a TTY prompt "
            "(equivalent to HERMES_ACCEPT_HOOKS=1 / hooks_auto_accept: true).")


def add_yes_flag(parser: argparse.ArgumentParser, help: str = "Skip confirmation prompt") -> None:
    """Attach ``--yes/-y`` (store_true) with the given help text."""
    parser.add_argument("--yes", "-y", action="store_true", help=help)


def add_json_flag(parser: argparse.ArgumentParser, help: str) -> None:
    """Attach ``--json`` (store_true) with the given help text."""
    parser.add_argument("--json", action="store_true", help=help)


def add_removed_command(subparsers, name: str, feature: str) -> None:
    """Register a retired top-level command as an explanatory stub (this fork).

    The command keeps a friendly presence in ``--help`` and prints a removal
    notice (exit 1) instead of running; unknown flags still fail argparse.
    """
    def _removed(args) -> int:
        print(
            f"hermes {name}: {feature} was removed in this fork "
            "(localized, user-owned install of Hermes)."
        )
        return 1

    parser = subparsers.add_parser(
        name,
        help=f"(removed) {feature} \u2014 removed in this fork",
        description=f"{feature} was removed from this fork (localized, user-owned install of Hermes).",
    )
    parser.add_argument("removed_args", nargs="*", help=argparse.SUPPRESS)
    parser.set_defaults(func=_removed)
