"""PR6: dedupe, cancel, auth, rate limit tests."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.state import AdapterState
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


def test_duplicate_event_processed_once():
    state = AdapterState(dedupe_ttl_seconds=300)
    assert state.is_duplicate("evt-dup") is False
    assert state.is_duplicate("evt-dup") is True


def test_cancel_stops_active_stream():
    state = AdapterState()
    handle = state.register_stream("stream-target")
    assert state.cancel_stream("stream-target") is True
    assert handle.cancelled is True


def test_unauthorized_ws_rejected():
    state = AdapterState()
    _ = state

    from plugins.platforms.custom_chat.adapter import CustomChatAdapter
    from tests.conftest import PlatformConfig

    ad = CustomChatAdapter(
        PlatformConfig(extra={"enabled": True, "bearer_token": "secret"})
    )
    ad.settings.bearer_token = "secret"
    ws_bad = MockWebSocket(auth="Bearer wrong")
    assert ad._authenticate_ws(ws_bad) is False
    ws_ok = MockWebSocket(auth="Bearer secret")
    assert ad._authenticate_ws(ws_ok) is True


def test_rate_limit_exceeded():
    state = AdapterState(rate_limit_per_minute=2)
    assert state.check_rate_limit("u1") is True
    assert state.check_rate_limit("u1") is True
    assert state.check_rate_limit("u1") is False


@pytest.mark.asyncio
async def test_duplicate_inbound_ignored(adapter):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    data = sample_inbound(
        "message.create",
        {"message_id": "m1", "text": "once"},
        event_id="same-evt",
    )
    await adapter._on_ws_message(ws, data)
    await adapter._on_ws_message(ws, data)
    assert len(received) == 1


@pytest.mark.asyncio
async def test_rate_limit_returns_error(adapter, parse_sent_events):
    adapter.settings.rate_limit_per_minute = 1
    adapter.state.rate_limit_per_minute = 1
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound("message.create", {"message_id": "m1", "text": "a"}, event_id="e1"),
    )
    await adapter._on_ws_message(
        ws,
        sample_inbound("message.create", {"message_id": "m2", "text": "b"}, event_id="e2"),
    )
    events = parse_sent_events(ws)
    errors = [e for e in events if e["type"] == "assistant_error"]
    assert any(e["payload"]["code"] == "RATE_LIMITED" for e in errors)


@pytest.mark.asyncio
async def test_cancel_prevents_stream_send(adapter):
    adapter._reply_routes["target"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter.state.register_stream("target")
    adapter.state.cancel_stream("target")
    result = await adapter.send_draft("c1", 1, "partial", metadata={"reply_id": "target"})
    assert result.success is False
