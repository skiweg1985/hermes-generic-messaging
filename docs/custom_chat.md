# Custom Chat platform

WebSocket adapter for Hermes that implements **Event Schema v1**.

## Install

Symlink or copy the plugin into the Hermes user plugins directory:

```bash
ln -s "$(pwd)/plugins/platforms/custom_chat" ~/.hermes/plugins/custom_chat
```

User-installed platform plugins are **not** loaded until they appear in `plugins.enabled` (bundled platforms such as IRC load automatically).

## Enable

Add both blocks to `~/.hermes/config.yaml`. Hermes reads the **top-level** `platforms:` section from this file. A nested `gateway.platforms` block is **not** applied by the gateway loader.

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

Or enable via CLI:

```bash
hermes plugins enable custom_chat-platform
```

The lookup key is `custom_chat-platform` (from `plugin.yaml` `name:`), not `custom_chat`.

### `extra` fields

| Key | Required | Default | Purpose |
|-----|----------|---------|---------|
| `enabled` | yes (for WS server) | `false` | Plugin starts the WebSocket listener only when `extra.enabled` is true |
| `ws_host` | no | `127.0.0.1` | Bind address |
| `ws_port` | no | `8765` | Bind port |
| `bearer_token` | no* | — | Bearer token for WebSocket upgrade (*or set env, see below) |
| `rate_limit_per_minute` | no | `60` | Per-user rate limit |
| `dedupe_ttl_seconds` | no | `300` | Duplicate `event_id` window |

Top-level `platforms.custom_chat.enabled` tells Hermes to include the platform. The plugin additionally requires `extra.enabled: true` (or env-based enablement below).

## Environment variables

Set in `~/.hermes/.env` or the process environment. Env values **override** the matching `extra` keys when present.

| Variable | Purpose |
|----------|---------|
| `CUSTOM_CHAT_BEARER_TOKEN` | Bearer token on WebSocket upgrade; when set, also enables the platform via `env_enablement_fn` |
| `CUSTOM_CHAT_WS_HOST` | Bind address (only applied when set; does not overwrite YAML when unset) |
| `CUSTOM_CHAT_WS_PORT` | Bind port (only applied when set) |
| `CUSTOM_CHAT_ALLOWED_USERS` | Comma-separated user IDs allowed to interact |
| `CUSTOM_CHAT_ALLOW_ALL_USERS` | Set to allow any user ID |

Example for LAN access (VM or host `192.168.177.149`):

```bash
CUSTOM_CHAT_BEARER_TOKEN=YOUR_TOKEN_HERE
```

```yaml
platforms:
  custom_chat:
    enabled: true
    extra:
      enabled: true
      ws_host: "192.168.177.149"
      ws_port: 8765
```

Restart the gateway after config changes:

```bash
hermes gateway restart
```

Verify: `ss -tlnp | grep 8765` and gateway log lines `Connecting to custom_chat...` / `✓ custom_chat connected`.

## WebSocket client

Connect to `ws://<ws_host>:<ws_port>` with header:

```
Authorization: Bearer YOUR_TOKEN_HERE
```

Send JSON events per [universal-platform-adapter-v1.md](plans/universal-platform-adapter-v1.md).

### Minimal Python client

```python
import asyncio
import json
import uuid

import websockets

async def main():
    uri = "ws://127.0.0.1:8765"
    headers = {"Authorization": "Bearer YOUR_TOKEN_HERE"}
    async with websockets.connect(uri, additional_headers=headers) as ws:
        await ws.send(json.dumps({
            "schema_version": "v1",
            "event_id": str(uuid.uuid4()),
            "timestamp": "2026-05-23T10:00:00Z",
            "platform": "custom_chat",
            "chat_id": "workspace:demo",
            "user_id": "user-demo",
            "type": "message.create",
            "payload": {"message_id": str(uuid.uuid4()), "text": "Hello"},
        }))
        async for msg in ws:
            print(json.loads(msg))

asyncio.run(main())
```

## Slash commands

Messages starting with `/` are routed as `command.create` to the Hermes command layer (`/model`, `/reset`, etc.).

## Audio

Inbound `audio.uploaded` events require allowed MIME types and size under the configured maximum. Responses may include `assistant_audio` when TTS is requested.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Port 8765 not listening | `plugins.enabled` contains `custom_chat-platform`; `extra.enabled: true`; gateway restarted |
| Config ignored | Settings under top-level `platforms.custom_chat`, not `gateway.platforms` |
| `ws_host` / `ws_port` stay at defaults | Keys must be under `extra`, not directly under `custom_chat` |
| Log: `Skipping 'custom_chat-platform' (not in plugins.enabled)` | Add plugin to `plugins.enabled` or run `hermes plugins enable custom_chat-platform` |
| Log: `has no register() function` | Update plugin: `__init__.py` must export `register` (current repo version) |
| Connection closed immediately | Bearer token mismatch |
| `assistant_error` after connect | User allowlist (`CUSTOM_CHAT_ALLOWED_USERS`) or Hermes authorization for `user_id` |
| `RATE_LIMITED` errors | Reduce message frequency or raise `rate_limit_per_minute` in config extra |
| Duplicate messages ignored | Reused `event_id` within dedupe TTL |
| No streaming deltas | Gateway streaming enabled; adapter uses `send_draft` |
