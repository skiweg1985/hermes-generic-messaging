# Hermes Generic Messaging

Universal Hermes platform adapter (`custom_chat`) that speaks **Event Schema v1** over WebSocket, plus a terminal-style web UI.

## Repository layout

| Path | Description |
|------|-------------|
| `plugins/platforms/custom_chat/` | Hermes platform plugin |
| `packages/custom_chat_schema/` | Shared Event Schema v1 models |
| `web/backend/` | FastAPI BFF (WS proxy, media upload, diagnostics, session persistence) |
| `web/frontend/` | React terminal chat UI |

## Plugin install

**Python ≥ 3.10.** On servers where `pip install --user` fails (permission denied, user-site disabled), use a **venv** — do not install into system Python.

```bash
./scripts/bootstrap-venv.sh
source .venv/bin/activate
```

Manual equivalent:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip setuptools wheel
pip install -e ".[dev]"
```

Plugin-only without web extras: `EXTRAS=dev ./scripts/bootstrap-venv.sh`

Copy or symlink this repo into the Hermes plugins directory:

```bash
ln -s "$(pwd)/plugins/platforms/custom_chat" ~/.hermes/plugins/custom_chat
```

Enable in `~/.hermes/config.yaml` (top-level `platforms:`, not `gateway.platforms:`):

```yaml
plugins:
  enabled:
    - custom_chat-platform

platforms:
  custom_chat:
    enabled: true
    extra:
      enabled: true
      ws_host: "127.0.0.1"
      ws_port: 8765
```

Set `CUSTOM_CHAT_BEARER_TOKEN` in `~/.hermes/.env`. Full setup, LAN bind, and troubleshooting: [docs/custom_chat.md](docs/custom_chat.md).

## Web app

```bash
source .venv/bin/activate   # after bootstrap-venv.sh
cd web/backend && uvicorn app.main:app --reload --port 8000
# other terminal:
cd web/frontend && npm install && npm run dev
```

See [docs/web-app.md](docs/web-app.md) and [web/README.md](web/README.md).

## Environment (plugin)

| Variable | Description |
|----------|-------------|
| `CUSTOM_CHAT_BEARER_TOKEN` | Bearer token for WebSocket clients |
| `CUSTOM_CHAT_WS_HOST` | Bind host (default `0.0.0.0`) |
| `CUSTOM_CHAT_WS_PORT` | Bind port (default `8765`) |

See [docs/custom_chat.md](docs/custom_chat.md) and [docs/interface_contract.md](docs/interface_contract.md).

## Tests

```bash
python -m pytest tests/plugins/custom_chat tests/web -q
cd web/frontend && npm test
```
