"""PR5: audio inbound/outbound tests."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.config import AudioUploadedPayload, CustomChatSettings
from plugins.platforms.custom_chat.events.schema import InboundEventError
from plugins.platforms.custom_chat.media import (
    synthesize_audio_url,
    transcribe_audio,
    validate_audio_payload,
)
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


def test_valid_audio_accepted():
    settings = CustomChatSettings()
    payload = AudioUploadedPayload(
        message_id="a1",
        mime_type="audio/ogg",
        size_bytes=1024,
        url="https://example.local/a.ogg",
    )
    validate_audio_payload(payload, settings)
    text = transcribe_audio(payload)
    assert "transcribed" in text.lower()


def test_unsupported_mime_rejected():
    settings = CustomChatSettings()
    payload = AudioUploadedPayload(
        message_id="a1",
        mime_type="audio/x-unknown",
        size_bytes=100,
        url="https://example.local/a.bin",
    )
    with pytest.raises(InboundEventError) as exc:
        validate_audio_payload(payload, settings)
    assert exc.value.code == "UNSUPPORTED_MEDIA_TYPE"


def test_tts_outbound_event_shape():
    audio = synthesize_audio_url("hello")
    assert audio["mime_type"] == "audio/mpeg"
    assert audio["url"].startswith("https://")


@pytest.mark.asyncio
async def test_audio_uploaded_invokes_transcription_path(adapter):
    received = []

    async def handler(event):
        received.append(event)

    adapter._message_handler = handler
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    ws = MockWebSocket()

    await adapter._on_ws_message(
        ws,
        sample_inbound(
            "audio.uploaded",
            {
                "message_id": "a1",
                "mime_type": "audio/ogg",
                "size_bytes": 512,
                "url": "https://example.local/v.ogg",
            },
        ),
    )
    assert len(received) == 1
    assert "transcribed" in received[0].text.lower()


@pytest.mark.asyncio
async def test_assistant_audio_emitted(adapter, parse_sent_events):
    ws = MockWebSocket()
    adapter._hub = WebSocketHub("127.0.0.1", 0, on_message=adapter._on_ws_message)
    adapter._reply_routes["aud-1"] = {
        "chat_id": "c1",
        "user_id": "u1",
        "thread_id": "",
        "session_id": "",
    }
    adapter._ws_by_chat["c1"] = ws
    await adapter.send(
        "c1",
        "spoken reply",
        metadata={"reply_id": "aud-1", "audio_response": True},
    )
    events = parse_sent_events(ws)
    audio_events = [e for e in events if e["type"] == "assistant_audio"]
    assert len(audio_events) == 1
    assert "mime_type" in audio_events[0]["payload"]
