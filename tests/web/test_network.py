"""Tests for BFF network and target resolution."""

from __future__ import annotations

import pytest

from app.core import network as network_module
from app.core.network import resolve_custom_chat_ws_url, resolve_public_media_base_url


def test_resolve_custom_chat_target_host_only():
    url = resolve_custom_chat_ws_url(
        target="192.0.2.10",
        fallback_url="ws://127.0.0.1:8765",
    )
    assert url == "ws://192.0.2.10:8765"


def test_resolve_custom_chat_target_host_port():
    url = resolve_custom_chat_ws_url(
        target="192.0.2.10:9000",
        fallback_url="ws://127.0.0.1:8765",
    )
    assert url == "ws://192.0.2.10:9000"


def test_resolve_custom_chat_target_ws_url():
    url = resolve_custom_chat_ws_url(
        target="wss://hermes.example.local/ws",
        fallback_url="ws://127.0.0.1:8765",
    )
    assert url == "wss://hermes.example.local/ws"


def test_resolve_custom_chat_target_fallback():
    url = resolve_custom_chat_ws_url(
        target="",
        fallback_url="ws://127.0.0.1:8765",
    )
    assert url == "ws://127.0.0.1:8765"


def test_resolve_public_media_explicit():
    url = resolve_public_media_base_url(
        explicit="http://host.docker.internal:8000",
        public_host="ignored",
        bff_host="0.0.0.0",
    )
    assert url == "http://host.docker.internal:8000"


def test_resolve_public_media_host_port():
    url = resolve_public_media_base_url(
        explicit="",
        public_host="192.0.2.20",
        public_port=8000,
        bff_host="127.0.0.1",
    )
    assert url == "http://192.0.2.20:8000"


def test_resolve_public_media_loopback_bind_falls_back_to_lan(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(network_module, "get_primary_ipv4", lambda: "192.0.2.30")
    url = resolve_public_media_base_url(
        explicit="",
        public_host="",
        public_port=8000,
        bff_host="127.0.0.1",
    )
    assert url == "http://192.0.2.30:8000"


def test_resolve_public_media_no_bff_host_uses_lan_default(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("BFF_HOST", raising=False)
    monkeypatch.delenv("WEB_PUBLIC_HOST", raising=False)
    monkeypatch.delenv("WEB_PUBLIC_MEDIA_BASE_URL", raising=False)
    monkeypatch.setattr(network_module, "get_primary_ipv4", lambda: "192.0.2.40")
    url = resolve_public_media_base_url(
        explicit="",
        public_host="",
        public_port=8000,
        bff_host=None,
    )
    assert url == "http://192.0.2.40:8000"


def test_resolve_public_media_lan_fallback_to_loopback_when_no_lan(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(network_module, "get_primary_ipv4", lambda: None)
    url = resolve_public_media_base_url(
        explicit="",
        public_host="",
        public_port=8000,
        bff_host="127.0.0.1",
    )
    assert url == "http://127.0.0.1:8000"


def test_resolve_public_media_explicit_bind_host_kept(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(network_module, "get_primary_ipv4", lambda: "10.0.0.1")
    url = resolve_public_media_base_url(
        explicit="",
        public_host="",
        public_port=8000,
        bff_host="192.0.2.99",
    )
    assert url == "http://192.0.2.99:8000"
