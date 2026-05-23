"""PR3: streaming sequence and lifecycle tests."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.adapter import CustomChatAdapter
from plugins.platforms.custom_chat.streaming import StreamManager
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


def test_sequence_monotonicity():
    mgr = StreamManager()
    mgr.get_or_create("msg-1", chat_id="c", user_id="u")
    assert mgr.next_sequence("msg-1") == 1
    assert mgr.next_sequence("msg-1") == 2
    assert mgr.next_sequence("msg-1") == 3


@pytest.mark.asyncio
async def test_stream_lifecycle_start_delta_done(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["stream-1"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_draft("c1", 1, "Hel", metadata={"reply_id": "stream-1"})
    await adapter.send_draft("c1", 1, "Hello", metadata={"reply_id": "stream-1"})
    await adapter.send("c1", "Hello world", metadata={"reply_id": "stream-1"})

    events = parse_sent_events(ws)
    types = [e["type"] for e in events]
    assert types.count("assistant_start") == 1
    deltas = [e for e in events if e["type"] == "assistant_delta"]
    assert len(deltas) == 2
    assert deltas[0]["payload"]["sequence"] == 1
    assert deltas[1]["payload"]["sequence"] == 2
    assert events[-1]["type"] == "assistant_done"


@pytest.mark.asyncio
async def test_stream_failure_emits_error(adapter: CustomChatAdapter, parse_sent_events):
    ws = MockWebSocket()
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)

    await adapter._emit_error(
        chat_id="c1",
        user_id="u1",
        message_id="fail-1",
        code="STREAM_TIMEOUT",
        message="stream timed out",
        ws=ws,
    )
    events = parse_sent_events(ws)
    assert events[0]["type"] == "assistant_error"
    assert events[0]["payload"]["code"] == "STREAM_TIMEOUT"
