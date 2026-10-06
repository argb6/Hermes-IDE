"""``hermes update`` subcommand parser — REMOVED in this fork.

This install owns its source: the local ``main`` branch no longer tracks
official upstream (the remote is renamed ``upstream``), and ``updates.check``
is off. The update command is retired outright because running it would
reset local work onto official code. It is registered as a stub so the
removal is explicit instead of a mystery "invalid choice".
"""

from __future__ import annotations

from typing import Callable


def build_update_parser(subparsers, *, cmd_update: Callable) -> None:
    """Register the disabled ``update`` stub (real updater removed)."""
    update_parser = subparsers.add_parser(
        "update",
        help="(removed) Update feature was removed — this install owns its source",
        description=(
            "The update command has been removed from this fork. The local checkout "
            "owns its source and no longer follows official upstream."
        ),
    )
    update_parser.set_defaults(func=_cmd_update_removed)


def _cmd_update_removed(args) -> int:
    print(
        "hermes update: this command was removed in this fork.\n"
        "  This install owns its source (local `main`; official repo = remote `upstream`)\n"
        "  and no longer follows official releases. To sync manually when you really want to:\n"
        "    git fetch upstream && git merge --ff-only upstream/main\n"
        "  (dependency + desktop rebuild may be required afterwards — see scripts/)."
    )
    return 1
