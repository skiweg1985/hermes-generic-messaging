"""Audio validation, STT/TTS hooks, and local file publishing."""

from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional
from urllib import request as urllib_request
from urllib.error import URLError
from urllib.parse import unquote, urlparse

logger = logging.getLogger(__name__)

from custom_chat_schema.mime import normalize_mime_type

from .config import AudioUploadedPayload, CustomChatSettings, FileUploadedPayload
from .events.schema import InboundEventError

_PATH_TOKEN_RE = re.compile(
    r"file://[^\s\)\]\"'<>]+"
    r"|"
    r"/(?:[\w@.~-]+/)+[\w@.~-]+(?:\.[\w]{1,8})?",
)


def validate_file_payload(
    payload: AudioUploadedPayload | FileUploadedPayload,
    settings: CustomChatSettings,
) -> None:
    mime_type = normalize_mime_type(payload.mime_type)
    if mime_type not in settings.allowed_upload_mime_types:
        raise InboundEventError(
            "UNSUPPORTED_MEDIA_TYPE",
            f"mime type not allowed: {mime_type}",
        )
    if payload.size_bytes > settings.max_upload_bytes:
        raise InboundEventError(
            "PAYLOAD_TOO_LARGE",
            f"file exceeds max size {settings.max_upload_bytes}",
        )


def validate_audio_payload(
    payload: AudioUploadedPayload,
    settings: CustomChatSettings,
) -> None:
    validate_file_payload(payload, settings)
    if not normalize_mime_type(payload.mime_type).startswith("audio/"):
        raise InboundEventError(
            "UNSUPPORTED_MEDIA_TYPE",
            f"mime type not allowed for audio.uploaded: {payload.mime_type}",
        )


def _media_extension(mime_type: str) -> str:
    subtype = normalize_mime_type(mime_type).split("/", 1)[-1]
    return subtype if subtype and subtype != "octet-stream" else "bin"


def _fetch_media_path(url: str, mime_type: str) -> tuple[Path, bool]:
    """Return (path, is_temporary)."""
    if is_local_reference(url):
        return resolve_local_path(url), False
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise InboundEventError("BAD_REQUEST", f"unsupported media reference: {url}")
    tmp_dir = Path(tempfile.mkdtemp(prefix="custom_chat_audio_"))
    path = tmp_dir / f"audio.{_media_extension(mime_type)}"
    req = urllib_request.Request(url.strip())
    try:
        with urllib_request.urlopen(req, timeout=60) as resp:
            path.write_bytes(resp.read())
    except (URLError, OSError, TimeoutError) as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise InboundEventError(
            "BAD_REQUEST",
            f"could not download audio: {exc}",
        ) from exc
    return path, True


def _cleanup_temp_media(path: Path, is_temporary: bool) -> None:
    if not is_temporary:
        return
    try:
        shutil.rmtree(path.parent, ignore_errors=True)
    except OSError:
        pass


def _run_hermes_stt(path: Path) -> Optional[str]:
    try:
        from tools.transcription_tools import transcribe_audio as hermes_transcribe
    except ImportError:
        return None
    try:
        result = hermes_transcribe(str(path))
    except Exception as exc:
        logger.warning("Hermes STT failed for %s: %s", path, exc)
        return None
    if not isinstance(result, dict) or not result.get("success"):
        return None
    transcript = str(result.get("transcript") or "").strip()
    return transcript or None


def transcribe_audio(
    payload: AudioUploadedPayload | FileUploadedPayload,
    *,
    provider: Optional[str] = None,
) -> Optional[str]:
    """Download audio and run Hermes STT when available; else None."""
    _ = provider
    ref = (payload.url or payload.file_ref or "").strip()
    if not ref:
        return None
    is_temporary = False
    path: Optional[Path] = None
    try:
        path, is_temporary = _fetch_media_path(ref, payload.mime_type)
        if not path.is_file():
            return None
        return _run_hermes_stt(path)
    except InboundEventError:
        return None
    finally:
        if path is not None:
            _cleanup_temp_media(path, is_temporary)


def is_local_reference(url: str) -> bool:
    """True when *url* points at a path on disk, not an HTTP(S) resource."""
    if not url or not url.strip():
        return False
    stripped = url.strip()
    if stripped.startswith("file://"):
        return True
    parsed = urlparse(stripped)
    if parsed.scheme in {"http", "https"}:
        return False
    if stripped.startswith("/"):
        return True
    if len(stripped) > 2 and stripped[1] == ":" and stripped[2] in {"/", "\\"}:
        return True
    expanded = Path(stripped).expanduser()
    return expanded.is_absolute()


def resolve_local_path(url: str) -> Path:
    if url.strip().startswith("file://"):
        parsed = urlparse(url.strip())
        return Path(unquote(parsed.path))
    return Path(url.strip()).expanduser()


def guess_mime_type(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


def extract_local_paths(text: str) -> list[Path]:
    """Return existing local files referenced anywhere in *text*."""
    found: list[Path] = []
    seen: set[str] = set()
    for match in _PATH_TOKEN_RE.finditer(text or ""):
        token = match.group(0)
        if not is_local_reference(token):
            continue
        path = resolve_local_path(token)
        try:
            key = str(path.resolve())
        except OSError:
            key = str(path)
        if key in seen or not path.is_file():
            continue
        seen.add(key)
        found.append(path)
    return found


def strip_local_paths(text: str, paths: list[Path]) -> str:
    """Remove known local file paths (and empty image label lines) from *text*."""
    result = text or ""
    for path in paths:
        result = result.replace(str(path), "")
        result = result.replace(f"file://{path}", "")
    lines: list[str] = []
    for line in result.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if re.fullmatch(r"🖼️\s*Image:?", stripped, flags=re.IGNORECASE):
            continue
        if re.fullmatch(r"Image:", stripped, flags=re.IGNORECASE):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def publish_local_file_sync(path: Path, base_url: str) -> dict[str, Any]:
    """POST a local file to the web BFF media upload endpoint."""
    if not path.is_file():
        raise InboundEventError("BAD_REQUEST", f"file not found: {path}")
    mime = guess_mime_type(path)
    data = path.read_bytes()
    boundary = f"----customchat{uuid.uuid4().hex}"
    filename = path.name
    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            ).encode(),
            f"Content-Type: {mime}\r\n\r\n".encode(),
            data,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
    )
    upload_url = f"{base_url.rstrip('/')}/api/v1/media/upload"
    req = urllib_request.Request(
        upload_url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode())
    except urllib_request.HTTPError as exc:
        detail = exc.read().decode(errors="replace") if exc.fp else str(exc)
        raise InboundEventError(
            "BAD_REQUEST",
            f"media upload failed ({exc.code}): {detail}",
        ) from exc
    except OSError as exc:
        raise InboundEventError(
            "INTERNAL_ERROR",
            f"media upload unreachable at {upload_url}: {exc}",
        ) from exc
    if not isinstance(payload, dict) or not payload.get("url"):
        raise InboundEventError("INTERNAL_ERROR", "media upload returned no url")
    return payload


async def publish_local_file(
    path: Path,
    settings: CustomChatSettings,
    *,
    media_base_url: str | None = None,
) -> dict[str, Any]:
    base = (media_base_url or settings.media_public_base_url or "").strip().rstrip("/")
    if not base:
        raise InboundEventError(
            "INTERNAL_ERROR",
            "CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL is not configured",
        )
    return await asyncio.to_thread(publish_local_file_sync, path, base)


def synthesize_audio_url(text: str, *, mime_type: str = "audio/mpeg") -> dict[str, str]:
    """Placeholder TTS — returns a synthetic file reference."""
    _ = text
    return {
        "mime_type": mime_type,
        "url": f"https://example.local/tts/{hash(text) % 10**8}.{mime_type.split('/')[-1]}",
    }
