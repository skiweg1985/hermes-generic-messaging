"""Media upload validation and storage."""

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.services.media_store import MediaStore


@pytest.fixture
def store(tmp_path):
    settings = Settings(
        media_upload_dir=str(tmp_path),
        public_media_base_url="http://test.local",
        max_audio_bytes=1024,
    )
    return MediaStore(settings)


def test_save_and_resolve(store):
    result = store.save(b"x" * 10, "audio/ogg")
    assert result["mime_type"] == "audio/ogg"
    assert result["size_bytes"] == 10
    assert "file_id" in result
    path = store.resolve_path(str(result["file_id"]))
    assert path.exists()


def test_reject_mime(store):
    with pytest.raises(HTTPException) as exc:
        store.save(b"x", "image/png")
    assert exc.value.status_code == 415


def test_reject_size(store):
    with pytest.raises(HTTPException) as exc:
        store.save(b"x" * 2000, "audio/wav")
    assert exc.value.status_code == 413
