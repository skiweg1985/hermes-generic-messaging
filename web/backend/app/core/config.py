"""BFF settings from environment."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path

from custom_chat_schema.schema import DEFAULT_ALLOWED_UPLOAD_MIME_TYPES
from pydantic import BaseModel, Field

from app.core.network import resolve_custom_chat_ws_url, resolve_public_media_base_url

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int, *, fallback_name: str | None = None) -> int:
    """Parse an integer env var, logging and falling back on a malformed value
    instead of raising (a ValueError here would 500 every request via the
    lru_cache'd get_settings)."""
    raw = os.getenv(name)
    if raw is None and fallback_name is not None:
        raw = os.getenv(fallback_name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        logger.warning("%s=%r is not an integer; using %d", name, raw, default)
        return default


def _load_web_dotenv() -> None:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


class Settings(BaseModel):
    custom_chat_target: str = ""
    custom_chat_ws_url: str = "ws://127.0.0.1:8765"
    custom_chat_bearer_token: str = ""
    web_auth_token: str = ""
    web_require_auth: bool = False
    web_chat_id: str = "workspace:demo"
    web_user_id: str = "user-demo"
    media_upload_dir: str = "./data/uploads"
    session_store_path: str = "./data/chat_sessions.json"
    frontend_dist_dir: str = "../frontend/dist"
    max_upload_bytes: int = 20 * 1024 * 1024
    public_media_base_url: str = "http://127.0.0.1:8000"
    custom_chat_media_base_url: str = "http://127.0.0.1:8000"
    allowed_upload_mime_types: list[str] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_UPLOAD_MIME_TYPES)
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]
    )
    cors_reflect_origin: bool = False


@lru_cache
def get_settings() -> Settings:
    _load_web_dotenv()
    origins = os.getenv("WEB_CORS_ORIGINS", "")
    allowed_uploads = os.getenv("WEB_ALLOWED_UPLOAD_MIME_TYPES", "").strip()
    parsed_allowed_uploads = [m.strip() for m in allowed_uploads.split(",") if m.strip()]
    cors = [o.strip() for o in origins.split(",") if o.strip()] or None
    max_upload_bytes = _env_int(
        "WEB_MAX_UPLOAD_BYTES",
        20 * 1024 * 1024,
        fallback_name="WEB_MAX_AUDIO_BYTES",
    )
    custom_chat_target = os.getenv("CUSTOM_CHAT_TARGET", "").strip()
    legacy_ws_url = os.getenv("CUSTOM_CHAT_WS_URL", "ws://127.0.0.1:8765")
    if not custom_chat_target and os.getenv("CUSTOM_CHAT_WS_URL"):
        logger.info(
            "CUSTOM_CHAT_WS_URL is set; prefer CUSTOM_CHAT_TARGET for new setups"
        )
    custom_chat_ws_url = resolve_custom_chat_ws_url(
        target=custom_chat_target or None,
        fallback_url=legacy_ws_url,
    )
    public_port_raw = os.getenv("WEB_PUBLIC_PORT", "").strip()
    public_port = _env_int("WEB_PUBLIC_PORT", 0) or None if public_port_raw else None
    public_media_base_url = resolve_public_media_base_url(
        explicit=os.getenv("WEB_PUBLIC_MEDIA_BASE_URL"),
        public_host=os.getenv("WEB_PUBLIC_HOST"),
        public_port=public_port,
    )
    custom_chat_media_base_url = (
        os.getenv("WEB_CUSTOM_CHAT_MEDIA_BASE_URL")
        or os.getenv("CUSTOM_CHAT_INTERNAL_MEDIA_BASE_URL")
        or public_media_base_url
    ).strip().rstrip("/")
    cors_reflect = os.getenv("WEB_CORS_REFLECT_ORIGIN", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    return Settings(
        custom_chat_target=custom_chat_target,
        custom_chat_ws_url=custom_chat_ws_url,
        custom_chat_bearer_token=os.getenv("CUSTOM_CHAT_BEARER_TOKEN", ""),
        web_auth_token=os.getenv("WEB_AUTH_TOKEN", ""),
        web_require_auth=os.getenv("WEB_REQUIRE_AUTH", "").strip().lower()
        in {"1", "true", "yes"},
        web_chat_id=os.getenv("WEB_CHAT_ID", "workspace:demo"),
        web_user_id=os.getenv("WEB_USER_ID", "user-demo"),
        media_upload_dir=os.getenv("WEB_MEDIA_UPLOAD_DIR", "./data/uploads"),
        session_store_path=os.getenv("WEB_SESSION_STORE_PATH", "./data/chat_sessions.json"),
        frontend_dist_dir=os.getenv("WEB_FRONTEND_DIST_DIR", "../frontend/dist"),
        max_upload_bytes=max_upload_bytes,
        public_media_base_url=public_media_base_url,
        custom_chat_media_base_url=custom_chat_media_base_url,
        allowed_upload_mime_types=parsed_allowed_uploads
        or list(DEFAULT_ALLOWED_UPLOAD_MIME_TYPES),
        cors_origins=cors
        or [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
        cors_reflect_origin=cors_reflect,
    )
