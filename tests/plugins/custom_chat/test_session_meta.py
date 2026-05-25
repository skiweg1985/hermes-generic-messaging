"""Outbound ``session_meta`` event for Hermes-generated session titles."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


@pytest.mark.asyncio
async def test_send_session_meta_emits_title(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._hub._clients.add(ws)
    adapter._hub.set_client_context(ws, chat_id="other-chat", user_id="u1")

    result = await adapter.send_session_meta(
        chat_id="c1",
        title="Refactor billing service",
        session_id="sess-7",
        thread_id="thread-3",
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "session_meta"
    assert ev["chat_id"] == "c1"
    assert ev["session_id"] == "sess-7"
    assert ev["thread_id"] == "thread-3"
    assert ev["payload"] == {"title": "Refactor billing service"}


@pytest.mark.asyncio
async def test_send_session_meta_broadcasts_despite_stale_client_context(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._hub._clients.add(ws)
    adapter._hub.set_client_context(ws, chat_id="workspace:active", user_id="u1")
    adapter._ws_by_chat["workspace:background"] = ws

    result = await adapter.send_session_meta(
        chat_id="workspace:background",
        title="Auto generated title",
        session_id="sess-bg",
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    assert events[0]["chat_id"] == "workspace:background"
    assert events[0]["payload"]["title"] == "Auto generated title"


@pytest.mark.asyncio
async def test_send_session_meta_passes_extra(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._hub._clients.add(ws)

    result = await adapter.send_session_meta(
        chat_id="c1",
        title="Doc review",
        session_id="sess-9",
        extra={"tags": ["docs", "review"]},
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert events[0]["payload"]["title"] == "Doc review"
    assert events[0]["payload"]["extra"] == {"tags": ["docs", "review"]}
