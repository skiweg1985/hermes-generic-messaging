"""interrupt_session_activity cancels open streams and emits assistant_done."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


@pytest.mark.asyncio
async def test_interrupt_marks_streams_cancelled(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c-int"] = ws
    adapter._reply_routes["reply-x"] = {
        "chat_id": "c-int",
        "user_id": "u",
        "thread_id": "",
        "session_id": "",
    }
    adapter.state.register_stream("reply-x")

    await adapter.interrupt_session_activity("c-int")

    handle = adapter.state.get_stream("reply-x")
    assert handle is None or handle.cancelled is True
    assert "reply-x" not in adapter._reply_routes

    events = parse_sent_events(ws)
    done = [e for e in events if e["type"] == "assistant_done"]
    assert len(done) == 1
    assert done[0]["payload"]["interrupted"] is True


@pytest.mark.asyncio
async def test_interrupt_unrelated_chat_is_noop(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c-other"] = ws
    adapter._reply_routes["reply-y"] = {
        "chat_id": "c-other",
        "user_id": "u",
        "thread_id": "",
        "session_id": "",
    }
    adapter.state.register_stream("reply-y")

    await adapter.interrupt_session_activity("c-different")

    assert "reply-y" in adapter._reply_routes
    assert parse_sent_events(ws) == []
