import mimetypes

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.services.media_store import MediaStore

router = APIRouter(prefix="/api/v1/media", tags=["media"])


@router.post("/upload")
async def upload_media(file: UploadFile = File(...)) -> dict[str, str | int]:
    settings = get_settings()
    store = MediaStore(settings)
    max_bytes = settings.max_upload_bytes
    # Read at most max_bytes + 1 so an oversized upload is rejected without
    # pulling the entire (potentially multi-GB) body into memory first.
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "PAYLOAD_TOO_LARGE",
                "message": f"file exceeds max size {max_bytes}",
            },
        )
    mime = file.content_type or "application/octet-stream"
    return store.save(data, mime)


@router.get("/{file_id}")
async def get_media(file_id: str) -> FileResponse:
    settings = get_settings()
    store = MediaStore(settings)
    path = store.resolve_path(file_id)
    mime_type, _ = mimetypes.guess_type(str(path))
    return FileResponse(path, media_type=mime_type or "application/octet-stream")
