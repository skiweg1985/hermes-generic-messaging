# Custom Chat platform

WebSocket adapter for Hermes that implements **Event Schema v1**.

## Enable

```yaml
gateway:
  platforms:
    custom_chat:
      enabled: true
      extra:
        ws_host: "127.0.0.1"
        ws_port: 8765
        bearer_token: "YOUR_TOKEN_HERE"
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `CUSTOM_CHAT_BEARER_TOKEN` | Bearer token on WebSocket upgrade |
| `CUSTOM_CHAT_WS_HOST` | Bind address |
| `CUSTOM_CHAT_WS_PORT` | Bind port |
| `CUSTOM_CHAT_ALLOWED_USERS` | Comma-separated user IDs |

## WebSocket client

Connect to `ws://127.0.0.1:8765` with header:

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
| Connection closed immediately | Bearer token mismatch |
| `RATE_LIMITED` errors | Reduce message frequency or raise `rate_limit_per_minute` in config extra |
| Duplicate messages ignored | Reused `event_id` within dedupe TTL |
| No streaming deltas | Gateway streaming enabled; adapter uses `send_draft` |
