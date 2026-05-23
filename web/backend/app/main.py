from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, media
from app.core.config import get_settings
from app.ws.chat_proxy import proxy_chat

app = FastAPI(title="custom_chat BFF", version="0.1.0")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(media.router)


@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket) -> None:
    await proxy_chat(websocket, get_settings())
