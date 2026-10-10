"""NO_PROXY matching shared by the LLM transport (``agent/process_bootstrap.py``) and the
gateway platform adapters (``gateway/platforms/base.py``).

One matcher so "is this host in NO_PROXY" has one answer everywhere: exact hosts, domain
suffixes (``example.com``, ``.example.com``, ``*.example.com``), IP literals, CIDR ranges,
optional ``host:port`` entries and ``*``. The stdlib ``proxy_bypass_environment`` understands
none of the CIDR / ``*.`` forms, which is why the LLM path used to route ``10.x`` endpoints
through the corporate proxy while Telegram/Discord bypassed it.

Leaf module: stdlib only, importable during early boot.
"""

from __future__ import annotations

import ipaddress
import os
import re
import sys
from urllib.parse import urlsplit

PROXY_ENV_KEYS = ("HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy")


def first_proxy_env_value() -> str:
    """First non-empty HTTPS_PROXY / HTTP_PROXY / ALL_PROXY value (any case), or ''."""
    return next((v for k in PROXY_ENV_KEYS if (v := (os.environ.get(k) or "").strip())), "")


def parse_windows_proxy_settings(
    proxy_enable: object, proxy_server: str | None, proxy_override: str | None,
) -> tuple[str, str] | None:
    """``(proxy_url, no_proxy_csv)`` from raw WinINET values, or None when no usable proxy.

    This is the Windows system proxy every GUI proxy tool (FlClash, Clash Verge,
    v2rayN, ...) configures — the Python HTTP stack never reads it (httpx only
    honours ``*_proxy`` env vars), so without this fallback the model transport
    ignores a system-proxy-mode tool entirely and users had to enable the tool's
    TUN/VPN mode to get model calls through.

    ``ProxyServer`` is either one ``host:port`` for every protocol or a
    semicolon list of ``protocol=host:port`` pairs; the ``https=`` entry wins
    (falling back to ``http=``), and a socks-only proxy is not usable by the
    httpx transport so it counts as absent. ``ProxyOverride`` (the system
    NO_PROXY) is a semicolon list; ``<local>`` approximates to the loopback
    hosts. Disabled (``ProxyEnable`` falsy) or empty → None.
    """
    if not proxy_enable or not str(proxy_server or "").strip():
        return None
    server = str(proxy_server).strip()
    if "=" in server:
        pairs = dict(part.split("=", 1) for part in server.split(";") if "=" in part)
        endpoint = pairs.get("https") or pairs.get("http")
        if not endpoint:
            return None
    else:
        endpoint = server
    host, port = split_host_port(endpoint)
    if not host:
        return None
    proxy_url = f"http://{host}:{port}" if port else f"http://{host}"
    entries = [
        "localhost,127.0.0.1,::1" if part.strip().lower() == "<local>" else part.strip()
        for part in re.split(r"[;\s]+", str(proxy_override or "")) if part.strip()
    ]
    return proxy_url, ",".join(entry for entry in entries if entry)


def windows_system_proxy() -> tuple[str, str] | None:
    """The current user's WinINET system proxy as ``(proxy_url, no_proxy_csv)``, or None.

    Registry read is Windows-only (``winreg``); every other platform returns None.
    """
    if sys.platform != "win32":
        return None
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
        )
        try:
            def read(name):
                try:
                    return winreg.QueryValueEx(key, name)[0]
                except OSError:
                    return None

            return parse_windows_proxy_settings(
                read("ProxyEnable"), read("ProxyServer"), read("ProxyOverride")
            )
        finally:
            winreg.CloseKey(key)
    except OSError:
        return None


def split_host_port(value: str) -> tuple[str, int | None]:
    """``(host, port)`` from a URL (scheme optional: ``//host/path``), ``[v6]:port``,
    ``host:port`` or bare host; host lowercased. A malformed URL port (``host:abc``,
    ``host:99999``) yields ``(host, None)`` rather than raising."""
    raw = str(value or "").strip()
    if not raw:
        return "", None
    if "://" in raw or raw.startswith("//"):
        parsed = urlsplit(raw)
        host = parsed.hostname or ""
        try:
            port = parsed.port
        except ValueError:  # ``host:abc`` / ``host:99999``: keep the host, drop the port
            port = None
    elif raw.startswith("[") and "]" in raw:
        host, _, rest = raw[1:].partition("]")
        port = int(rest[1:]) if rest.startswith(":") and rest[1:].isdigit() else None
    elif raw.count(":") == 1 and raw.rpartition(":")[2].isdigit():
        host, _, port_s = raw.rpartition(":")
        port = int(port_s)
    else:
        host, port = raw.strip("[]"), None
    return host.lower().rstrip("."), port


def no_proxy_entries(no_proxy_value: str | None = None) -> list[str]:
    """Comma/whitespace-separated NO_PROXY entries; from the environment (both casings) when
    ``no_proxy_value`` is None."""
    if no_proxy_value is None:
        no_proxy_value = ",".join(os.environ.get(key, "") for key in ("NO_PROXY", "no_proxy"))
    return [part for part in re.split(r"[\s,]+", no_proxy_value.strip()) if part]


# Loopback must never be dialed through a proxy. ``websockets>=14`` connects with
# ``proxy=True`` and resolves it via ``urllib.request.getproxies()`` — on macOS that reads the
# *system* proxy (``_scproxy``) even with no ``*_proxy`` env vars — so a local CDP endpoint
# (``ws://127.0.0.1:<port>/devtools/...``) is dialed through the proxy and the handshake dies
# with "did not receive a valid HTTP response" (#110565). ``urllib``'s bypass check honours
# NO_PROXY in both casings, so children get the entries appended; in-process dials pass
# ``proxy=None`` when the host is loopback.
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")


def is_loopback_host(host: str | None) -> bool:
    """True for a host that must always bypass a proxy: ``localhost`` or any loopback IP literal
    (``127.x.x.x``, ``::1``, ``::ffff:127.0.0.1``)."""
    host = str(host or "").strip().lower().strip("[]")
    ip = _ip_or_none(host)
    return host == "localhost" or (ip is not None and ip.is_loopback)


def loopback_connect_kwargs(url: str) -> dict:
    """``websockets.connect`` kwargs for an in-process dial: ``{"proxy": None}`` when ``url``
    targets loopback (skip the library's system-proxy auto-detection), else ``{}`` so remote
    endpoints keep the default proxy behaviour."""
    return {"proxy": None} if is_loopback_host(split_host_port(url)[0]) else {}


def loopback_request_kwargs(url: str) -> dict:
    """``requests.get`` kwargs for an in-process HTTP dial (CDP ``/json/version`` discovery /
    readiness): ``{"proxies": {"http": None, "https": None}}`` when ``url`` targets loopback so
    ``requests`` skips ``getproxies()`` (env and macOS system proxy), else ``{}``."""
    return {"proxies": {"http": None, "https": None}} if is_loopback_host(split_host_port(url)[0]) else {}


def add_loopback_no_proxy(env: dict) -> dict:
    """Append the loopback hosts to ``NO_PROXY`` / ``no_proxy`` in ``env`` (both casings),
    keeping every operator-provided entry; returns ``env``. An operator ``*`` (bypass everything)
    already covers loopback and would stop being the wildcard once anything is appended to it."""
    if any("*" in no_proxy_entries(env.get(key) or "") for key in ("NO_PROXY", "no_proxy")):
        return env  # both casings: requests/urllib read ``no_proxy`` first, so a loopback-only one would win
    for key in ("NO_PROXY", "no_proxy"):
        entries = no_proxy_entries(env.get(key) or "")
        missing = [host for host in LOOPBACK_HOSTS if host not in entries]
        if missing:
            env[key] = ",".join(entries + missing)
    return env


def _ip_or_none(value: str, parse=ipaddress.ip_address):
    """``parse(value)`` or None on ``ValueError`` (``parse`` is ip_address / ip_network)."""
    try:
        return parse(value)
    except ValueError:
        return None


def no_proxy_entry_matches(entry: str, host: str, port: int | None = None) -> bool:
    token = str(entry or "").strip().lower()
    if not token:
        return False
    if token == "*":
        return True
    token_host, token_port = split_host_port(token)
    if not token_host or (token_port is not None and (port is None or token_port != port)):
        return False
    host_ip = _ip_or_none(host)
    network = _ip_or_none(token_host, lambda v: ipaddress.ip_network(v, strict=False))
    if network is not None:  # CIDR or bare IP literal (a /32 / /128 network)
        return host_ip is not None and host_ip in network
    # ``*.example.com`` and ``.example.com`` both mean apex + subdomains (curl/requests
    # convention, and what is_host_excluded_by_no_proxy promised the Slack adapter).
    suffix = token_host.removeprefix("*").removeprefix(".")
    return host == suffix or host.endswith(f".{suffix}")


def should_bypass_proxy(
    target_hosts: str | list[str] | tuple[str, ...] | set[str] | None, *, no_proxy_value: str | None = None,
) -> bool:
    """True when NO_PROXY (the environment, or ``no_proxy_value``) matches at least one target
    host (a URL, ``host:port`` or bare host)."""
    entries = no_proxy_entries(no_proxy_value)
    if not entries or not target_hosts:
        return False
    candidates = [target_hosts] if isinstance(target_hosts, str) else list(target_hosts)
    return any(
        host and any(no_proxy_entry_matches(entry, host, port) for entry in entries)
        for host, port in map(split_host_port, map(str, candidates)))
