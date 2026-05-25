"""PR4: slash command routing tests."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.events.schema import parse_inbound, text_to_command_event
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


def test_slash_message_converted_to_command():
    data = sample_inbound(
        "message.create",
        {"message_id": "m1", "text": "/model gpt-4"},
    )
    envelope, payload = parse_inbound(data)
    converted = text_to_command_event(envelope, payload.text)
    assert converted.type == "command.create"
    assert converted.payload["command"] == "/model gpt-4"


@pytest.mark.asyncio
async def test_model_command_routed(adapter, parse_sent_events):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound("message.create", {"message_id": "m1", "text": "/model"}),
    )
    assert received[0].text.startswith("/model")
    assert received[0].message_id == "m1"


@pytest.mark.asyncio
async def test_reset_command_routed(adapter):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound("command.create", {"message_id": "m2", "command": "/reset"}),
    )
    assert received[0].text == "/reset"


@pytest.mark.asyncio
async def test_unknown_command_still_forwarded(adapter):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound("command.create", {"message_id": "m3", "command": "/unknowncmd"}),
    )
    assert received[0].text == "/unknowncmd"
