"""code_intelligence talks only to the desktop loopback bridge."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from toolsets import TOOLSETS
from tools.code_intelligence_tool import code_intelligence_tool
from tools.registry import registry

TOKEN = "test-token"


def _clear_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("HERMES_IDE_BRIDGE_HOST", "HERMES_IDE_BRIDGE_PORT", "HERMES_IDE_BRIDGE_TOKEN"):
        monkeypatch.delenv(name, raising=False)


def test_cli_or_missing_desktop_returns_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_bridge(monkeypatch)
    body = json.loads(code_intelligence_tool(action="hover", path="app.py", line=1, character=1))
    assert body["status"] == "unavailable"
    assert body["reason"] == "ide-not-running"
    assert "unavailable" in body["message"].lower() or "unavailable" in body["message"]


def test_non_loopback_host_is_refused_without_connecting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HERMES_IDE_BRIDGE_HOST", "10.1.1.1")
    monkeypatch.setenv("HERMES_IDE_BRIDGE_PORT", "9")
    monkeypatch.setenv("HERMES_IDE_BRIDGE_TOKEN", TOKEN)

    def fail(*_args, **_kwargs):
        raise AssertionError("refused host must not open a socket")

    monkeypatch.setattr("tools.code_intelligence_tool.urllib.request.urlopen", fail)
    body = json.loads(code_intelligence_tool(action="definition", path="app.py", line=2, character=3))
    assert body["status"] == "unavailable"
    assert body["reason"] == "bridge-not-loopback"


def test_ready_server_returns_definition(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            seen["auth"] = self.headers.get("Authorization")
            seen["body"] = json.loads(self.rfile.read(length).decode("utf-8"))
            payload = json.dumps({"status": "ok", "result": [{"uri": "file:///app.py"}]}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, fmt, *args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    monkeypatch.setenv("HERMES_IDE_BRIDGE_HOST", "127.0.0.1")
    monkeypatch.setenv("HERMES_IDE_BRIDGE_PORT", str(port))
    monkeypatch.setenv("HERMES_IDE_BRIDGE_TOKEN", TOKEN)
    try:
        body = json.loads(registry.dispatch("code_intelligence", {
            "action": "definition",
            "path": "/work/app.py",
            "line": 4,
            "character": 2,
        }))
    finally:
        server.shutdown()
        server.server_close()

    assert body["status"] == "ok"
    assert body["result"] == [{"uri": "file:///app.py"}]
    assert seen["auth"] == f"Bearer {TOKEN}"
    assert seen["body"]["action"] == "definition"
    assert seen["body"]["line"] == 4


def test_not_ready_bridge_is_passed_through(monkeypatch: pytest.MonkeyPatch) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            self.rfile.read(length)
            payload = json.dumps({"status": "unavailable", "reason": "not-started"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, fmt, *args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("HERMES_IDE_BRIDGE_HOST", "127.0.0.1")
    monkeypatch.setenv("HERMES_IDE_BRIDGE_PORT", str(server.server_address[1]))
    monkeypatch.setenv("HERMES_IDE_BRIDGE_TOKEN", TOKEN)
    try:
        body = json.loads(code_intelligence_tool(action="hover", path="app.py", line=1))
    finally:
        server.shutdown()
        server.server_close()

    assert body["status"] == "unavailable"
    assert body["reason"] == "not-started"
    assert "not ready" in body["message"]


def test_tool_is_desktop_only_and_read_only() -> None:
    entry = registry.get_entry("code_intelligence")
    assert entry is not None
    assert entry.toolset == "desktop_ui"
    assert "code_intelligence" in TOOLSETS["desktop_ui"]["tools"]
    assert "code_intelligence" not in TOOLSETS["hermes-cli"]["tools"]
    description = entry.schema["description"]
    assert "read-only" in description.lower() or "Does not edit" in description
    assert "offset" not in entry.schema["parameters"]["properties"]
    assert "limit" not in entry.schema["parameters"]["properties"]
