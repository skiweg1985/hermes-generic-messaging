"""Audio validation and STT/TTS hooks."""

from __future__ import annotations

from typing import Optional

from .config import AudioUploadedPayload, CustomChatSettings
from .events.schema import InboundEventError


def validate_audio_payload(
    payload: AudioUploadedPayload,
    settings: CustomChatSettings,
) -> None:
    if payload.mime_type not in settings.allowed_audio_mime_types:
        raise InboundEventError(
            "UNSUPPORTED_MEDIA_TYPE",
            f"mime type not allowed: {payload.mime_type}",
        )
    if payload.size_bytes > settings.max_audio_bytes:
        raise InboundEventError(
            "PAYLOAD_TOO_LARGE",
            f"audio exceeds max size {settings.max_audio_bytes}",
        )


def transcribe_audio(
    payload: AudioUploadedPayload,
    *,
    provider: Optional[str] = None,
) -> str:
    """Placeholder STT — returns marker text until a provider is wired."""
    _ = provider
    ref = payload.url or payload.file_ref or ""
    return f"[transcribed audio {payload.mime_type} from {ref}]"


def synthesize_audio_url(text: str, *, mime_type: str = "audio/mpeg") -> dict[str, str]:
    """Placeholder TTS — returns a synthetic file reference."""
    _ = text
    return {
        "mime_type": mime_type,
        "url": f"https://example.local/tts/{hash(text) % 10**8}.{mime_type.split('/')[-1]}",
    }
