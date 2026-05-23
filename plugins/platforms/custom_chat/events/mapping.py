"""Map Event Schema v1 inbound events to Hermes MessageEvent."""

from __future__ import annotations

from typing import Any, Optional

from ..config import EventEnvelope
from .schema import InboundEventError


def _hermes_types():
    try:
        from gateway.platforms.base import MessageEvent, MessageType
    except ImportError:
        return None, None
    return MessageEvent, MessageType


def inbound_to_message_event(
    envelope: EventEnvelope,
    payload_model: Any,
    *,
    transcribed_text: Optional[str] = None,
) -> Any:
    MessageEvent, MessageType = _hermes_types()
    if MessageEvent is None:
        raise InboundEventError(
            "INTERNAL_ERROR",
            "hermes-agent not installed; MessageEvent unavailable",
        )

    chat_type = "dm"
    source = {
        "chat_id": envelope.chat_id,
        "chat_name": envelope.chat_id,
        "chat_type": chat_type,
        "user_id": envelope.user_id,
        "user_name": envelope.user_id,
        "thread_id": envelope.thread_id,
        "platform": envelope.platform,
        "session_id": envelope.session_id,
    }

    if envelope.type == "message.create":
        text = payload_model.text
        if text.startswith("/"):
            text = text
        return MessageEvent(
            text=text,
            message_type=MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
        )

    if envelope.type == "command.create":
        return MessageEvent(
            text=payload_model.command,
            message_type=MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
            metadata={"is_command": True},
        )

    if envelope.type == "audio.uploaded":
        text = transcribed_text or f"[audio:{payload_model.mime_type}]"
        media_url = payload_model.url or payload_model.file_ref
        return MessageEvent(
            text=text,
            message_type=MessageType.AUDIO if hasattr(MessageType, "AUDIO") else MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
            metadata={
                "mime_type": payload_model.mime_type,
                "size_bytes": payload_model.size_bytes,
                "media_url": media_url,
            },
        )

    raise InboundEventError("BAD_REQUEST", f"cannot map type {envelope.type}")
