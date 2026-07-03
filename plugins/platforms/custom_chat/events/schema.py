"""Inbound event parsing and slash-command detection."""

from __future__ import annotations

from typing import Any, Optional

from ..config import (
    AudioUploadedPayload,
    ButtonClickPayload,
    CommandCreatePayload,
    EventEnvelope,
    FileUploadedPayload,
    MessageCancelPayload,
    MessageCreatePayload,
    parse_inbound_envelope,
)


class InboundEventError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def parse_inbound(data: dict[str, Any]) -> tuple[EventEnvelope, Any]:
    try:
        envelope = parse_inbound_envelope(data)
    except Exception as exc:
        raise InboundEventError("BAD_REQUEST", str(exc)) from exc

    payload_model: Any
    try:
        if envelope.type == "message.create":
            payload_model = MessageCreatePayload.model_validate(envelope.payload)
        elif envelope.type == "command.create":
            payload_model = CommandCreatePayload.model_validate(envelope.payload)
        elif envelope.type == "audio.uploaded":
            payload_model = AudioUploadedPayload.model_validate(envelope.payload)
        elif envelope.type == "file.uploaded":
            payload_model = FileUploadedPayload.model_validate(envelope.payload)
        elif envelope.type == "message.cancel":
            payload_model = MessageCancelPayload.model_validate(envelope.payload)
        elif envelope.type == "button.click":
            payload_model = ButtonClickPayload.model_validate(envelope.payload)
        else:
            raise InboundEventError("BAD_REQUEST", f"unsupported inbound type: {envelope.type}")
    except InboundEventError:
        raise
    except Exception as exc:
        if envelope.type == "button.click":
            raise InboundEventError(
                "BAD_REQUEST",
                "button.click requires message_id and button_id; confirm_id and choice are optional",
            ) from exc
        raise InboundEventError("BAD_REQUEST", str(exc)) from exc

    return envelope, payload_model


def text_to_command_event(envelope: EventEnvelope, text: str) -> EventEnvelope:
    """Convert message.create with slash text to command.create envelope."""
    cmd_payload = CommandCreatePayload(
        message_id=envelope.payload.get("message_id", ""),
        command=text.strip(),
    )
    return EventEnvelope(
        schema_version=envelope.schema_version,
        event_id=envelope.event_id,
        timestamp=envelope.timestamp,
        platform=envelope.platform,
        chat_id=envelope.chat_id,
        user_id=envelope.user_id,
        thread_id=envelope.thread_id,
        session_id=envelope.session_id,
        type="command.create",
        payload=cmd_payload.model_dump(),
    )
