"""Tests for BFF client.register handshake payload."""

from __future__ import annotations

from app.core.config import Settings
from app.ws.chat_proxy import build_client_register


def test_build_client_register_payload():
    settings = Settings(
        web_chat_id="workspace:demo",
        web_user_id="user-demo",
        public_media_base_url="http://192.0.2.10:8000",
        custom_chat_media_base_url="http://127.0.0.1:8001",
    )
    event = build_client_register(settings)
    assert event["type"] == "client.register"
    assert event["schema_version"] == "v1"
    assert event["platform"] == "custom_chat"
    assert event["payload"]["public_media_base_url"] == "http://127.0.0.1:8001"
    assert event["payload"]["client_kind"] == "web_bff"
    assert event["chat_id"] == "workspace:demo"
    assert event["user_id"] == "user-demo"
