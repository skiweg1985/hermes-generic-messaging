"""Fixtures for custom_chat plugin tests."""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, List

import pytest

from plugins.platforms.custom_chat.adapter import CustomChatAdapter
from plugins.platforms.custom_chat.config import CustomChatSettings
from tests.conftest import PlatformConfig


def sample_inbound(
    event_type: str,
    payload: dict[str, Any],
    *,
    event_id: str = "evt-1",
    chat_id: str = "workspace:conv1",
    user_id: str = "user-1",
) -> dict[str, Any]:
    return {
        "schema_version": "v1",
        "event_id": event_id,
        "timestamp": "2026-05-23T10:00:00Z",
        "platform": "custom_chat",
        "chat_id": chat_id,
        "user_id": user_id,
        "type": event_type,
        "payload": payload,
    }


class MockWebSocket:
    def __init__(self, auth: str = "") -> None:
        self.sent: List[str] = []
        self.request_headers = {"Authorization": auth} if auth else {}

    async def send(self, data: str) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        _ = code, reason


@pytest.fixture
def settings() -> CustomChatSettings:
    return CustomChatSettings(
        enabled=True,
        ws_host="127.0.0.1",
        ws_port=18765,
        bearer_token="test-token",
    )


@pytest.fixture
def adapter(settings: CustomChatSettings) -> CustomChatAdapter:
    cfg = PlatformConfig(
        extra={
            "enabled": True,
            "bearer_token": settings.bearer_token,
            "ws_host": settings.ws_host,
            "ws_port": settings.ws_port,
        }
    )
    ad = CustomChatAdapter(cfg)
    ad.settings = settings
    return ad


@pytest.fixture
def parse_sent_events():
    def _parse(ws: MockWebSocket) -> list[dict[str, Any]]:
        return [json.loads(s) for s in ws.sent]

    return _parse
