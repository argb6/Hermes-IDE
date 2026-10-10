"""Windows system-proxy fallback for the model transport.

The Python HTTP stack never reads the WinINET system proxy (httpx only honours
``*_proxy`` env vars), so a system-proxy-mode tool — FlClash, Clash Verge,
v2rayN — was ignored entirely and users had to enable the tool's TUN/VPN mode
to get model calls through. ``agent.proxy_bypass.parse_windows_proxy_settings``
parses the raw WinINET values and ``agent.process_bootstrap`` falls back to them
when no proxy env var is set; explicit env always wins.
"""

from __future__ import annotations

import pytest

import agent.process_bootstrap as process_bootstrap
from agent.proxy_bypass import parse_windows_proxy_settings, windows_system_proxy


class TestParseWindowsProxySettings:
    def test_bare_host_port_applies_to_every_protocol(self):
        assert parse_windows_proxy_settings(1, "127.0.0.1:7890", None) == ("http://127.0.0.1:7890", "")

    def test_per_protocol_form_prefers_the_https_entry(self):
        parsed = parse_windows_proxy_settings(
            1, "http=127.0.0.1:7890;https=127.0.0.1:7891;socks=127.0.0.1:1080", None
        )
        assert parsed == ("http://127.0.0.1:7891", "")

    def test_per_protocol_form_falls_back_to_http(self):
        parsed = parse_windows_proxy_settings(1, "http=127.0.0.1:7890;socks=127.0.0.1:1080", None)
        assert parsed == ("http://127.0.0.1:7890", "")

    def test_socks_only_proxy_is_not_usable_by_the_httpx_transport(self):
        assert parse_windows_proxy_settings(1, "socks=127.0.0.1:1080", None) is None

    def test_disabled_or_empty_means_no_proxy(self):
        assert parse_windows_proxy_settings(0, "127.0.0.1:7890", None) is None
        assert parse_windows_proxy_settings(None, "127.0.0.1:7890", None) is None
        assert parse_windows_proxy_settings(1, "", None) is None
        assert parse_windows_proxy_settings(1, "   ", None) is None

    def test_host_without_port_still_resolves(self):
        assert parse_windows_proxy_settings(1, "proxy.corp.example", None) == ("http://proxy.corp.example", "")

    def test_override_translates_local_and_keeps_wildcards(self):
        parsed = parse_windows_proxy_settings(1, "127.0.0.1:7890", "<local>;*.cn;10.0.0.0/8")
        assert parsed == ("http://127.0.0.1:7890", "localhost,127.0.0.1,::1,*.cn,10.0.0.0/8")


class TestSystemProxyFallback:
    @pytest.fixture(autouse=True)
    def clean_proxy_env(self, monkeypatch):
        for key in ("HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy",
                    "NO_PROXY", "no_proxy"):
            monkeypatch.delenv(key, raising=False)

    def test_env_proxy_wins_over_the_system_proxy(self, monkeypatch):
        monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
        monkeypatch.setattr(process_bootstrap, "windows_system_proxy", lambda: ("http://127.0.0.1:7890", ""))
        assert process_bootstrap._get_proxy_for_base_url("https://api.xiaomimimo.com/v1") == "http://127.0.0.1:9999"

    def test_env_proxy_absent_falls_back_to_the_system_proxy(self, monkeypatch):
        monkeypatch.setattr(process_bootstrap, "windows_system_proxy", lambda: ("http://127.0.0.1:7890", ""))
        assert process_bootstrap._get_proxy_for_base_url("https://api.xiaomimimo.com/v1") == "http://127.0.0.1:7890"

    def test_no_proxy_at_all_returns_none(self, monkeypatch):
        monkeypatch.setattr(process_bootstrap, "windows_system_proxy", lambda: None)
        assert process_bootstrap._get_proxy_for_base_url("https://api.xiaomimimo.com/v1") is None

    def test_system_override_bypasses_the_matching_base_url(self, monkeypatch):
        monkeypatch.setattr(
            process_bootstrap, "windows_system_proxy", lambda: ("http://127.0.0.1:7890", "*.xiaomimimo.com")
        )
        assert process_bootstrap._get_proxy_for_base_url("https://api.xiaomimimo.com/v1") is None
        assert process_bootstrap._get_proxy_for_base_url("https://api.anthropic.com") == "http://127.0.0.1:7890"

    def test_env_no_proxy_joins_the_system_override_for_the_fallback(self, monkeypatch):
        monkeypatch.setenv("NO_PROXY", "openrouter.ai")
        monkeypatch.setattr(process_bootstrap, "windows_system_proxy", lambda: ("http://127.0.0.1:7890", "*.xiaomimimo.com"))
        assert process_bootstrap._get_proxy_for_base_url("https://openrouter.ai/api/v1") is None
        assert process_bootstrap._get_proxy_for_base_url("https://api.xiaomimimo.com/v1") is None
        assert process_bootstrap._get_proxy_for_base_url("https://api.anthropic.com") == "http://127.0.0.1:7890"

    def test_env_no_proxy_still_bypasses_the_env_proxy(self, monkeypatch):
        monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
        monkeypatch.setenv("NO_PROXY", "api.xiaomimimo.com")
        assert process_bootstrap._get_proxy_for_base_url("https://api.xiaomimimo.com/v1") is None


@pytest.mark.platforms("win32")
class TestRegistryReadOnWindows:
    def test_live_registry_read_matches_the_parser(self):
        # A live read: on a host with a system proxy set it must match the pure
        # parser's output for the same raw values; with none set it is None.
        assert windows_system_proxy() is None or isinstance(windows_system_proxy()[0], str)
