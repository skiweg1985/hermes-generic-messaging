"""message.cancel resolves line/segment ids and emits assistant_done(interrupted)."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


@pytest.mark.asyncio
async def test_cancel_by_reply_id_emits_interrupted_done(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws
    adapter._reply_routes["reply-1"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter.state.register_stream("reply-1")

    await adapter._on_ws_message(
        ws,
        {
            "schema_version": "v1",
            "event_id": "evt-cancel-1",
            "timestamp": "2026-01-01T00:00:00Z",
            "platform": "custom_chat",
            "chat_id": "c1",
            "user_id": "u1",
            "type": "message.cancel",
            "payload": {"target_message_id": "reply-1"},
        },
    )

    assert adapter.state.get_stream("reply-1") is None
    assert "reply-1" not in adapter._reply_routes

    events = parse_sent_events(ws)
    done = [e for e in events if e["type"] == "assistant_done"]
    assert len(done) == 1
    assert done[0]["payload"]["interrupted"] is True
    assert done[0]["payload"]["message_id"] == "reply-1"
    assert done[0]["payload"]["turn_message_id"] == "reply-1"


@pytest.mark.asyncio
async def test_cancel_by_segment_line_id(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws
    adapter._reply_routes["turn-a"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter.state.register_stream("turn-a")
    session = adapter.streams.get_or_create(
        "turn-a", chat_id="c1", user_id="assistant"
    )
    session.started = True
    session.active_line_id = "turn-a-s1"

    await adapter._on_ws_message(
        ws,
        {
            "schema_version": "v1",
            "event_id": "evt-cancel-2",
            "timestamp": "2026-01-01T00:00:01Z",
            "platform": "custom_chat",
            "chat_id": "c1",
            "user_id": "u1",
            "type": "message.cancel",
            "payload": {"target_message_id": "turn-a-s1"},
        },
    )

    events = parse_sent_events(ws)
    done = [e for e in events if e["type"] == "assistant_done"]
    assert len(done) == 1
    assert done[0]["payload"]["message_id"] == "turn-a-s1"
    assert done[0]["payload"]["turn_message_id"] == "turn-a"
    assert done[0]["payload"]["interrupted"] is True


@pytest.mark.asyncio
async def test_cancel_unknown_target_is_noop(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws
    adapter.state.register_stream("reply-z")
    adapter._reply_routes["reply-z"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }

    await adapter._on_ws_message(
        ws,
        {
            "schema_version": "v1",
            "event_id": "evt-cancel-3",
            "timestamp": "2026-01-01T00:00:02Z",
            "platform": "custom_chat",
            "chat_id": "c1",
            "user_id": "u1",
            "type": "message.cancel",
            "payload": {"target_message_id": "unknown-line"},
        },
    )

    assert "reply-z" in adapter._reply_routes
    events = parse_sent_events(ws)
    assert not any(e["type"] == "assistant_done" for e in events)
