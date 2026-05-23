"""Local media storage for audio.uploaded URLs."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException

from app.core.config import Settings


class MediaStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = Path(settings.media_upload_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def validate_upload(self, mime_type: str, size_bytes: int) -> None:
        if mime_type not in self.settings.allowed_audio_mime_types:
            raise HTTPException(
                status_code=415,
                detail={
                    "code": "UNSUPPORTED_MEDIA_TYPE",
                    "message": f"mime type not allowed: {mime_type}",
                },
            )
        if size_bytes > self.settings.max_audio_bytes:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "PAYLOAD_TOO_LARGE",
                    "message": f"audio exceeds max size {self.settings.max_audio_bytes}",
                },
            )

    def save(self, data: bytes, mime_type: str) -> dict[str, str | int]:
        self.validate_upload(mime_type, len(data))
        file_id = str(uuid.uuid4())
        ext = mime_type.split("/")[-1] or "bin"
        path = self.root / f"{file_id}.{ext}"
        path.write_bytes(data)
        url = f"{self.settings.public_media_base_url}/api/v1/media/{file_id}"
        return {
            "file_id": file_id,
            "url": url,
            "mime_type": mime_type,
            "size_bytes": len(data),
        }

    def resolve_path(self, file_id: str) -> Path:
        if ".." in file_id or "/" in file_id or "\\" in file_id:
            raise HTTPException(status_code=400, detail="invalid file id")
        matches = list(self.root.glob(f"{file_id}.*"))
        if not matches:
            raise HTTPException(status_code=404, detail="file not found")
        return matches[0]
