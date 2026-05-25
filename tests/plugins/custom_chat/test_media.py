"""PR5: audio inbound/outbound tests."""

from __future__ import annotations

import pytest

from plugins.platforms.custom_chat.config import (
    AudioUploadedPayload,
    CustomChatSettings,
    FileUploadedPayload,
    MessageAttachment,
)
from plugins.platforms.custom_chat.events.schema import InboundEventError
from plugins.platforms.custom_chat import adapter as adapter_module
from plugins.platforms.custom_chat import media as media_module
from plugins.platforms.custom_chat.media import (
    synthesize_audio_url,
    transcribe_attachment,
    transcribe_audio,
    validate_audio_payload,
    validate_file_payload,
    validate_message_attachment,
)
from plugins.platforms.custom_chat.transport.ws_server import WebSocketHub
from tests.plugins.custom_chat.conftest import MockWebSocket, sample_inbound


def test_valid_audio_accepted(monkeypatch, tmp_path):
    settings = CustomChatSettings()
    payload = AudioUploadedPayload(
        message_id="a1",
        mime_type="audio/ogg",
        size_bytes=1024,
        url="https://example.local/a.ogg",
    )
    validate_audio_payload(payload, settings)
    audio_path = tmp_path / "x.ogg"
    audio_path.write_bytes(b"fake")
    monkeypatch.setattr(media_module, "_run_hermes_stt", lambda _path: "hallo welt")
    monkeypatch.setattr(
        media_module,
        "_fetch_media_path",
        lambda _url, _mime: (audio_path, False),
    )
    text = transcribe_audio(payload)
    assert text == "hallo welt"


def test_webm_codecs_mime_accepted():
    settings = CustomChatSettings()
    payload = AudioUploadedPayload(
        message_id="a1",
        mime_type="audio/webm;codecs=opus",
        size_bytes=1024,
        url="https://example.local/a.webm",
    )
    validate_audio_payload(payload, settings)


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


def test_valid_file_accepted():
    settings = CustomChatSettings()
    payload = FileUploadedPayload(
        message_id="f1",
        filename="notes.pdf",
        mime_type="application/pdf",
        size_bytes=100,
        url="https://example.local/notes.pdf",
    )
    validate_file_payload(payload, settings)


def test_validate_message_attachment_accepts_supported_mime():
    settings = CustomChatSettings()
    att = MessageAttachment(
        attachment_id="att-1",
        mime_type="image/png",
        size_bytes=2048,
        url="https://example.local/cat.png",
        filename="cat.png",
    )
    validate_message_attachment(att, settings)


def test_validate_message_attachment_rejects_unsupported_mime():
    settings = CustomChatSettings()
    att = MessageAttachment(
        attachment_id="att-2",
        mime_type="application/x-unknown",
        size_bytes=2048,
        url="https://example.local/x.bin",
    )
    with pytest.raises(InboundEventError) as exc:
        validate_message_attachment(att, settings)
    assert exc.value.code == "UNSUPPORTED_MEDIA_TYPE"


def test_transcribe_attachment_runs_stt_for_audio(monkeypatch, tmp_path):
    audio_path = tmp_path / "voice.ogg"
    audio_path.write_bytes(b"fake")
    monkeypatch.setattr(media_module, "_run_hermes_stt", lambda _path: "spoken text")
    monkeypatch.setattr(
        media_module,
        "_fetch_media_path",
        lambda _url, _mime: (audio_path, False),
    )
    att = MessageAttachment(
        attachment_id="att-a",
        mime_type="audio/ogg",
        size_bytes=1234,
        url="https://example.local/voice.ogg",
    )
    assert transcribe_attachment(att) == "spoken text"


def test_transcribe_attachment_skips_non_audio():
    att = MessageAttachment(
        attachment_id="att-i",
        mime_type="image/png",
        size_bytes=1234,
        url="https://example.local/x.png",
    )
    assert transcribe_attachment(att) is None


@pytest.mark.asyncio
async def test_message_create_audio_attachment_transcribed(adapter, monkeypatch):
    monkeypatch.setattr(
        media_module, "transcribe_audio", lambda _payload, **_kw: "hello world"
    )
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
            {
                "message_id": "m1",
                "text": "",
                "attachments": [
                    {
                        "attachment_id": "att-1",
                        "mime_type": "audio/webm",
                        "size_bytes": 1024,
                        "url": "https://example.local/v.webm",
                        "filename": "recording.webm",
                    }
                ],
            },
        ),
    )

    assert len(received) == 1
    assert received[0].text == "hello world"
    assert received[0].media_urls == ["https://example.local/v.webm"]


@pytest.mark.asyncio
async def test_message_create_file_attachment_fallback_text(adapter):
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
            {
                "message_id": "m2",
                "text": "",
                "attachments": [
                    {
                        "attachment_id": "att-2",
                        "mime_type": "application/pdf",
                        "size_bytes": 4096,
                        "url": "https://example.local/doc.pdf",
                        "filename": "doc.pdf",
                    }
                ],
            },
        ),
    )

    assert len(received) == 1
    text = received[0].text
    assert "[file:application/pdf]" in text
    assert "doc.pdf" in text
    assert "https://example.local/doc.pdf" in text
    assert received[0].media_urls == ["https://example.local/doc.pdf"]


@pytest.mark.asyncio
async def test_message_create_attachment_rejects_unsupported_mime(
    adapter, parse_sent_events
):
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
            {
                "message_id": "m3",
                "text": "look",
                "attachments": [
                    {
                        "attachment_id": "att-bad",
                        "mime_type": "application/x-unknown",
                        "size_bytes": 100,
                        "url": "https://example.local/x.bin",
                    }
                ],
            },
        ),
    )

    assert received == []
    events = parse_sent_events(ws)
    errors = [e for e in events if e["type"] == "assistant_error"]
    assert errors and errors[0]["payload"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


@pytest.mark.asyncio
async def test_message_create_text_with_attachment_keeps_text(adapter):
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
            {
                "message_id": "m4",
                "text": "describe this image",
                "attachments": [
                    {
                        "attachment_id": "att-img",
                        "mime_type": "image/png",
                        "size_bytes": 512,
                        "url": "https://example.local/x.png",
                    }
                ],
            },
        ),
    )

    assert len(received) == 1
    assert received[0].text == "describe this image"
    assert received[0].media_urls == ["https://example.local/x.png"]


@pytest.mark.asyncio
async def test_audio_uploaded_invokes_transcription_path(adapter, monkeypatch):
    monkeypatch.setattr(
        adapter_module,
        "transcribe_audio",
        lambda _payload, **_kw: "voice note text",
    )
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
    assert received[0].text == "voice note text"


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
