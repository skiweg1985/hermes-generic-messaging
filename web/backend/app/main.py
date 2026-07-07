import logging
from pathlib import Path

from fastapi import Depends, FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import diagnostics, health, media, sessions
from app.core.auth import require_http_bff_auth, require_websocket_bff_auth
from app.core.config import get_settings
from app.ws.chat_proxy import proxy_chat

logger = logging.getLogger(__name__)

app = FastAPI(title="custom_chat BFF", version="0.1.0")

settings = get_settings()
logger.info(
    "BFF media base announced to Hermes: %s (override via WEB_CUSTOM_CHAT_MEDIA_BASE_URL)",
    settings.custom_chat_media_base_url,
)
logger.info("BFF public media base for browsers: %s", settings.public_media_base_url)
if settings.cors_reflect_origin:
    # Reflecting arbitrary origins with credentials would let any site read a
    # victim's stored sessions/media. When reflecting, credentials must be off.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(health.router)
app.include_router(
    diagnostics.router,
    dependencies=[Depends(require_http_bff_auth)],
)
app.include_router(media.router, dependencies=[Depends(require_http_bff_auth)])
app.include_router(sessions.router, dependencies=[Depends(require_http_bff_auth)])


@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket) -> None:
    settings = get_settings()
    if not await require_websocket_bff_auth(websocket, settings):
        return
    await proxy_chat(websocket, settings)


def _mount_frontend() -> None:
    dist_dir = Path(settings.frontend_dist_dir)
    if not dist_dir.is_absolute():
        dist_dir = (Path(__file__).resolve().parents[1] / dist_dir).resolve()
    index = dist_dir / "index.html"
    if not index.is_file():
        logger.info("Frontend dist not mounted; %s is missing", index)
        return

    assets = dist_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str = "") -> FileResponse:
        candidate = (dist_dir / path).resolve() if path else index
        try:
            candidate.relative_to(dist_dir)
        except ValueError:
            candidate = index
        if candidate.is_file() and candidate.name != "index.html":
            return FileResponse(candidate)
        return FileResponse(index)

    logger.info("Mounted frontend dist from %s", dist_dir)


_mount_frontend()
