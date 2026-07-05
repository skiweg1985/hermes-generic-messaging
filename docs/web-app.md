# custom_chat Web App

Browser UI and FastAPI BFF for Event Schema v1. Hermes must run the `custom_chat` plugin separately.

## Architecture

- **Frontend** (`web/frontend`): React terminal UI → WebSocket `/ws/chat`
- **BFF** (`web/backend`): proxies WS to the adapter; hosts media uploads and session persistence
- **Plugin** (`plugins/platforms/custom_chat`): Hermes gateway WebSocket (default port 8765)

## Environment (BFF)

| Variable | Default | Purpose |
|----------|---------|---------|
| `CUSTOM_CHAT_TARGET` | — | Hermes plugin target: host, `host:port`, or `ws://` URL (preferred) |
| `CUSTOM_CHAT_WS_URL` | `ws://127.0.0.1:8765` | Legacy upstream WebSocket URL (used when `CUSTOM_CHAT_TARGET` is unset) |
| `CUSTOM_CHAT_BEARER_TOKEN` | — | Bearer token for upstream |
| `WEB_CHAT_ID` | `workspace:demo` | Default `chat_id` in enriched events |
| `WEB_USER_ID` | `user-demo` | Default `user_id` |
| `WEB_MEDIA_UPLOAD_DIR` | `./data/uploads` | Stored uploaded media files |
| `WEB_SESSION_STORE_PATH` | `./data/chat_sessions.json` | Server-side browser session store used by `/api/v1/sessions` |
| `WEB_MAX_UPLOAD_BYTES` | `20971520` | Max upload size for the BFF media API |
| `WEB_ALLOWED_UPLOAD_MIME_TYPES` | see schema | Allowed MIME types for BFF uploads |
| `WEB_MAX_AUDIO_BYTES` | — | Legacy alias read only when `WEB_MAX_UPLOAD_BYTES` is unset |
| `WEB_FRONTEND_DIST_DIR` | `../frontend/dist` | Built React app served by the BFF in production |
| `WEB_PUBLIC_MEDIA_BASE_URL` | auto | Public browser-facing base URL in media upload responses |
| `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` | `WEB_PUBLIC_MEDIA_BASE_URL` | Media base URL announced to Hermes in `client.register`; use when Hermes needs a different URL than browsers |
| `CUSTOM_CHAT_INTERNAL_MEDIA_BASE_URL` | `WEB_PUBLIC_MEDIA_BASE_URL` | Legacy alias for `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` |
| `WEB_PUBLIC_HOST` | auto | Host part when auto-detecting public media URL |
| `WEB_PUBLIC_PORT` | `8000` | Port part when auto-detecting public media URL |
| `WEB_CORS_ORIGINS` | localhost:5173 | Comma-separated CORS origins |
| `WEB_CORS_REFLECT_ORIGIN` | `false` | When `true`, allow any `http(s)` Origin (dev/LAN) |

Copy `web/.env.example` to `web/.env` and set `CUSTOM_CHAT_TARGET` plus `CUSTOM_CHAT_BEARER_TOKEN`.

Upload limits are enforced twice: the BFF (`WEB_MAX_UPLOAD_BYTES`,
`WEB_ALLOWED_UPLOAD_MIME_TYPES`) and the plugin when it validates inbound
`audio.uploaded` / `file.uploaded` (`CUSTOM_CHAT_MAX_UPLOAD_BYTES`,
`CUSTOM_CHAT_ALLOWED_UPLOAD_MIME_TYPES`). Keep both in sync for production.

On connect, the BFF sends `client.register` with `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` (or `CUSTOM_CHAT_INTERNAL_MEDIA_BASE_URL`, or the auto-detected public media URL). The plugin uses that URL for outbound file uploads, so `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` on Hermes is optional when the web BFF is connected.

When Hermes runs in Docker and the BFF on the host, set `WEB_PUBLIC_MEDIA_BASE_URL` to a URL the adapter container can reach (e.g. `http://host.docker.internal:8000`).

When Hermes runs on a different machine on the LAN, set `CUSTOM_CHAT_TARGET` to the Hermes host and start the BFF with `BFF_HOST=0.0.0.0 ./scripts/dev.sh` so it binds beyond loopback. The BFF auto-detects a LAN IP for media URLs unless you set `WEB_PUBLIC_MEDIA_BASE_URL` explicitly.

## Run locally

```bash
# Repo root
pip install -e ".[dev,web]"

# Terminal 1 — Hermes with custom_chat enabled (see docs/custom_chat.md for config.yaml)

# Terminal 2 — BFF
cd web/backend
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd web/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Run production on one HTTPS port

Build the frontend and start the BFF with TLS. The BFF serves `web/frontend/dist`
at `/`, keeps `/api/v1/*` for API calls, and keeps `/ws/chat` for streaming.

```bash
cd web/frontend
npm install
npm run build

cd ../backend
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --ssl-certfile /path/to/cert.pem \
  --ssl-keyfile /path/to/key.pem
```

## UI features

- Text chat with streaming (`assistant_start` / `assistant_delta` / `assistant_done`)
- Slash commands (`/model`, …) via `command.create`
- Cancel active stream: `Ctrl+C` or type `cancel`
- Audio file attach (`:attach file`) and microphone (`:record start` / `stop`)
- Playback of `assistant_audio` responses
- Interactive approvals and confirmations via `assistant_buttons` -> `button.click`
- Slash-command option menus (`slash_pick`): button grid under assistant messages; click auto-sends full command (e.g. `/model gpt-4`)
- System/info bubbles via `assistant_notice`
- Image cards via `assistant_image`
- Typing indicator via `typing` (`start` / `stop`)
- Interrupted stream display when `assistant_done.payload.interrupted` is `true`
- Tool and reasoning text in the assistant stream (Telegram/Discord text parity); segment boundaries via `assistant_segment`; tool status via `assistant_notice` (`kind: tool`)
- Multiple local browser chat sessions, separated by `chat_id`
- Safe Markdown rendering for assistant text, notices, and button bodies

## Multi-chat behavior

The browser keeps one WebSocket connection and routes messages by `chat_id`.
New chats use `workspace:<uuid>` IDs. Inbound events for an unknown `chat_id`
automatically create a new tab and mark it unread.

Sessions, the active chat, and the most recent transcript lines are persisted in
`localStorage` and mirrored through the BFF session API at `/api/v1/sessions`.
The server store is a JSON file at `WEB_SESSION_STORE_PATH`; it keeps up to 80
sessions and 200 transcript lines per session. This is lightweight UI state, not
a durable Hermes conversation archive.

`thread_id` and `session_id` are preserved when present on rendered interactive
events and are sent back with `button.click`. Conversation separation is still
based on `chat_id`.

## Markdown safety

Assistant text, notices, image captions, and interactive button bodies render as
GFM Markdown with line breaks, lists, tables, code, and links. Raw HTML is not
enabled, and rendered content is sanitized before display. Links are limited to
safe protocols (`http`, `https`, `mailto`) and open in a new tab.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Liveness |
| GET | `/api/v1/diagnostics` | BFF liveness plus a BFF→upstream reachability probe (`bff`, `upstream.status`, `upstream.target`). The target is `host:port` only; credentials are never returned. |
| GET | `/api/v1/sessions` | Load persisted browser chat-session state |
| PUT | `/api/v1/sessions` | Save/merge persisted browser chat-session state |
| POST | `/api/v1/media/upload` | Multipart media upload |
| GET | `/api/v1/media/{file_id}` | Serve uploaded file |
| WS | `/ws/chat` | Event proxy to adapter, including `button.click` |

## Tests

```bash
python -m pytest tests/plugins/custom_chat tests/web -q
cd web/frontend && npm test
```
