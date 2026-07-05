"""PR1: config and event schema validation tests."""

import pytest
from pydantic import ValidationError

from plugins.platforms.custom_chat import adapter as adapter_module
from plugins.platforms.custom_chat.config import (
    AudioUploadedPayload,
    CommandCreatePayload,
    CustomChatSettings,
    EventEnvelope,
    FileUploadedPayload,
    MessageCreatePayload,
    build_outbound_event,
    parse_inbound_envelope,
)


def test_settings_defaults_disabled():
    s = CustomChatSettings()
    assert s.enabled is False
    assert s.ws_host == "0.0.0.0"
    assert s.ws_port == 8765


def test_settings_from_extra(monkeypatch):
    monkeypatch.delenv("CUSTOM_CHAT_WS_PORT", raising=False)
    monkeypatch.delenv("CUSTOM_CHAT_BEARER_TOKEN", raising=False)
    monkeypatch.delenv("CUSTOM_CHAT_TTS_RESPONSE_FORMAT", raising=False)
    s = CustomChatSettings.from_env_and_extra(
        {
            "enabled": True,
            "ws_port": 9000,
            "bearer_token": "tok",
            "tts_response_format": "pcm",
        }
    )
    assert s.enabled is True
    assert s.ws_port == 9000
    assert s.bearer_token == "tok"
    assert s.tts_response_format == "pcm"


def test_inbound_envelope_valid():
    data = {
        "schema_version": "v1",
        "event_id": "e1",
        "timestamp": "2026-05-23T10:00:00Z",
        "platform": "custom_chat",
        "chat_id": "c1",
        "user_id": "u1",
        "type": "message.create",
        "payload": {"message_id": "m1", "text": "hi"},
    }
    env = parse_inbound_envelope(data)
    assert env.type == "message.create"
    msg = MessageCreatePayload.model_validate(env.payload)
    assert msg.text == "hi"


def test_inbound_unknown_type_rejected():
    data = {
        "schema_version": "v1",
        "event_id": "e1",
        "timestamp": "2026-05-23T10:00:00Z",
        "platform": "custom_chat",
        "chat_id": "c1",
        "user_id": "u1",
        "type": "unknown.event",
        "payload": {},
    }
    with pytest.raises(ValidationError):
        parse_inbound_envelope(data)


def test_command_must_start_with_slash():
    with pytest.raises(ValidationError):
        CommandCreatePayload(message_id="m1", command="model")


def test_audio_requires_url_or_file_ref():
    with pytest.raises(ValidationError):
        AudioUploadedPayload(message_id="m1", mime_type="audio/ogg", size_bytes=100)


def test_file_requires_url_or_file_ref():
    with pytest.raises(ValidationError):
        FileUploadedPayload(
            message_id="m1",
            filename="report.pdf",
            mime_type="application/pdf",
            size_bytes=100,
        )


def test_message_create_with_attachments():
    msg = MessageCreatePayload.model_validate(
        {
            "message_id": "m1",
            "text": "see files",
            "attachments": [
                {
                    "attachment_id": "a1",
                    "mime_type": "image/png",
                    "size_bytes": 1200,
                    "url": "https://example.local/i.png",
                    "filename": "i.png",
                }
            ],
        }
    )
    assert msg.text == "see files"
    assert len(msg.attachments) == 1
    assert msg.attachments[0].attachment_id == "a1"


def test_message_create_with_reply_context():
    msg = MessageCreatePayload.model_validate(
        {
            "message_id": "m-reply",
            "text": "answering this",
            "reply_to_message_id": "quoted-1",
            "reply_to_text": "quoted body",
        }
    )
    assert msg.reply_to_message_id == "quoted-1"
    assert msg.reply_to_text == "quoted body"


def test_message_create_requires_text_or_attachments():
    with pytest.raises(ValidationError):
        MessageCreatePayload(message_id="m1", text="")


def test_outbound_event_builder():
    ev = build_outbound_event(
        event_id="out-1",
        timestamp="2026-05-23T10:00:00Z",
        chat_id="c1",
        user_id="u1",
        event_type="assistant_done",
        payload={"message_id": "r1", "final_text": "done"},
    )
    assert ev["type"] == "assistant_done"
    assert ev["schema_version"] == "v1"


def test_show_reasoning_uses_hermes_home_and_caches_config(adapter, monkeypatch, tmp_path):
    monkeypatch.delenv("CUSTOM_CHAT_SHOW_REASONING", raising=False)
    monkeypatch.delenv("HERMES_CONFIG_PATH", raising=False)
    hermes_home = tmp_path / "hermes-home"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text(
        "display:\n  show_reasoning: true\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))

    original_safe_load = adapter_module.yaml.safe_load
    reads: list[str] = []

    def spy_safe_load(text: str):
        reads.append(text)
        return original_safe_load(text)

    monkeypatch.setattr(adapter_module.yaml, "safe_load", spy_safe_load)

    assert adapter._show_reasoning_enabled() is True
    assert adapter._show_reasoning_enabled() is True
    assert len(reads) == 1
