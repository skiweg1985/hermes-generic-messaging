import logging

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, media, sessions
from app.core.config import get_settings
from app.ws.chat_proxy import proxy_chat

logger = logging.getLogger(__name__)

app = FastAPI(title="custom_chat BFF", version="0.1.0")

settings = get_settings()
logger.info(
    "BFF media base announced to Hermes: %s (override via WEB_PUBLIC_MEDIA_BASE_URL)",
    settings.public_media_base_url,
)
if settings.cors_reflect_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_credentials=True,
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
app.include_router(media.router)
app.include_router(sessions.router)


@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket) -> None:
    await proxy_chat(websocket, get_settings())
