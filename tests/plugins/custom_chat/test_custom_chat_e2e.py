"""PR7: end-to-end scenarios across text, stream, command, and attachments."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


@pytest.mark.asyncio
async def test_e2e_text_stream_command_audio_file(adapter, parse_sent_events):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "message.create",
            {"message_id": "e2e-text", "text": "ping"},
            event_id="e2e-1",
        ),
    )
    assert received[-1].text == "ping"

    reply_id = list(adapter._reply_routes.keys())[-1]
    adapter._ws_by_chat["workspace:conv1"] = ws
    await adapter.send_draft("workspace:conv1", 1, "pong", metadata={"reply_id": reply_id})
    await adapter.send("workspace:conv1", "pong complete", metadata={"reply_id": reply_id})

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "command.create",
            {"message_id": "e2e-cmd", "command": "/reset"},
            event_id="e2e-2",
        ),
    )
    assert received[-1].text == "/reset"

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "audio.uploaded",
            {
                "message_id": "e2e-aud",
                "mime_type": "audio/ogg",
                "size_bytes": 200,
                "url": "https://example.local/e2e.ogg",
            },
            event_id="e2e-3",
        ),
    )
    assert "transcribed" in received[-1].text.lower()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "file.uploaded",
            {
                "message_id": "e2e-file",
                "filename": "report.pdf",
                "mime_type": "application/pdf",
                "size_bytes": 200,
                "url": "https://example.local/report.pdf",
            },
            event_id="e2e-4",
        ),
    )
    assert "[file:application/pdf]" in received[-1].text

    events = parse_sent_events(ws)
    outbound_types = {e["type"] for e in events}
    assert "assistant_delta" in outbound_types
    assert "assistant_done" in outbound_types
