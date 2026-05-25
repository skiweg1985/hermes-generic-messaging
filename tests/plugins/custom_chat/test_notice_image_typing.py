"""send_private_notice, send_image, send_typing outbound events."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket


@pytest.mark.asyncio
async def test_send_private_notice_emits_notice_event(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_private_notice(
        "c1",
        "Provider switched to gpt-5",
        metadata={"kind": "info", "notice_id": "n-1"},
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "assistant_notice"
    assert ev["payload"]["text"] == "Provider switched to gpt-5"
    assert ev["payload"]["kind"] == "info"
    assert ev["payload"]["message_id"] == "n-1"


@pytest.mark.asyncio
async def test_send_image_emits_image_event(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_image(
        "c1",
        "https://example.local/cat.png",
        caption="a cat",
        metadata={"reply_id": "img-1", "mime_type": "image/png"},
    )

    assert result.success is True
    events = parse_sent_events(ws)
    assert len(events) == 1
    ev = events[0]
    assert ev["type"] == "assistant_image"
    assert ev["payload"]["url"] == "https://example.local/cat.png"
    assert ev["payload"]["caption"] == "a cat"
    assert ev["payload"]["mime_type"] == "image/png"
    assert ev["payload"]["message_id"] == "img-1"


@pytest.mark.asyncio
async def test_send_image_guesses_mime_without_metadata(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    result = await adapter.send_image(
        "c1",
        "https://example.local/cat.png",
        metadata={"reply_id": "img-2"},
    )

    assert result.success is True
    ev = parse_sent_events(ws)[0]
    assert ev["payload"]["mime_type"] == "image/png"


@pytest.mark.asyncio
async def test_send_typing_emits_typing_event(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_typing("c1")
    await adapter.stop_typing("c1")

    events = parse_sent_events(ws)
    typing_events = [e for e in events if e["type"] == "typing"]
    assert [e["payload"]["state"] for e in typing_events] == ["start", "stop"]


@pytest.mark.asyncio
async def test_late_typing_is_ignored_after_final_send(adapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._ws_by_chat["c1"] = ws

    await adapter.send_typing("c1")
    result = await adapter.send("c1", "done", metadata={"reply_id": "r1"})
    await adapter.send_typing("c1")

    assert result.success is True
    events = parse_sent_events(ws)
    assert [e["type"] for e in events] == [
        "typing",
        "assistant_start",
        "assistant_done",
        "typing",
    ]
    assert events[-1]["payload"]["state"] == "stop"
