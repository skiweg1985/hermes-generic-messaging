"""PR2: adapter boot, inbound mapping, outbound assistant_done."""

from __future__ import annotations

import json

import pytest

from plugins.platforms.custom_chat.adapter import CustomChatAdapter
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


@pytest.mark.asyncio
async def test_adapter_boot_when_enabled(adapter: CustomChatAdapter):
    adapter.settings.enabled = True
    adapter._hub = WebSocketHub(
        "127.0.0.1",
        0,
        on_message=adapter._on_ws_message,
        authenticate=adapter._authenticate_ws,
    )
    adapter._mark_connected()
    assert adapter._connected


@pytest.mark.asyncio
async def test_inbound_text_mapped_and_handle_message_called(adapter: CustomChatAdapter):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    data = sample_inbound(
        "message.create",
        {"message_id": "in-1", "text": "Hello Hermes"},
    )
    await adapter._on_ws_message(ws, data)

    assert len(received) == 1
    assert received[0].text == "Hello Hermes"
    assert received[0].message_id == "in-1"
    assert received[0].source.platform.value == "custom_chat"
    assert received[0].source.chat_id == "workspace:conv1"
    assert received[0].source.user_id == "user-1"


@pytest.mark.asyncio
async def test_inbound_text_preserves_reply_context(adapter: CustomChatAdapter):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    data = sample_inbound(
        "message.create",
        {
            "message_id": "in-reply",
            "text": "Yes, exactly",
            "reply_to_message_id": "quoted-1",
            "reply_to_text": "Original assistant text",
        },
    )
    await adapter._on_ws_message(ws, data)

    assert len(received) == 1
    assert received[0].text == "Yes, exactly"
    assert received[0].reply_to_message_id == "quoted-1"
    assert received[0].reply_to_text == "Original assistant text"


@pytest.mark.asyncio
async def test_outbound_assistant_done_fallback(adapter: CustomChatAdapter, parse_sent_events):
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()
    adapter._reply_routes["reply-1"] = {
        "chat_id": "workspace:conv1",
        "user_id": "user-1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._use_streaming = False
    adapter._ws_by_chat["workspace:conv1"] = ws

    result = await adapter.send(
        "workspace:conv1",
        "Final answer",
        metadata={"reply_id": "reply-1"},
    )
    assert result.success
    events = parse_sent_events(ws)
    types = [e["type"] for e in events]
    assert "assistant_start" in types
    assert "assistant_done" in types
    done = [e for e in events if e["type"] == "assistant_done"][0]
    assert done["payload"]["final_text"] == "Final answer"
