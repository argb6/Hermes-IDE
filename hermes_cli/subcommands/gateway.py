"""``hermes gateway`` (REMOVED in this fork) and ``hermes proxy`` subcommand parsers.

The messaging gateway was removed from this fork: it is unused on this
install and the source is user-owned. ``hermes gateway`` registers a stub
that explains the removal; ``hermes proxy`` (a local OpenAI-compatible proxy
unrelated to messaging) is kept intact.
"""

from __future__ import annotations

from typing import Callable


def build_gateway_parser(
    subparsers, *, cmd_gateway: Callable, cmd_proxy: Callable, cmd_gateway_enroll: Callable
) -> None:
    """Attach the stub ``gateway`` and the real ``proxy`` subcommand."""
    # proxy: local OpenAI-compatible proxy attaching the user's OAuth provider credentials,
    # so external apps (Open WebUI, Karakeep, ...) ride a logged-in subscription.
    proxy_parser = subparsers.add_parser(
        "proxy", help="Local OpenAI-compatible proxy to OAuth providers",
        description="Run a local HTTP server that forwards OpenAI-compatible requests "
            "to an OAuth-authenticated provider (e.g. Nous Portal). External "
            "apps can point at the proxy with any bearer token; the proxy "
            "attaches your real credentials.")
    proxy_subparsers = proxy_parser.add_subparsers(dest="proxy_command")

    proxy_start = proxy_subparsers.add_parser("start", help="Run the proxy in the foreground")
    proxy_start.add_argument("--provider", default="nous",
        help="Upstream provider: nous or xai (default: nous). See `hermes proxy providers`.")
    proxy_start.add_argument("--host", default=None,
        help="Bind address (default: 127.0.0.1). Use 0.0.0.0 to expose on LAN.")
    proxy_start.add_argument("--port", type=int, default=None, help="Bind port (default: 8645)")

    proxy_subparsers.add_parser("status", help="Show which proxy upstreams are ready")
    proxy_subparsers.add_parser("providers", help="List available proxy upstream providers")
    proxy_parser.set_defaults(func=cmd_proxy)

    # gateway: removed. Accept (and ignore) any trailing words so legacy
    # invocations such as `hermes gateway status` reach the explanation
    # instead of an argparse "unrecognized arguments" error.
    gateway_parser = subparsers.add_parser(
        "gateway",
        help="(removed) Messaging gateway was removed in this fork",
        description=(
            "The messaging gateway (Telegram/Discord/WhatsApp/Weixin/...) was removed "
            "from this fork: it is unused on this install."
        ),
    )
    # NOTE: dest `gateway_command` (the original dest), never `command` — the
    # top-level subparsers already own args.command, and argparse parses
    # subparsers into the same namespace. `nargs="?"` (a plain string or None)
    # is required: main() hashes args.gateway_command against
    # _AGENT_SUBCOMMANDS, and a list would crash it (unhashable).
    gateway_parser.add_argument("gateway_command", nargs="?",
        help="Any gateway verb (accepted for compatibility; the gateway is removed)")
    gateway_parser.set_defaults(func=_cmd_gateway_removed)


def _cmd_gateway_removed(args) -> int:
    print(
        "hermes gateway: the messaging gateway was removed in this fork.\n"
        "  Messaging platforms are not used on this install; the command surface was retired."
    )
    return 1
