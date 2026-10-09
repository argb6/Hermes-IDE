#!/usr/bin/env python3
"""Ask the desktop IDE's already-running language server about a file.

The Electron main process owns pyright and typescript-language-server. This
tool only talks to that process over the loopback bridge the desktop opens
for local backend children. It never starts a language server. CLI sessions,
a desktop that is not running, and a server that is not ready all return
``status: unavailable``.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from tools.registry import registry

_ACTIONS = ("definition", "references", "hover", "documentSymbol", "diagnostics")
_POSITION_ACTIONS = {"definition", "references", "hover"}
_LOOPBACK = {"127.0.0.1", "::1"}
_MESSAGES = {
    "ide-not-running": (
        "Code intelligence is unavailable. The desktop IDE is not running, "
        "or this session is CLI-only."
    ),
    "bridge-not-loopback": "Code intelligence is unavailable. The IDE bridge is not on loopback.",
    "not-ready": "Code intelligence is unavailable. The language server is not ready.",
    "not-started": "Code intelligence is unavailable. The language server is not ready.",
    "unauthorized": "Code intelligence is unavailable. The IDE bridge rejected the session token.",
}


def _unavailable(reason: str) -> str:
    return json.dumps(
        {"status": "unavailable", "reason": reason, "message": _MESSAGES.get(reason, f"Code intelligence is unavailable ({reason}).")},
        ensure_ascii=False,
    )


def _endpoint():
    """Bridge coordinates from the desktop spawn env. Missing means no IDE."""
    host = (os.environ.get("HERMES_IDE_BRIDGE_HOST") or "").strip() or "127.0.0.1"
    port_raw = (os.environ.get("HERMES_IDE_BRIDGE_PORT") or "").strip()
    token = (os.environ.get("HERMES_IDE_BRIDGE_TOKEN") or "").strip()
    if not port_raw or not token:
        return None
    if host not in _LOOPBACK:
        return {"rejected": "bridge-not-loopback"}
    try:
        port = int(port_raw)
    except ValueError:
        return None
    if port < 1 or port > 65535:
        return None
    return {"host": host, "port": port, "token": token}


def _post(endpoint: dict, payload: dict) -> dict:
    host = endpoint["host"]
    netloc = f"[{host}]" if ":" in host else host
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"http://{netloc}:{endpoint['port']}/ide/query",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {endpoint['token']}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("bridge response was not an object")
    return parsed


def _from_bridge(body: dict) -> str:
    if body.get("status") == "ok":
        return json.dumps(body, ensure_ascii=False)
    reason = str(body.get("reason") or "unavailable")
    message = body.get("message") or _MESSAGES.get(reason, f"Code intelligence is unavailable ({reason}).")
    return json.dumps({**body, "status": "unavailable", "reason": reason, "message": message}, ensure_ascii=False)


def _valid_position(line: int | None, character: int | None) -> bool:
    if not isinstance(line, int) or line < 1:
        return False
    if character is None:
        return True
    return isinstance(character, int) and character >= 1


def code_intelligence_tool(
    action: str = "",
    path: str = "",
    line: int | None = None,
    character: int | None = None,
    workspace_root: str | None = None,
) -> str:
    """Return definition, references, hover, symbols, or diagnostics for ``path``."""
    name = (action or "").strip()
    if name not in _ACTIONS:
        return _unavailable("bad-action")
    file_path = (path or "").strip()
    if not file_path:
        return _unavailable("path-required")
    if name in _POSITION_ACTIONS and not _valid_position(line, character):
        return _unavailable("bad-position")
    endpoint = _endpoint()
    if endpoint is None:
        return _unavailable("ide-not-running")
    if endpoint.get("rejected"):
        return _unavailable(endpoint["rejected"])
    payload = {"action": name, "path": file_path}
    if isinstance(line, int):
        payload["line"] = line
    if isinstance(character, int):
        payload["character"] = character
    if workspace_root:
        payload["workspaceRoot"] = workspace_root
    try:
        body = _post(endpoint, payload)
    except (OSError, urllib.error.URLError, ValueError, json.JSONDecodeError):
        return _unavailable("ide-not-running")
    return _from_bridge(body)


CODE_INTELLIGENCE_SCHEMA = {
    "name": "code_intelligence",
    "description": (
        "Read-only question to the desktop IDE language server that is already "
        "running for this workspace: definition, references, hover, documentSymbol, "
        "or diagnostics for a source file. Does not edit the file and does not start "
        "a language server. When the desktop IDE is not running, the server is not "
        "ready, or this session is CLI-only, the result is status unavailable — "
        "relay that instead of retrying. line and character are 1-based."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": list(_ACTIONS),
                "description": "definition, references, hover, documentSymbol, or diagnostics.",
            },
            "path": {
                "type": "string",
                "description": "Source file to ask about. Python, TypeScript, or JavaScript.",
            },
            "line": {
                "type": "integer",
                "description": "1-based line. Required for definition, references, and hover.",
            },
            "character": {
                "type": "integer",
                "description": "1-based column. Defaults to 1 when omitted.",
            },
            "workspace_root": {
                "type": "string",
                "description": "Workspace folder the IDE opened. Omit to use the server already covering path.",
            },
        },
        "required": ["action", "path"],
    },
}


registry.register(
    name="code_intelligence",
    toolset="desktop_ui",
    schema=CODE_INTELLIGENCE_SCHEMA,
    handler=lambda args, **kw: code_intelligence_tool(
        action=args.get("action", ""),
        path=args.get("path", ""),
        line=args.get("line"),
        character=args.get("character"),
        workspace_root=args.get("workspace_root"),
    ),
    emoji="🔎",
)
