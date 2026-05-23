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


def _build_message_event(
    MessageEvent: Any,
    *,
    text: str,
    message_type: Any,
    source: Any,
    message_id: str,
    raw_message: Optional[dict] = None,
    media_urls: Optional[list[str]] = None,
    media_types: Optional[list[str]] = None,
) -> Any:
    """Construct a MessageEvent, tolerating older Hermes signatures."""
    kwargs: dict[str, Any] = {
        "text": text,
        "message_type": message_type,
        "source": source,
        "message_id": message_id,
    }
    if raw_message is not None:
        kwargs["raw_message"] = raw_message
    if media_urls is not None:
        kwargs["media_urls"] = media_urls
    if media_types is not None:
        kwargs["media_types"] = media_types
    try:
        return MessageEvent(**kwargs)
    except TypeError:
        # Fallback for test stubs / older signatures that lack the extra
        # fields. Drop optional keys and retry.
        for opt_key in ("raw_message", "media_urls", "media_types"):
            kwargs.pop(opt_key, None)
        return MessageEvent(**kwargs)


def inbound_to_message_event(
    envelope: EventEnvelope,
    payload_model: Any,
    source: Any,
    *,
    transcribed_text: Optional[str] = None,
) -> Any:
    MessageEvent, MessageType = _hermes_types()
    if MessageEvent is None:
        raise InboundEventError(
            "INTERNAL_ERROR",
            "hermes-agent not installed; MessageEvent unavailable",
        )

    if envelope.type == "message.create":
        return _build_message_event(
            MessageEvent,
            text=payload_model.text,
            message_type=MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
        )

    if envelope.type == "command.create":
        # Pass slash text through verbatim — the gateway runner detects the
        # leading slash itself, just like the Telegram adapter.
        return _build_message_event(
            MessageEvent,
            text=payload_model.command,
            message_type=MessageType.TEXT,
            source=source,
            message_id=payload_model.message_id,
        )

    if envelope.type == "audio.uploaded":
        text = transcribed_text or f"[audio:{payload_model.mime_type}]"
        media_url = payload_model.url or payload_model.file_ref
        media_urls = [media_url] if media_url else []
        media_types = [payload_model.mime_type] if payload_model.mime_type else []
        audio_msg_type = getattr(MessageType, "AUDIO", MessageType.TEXT)
        return _build_message_event(
            MessageEvent,
            text=text,
            message_type=audio_msg_type,
            source=source,
            message_id=payload_model.message_id,
            media_urls=media_urls,
            media_types=media_types,
            raw_message={
                "mime_type": payload_model.mime_type,
                "size_bytes": payload_model.size_bytes,
            },
        )

    raise InboundEventError("BAD_REQUEST", f"cannot map type {envelope.type}")
