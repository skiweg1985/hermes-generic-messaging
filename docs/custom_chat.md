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
| `ws_host` | no | `0.0.0.0` | Bind address |
| `ws_port` | no | `8765` | Bind port |
| `bearer_token` | no* | — | Bearer token for WebSocket upgrade (*or set env, see below) |
| `rate_limit_per_minute` | no | `60` | Per-user rate limit |
| `dedupe_ttl_seconds` | no | `60` | Duplicate `event_id` window |
| `media_public_base_url` | no | — | Web BFF base URL for outbound local file uploads (fallback when no `client.register` from BFF) |
| `tts_response_format` | no | — | Optional override for Hermes TTS `response_format` when `audio_response` is requested (`pcm`, `mp3`, `opus`, `wav`, `flac`) |
| `max_upload_bytes` | no | `20971520` | Maximum inbound attachment size |
| `allowed_upload_mime_types` | no | schema default list | MIME allowlist for inbound attachments |

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
| `CUSTOM_CHAT_HOME_CHANNEL` | Default `chat_id` for cron-delivered messages (`deliver=custom_chat`) |
| `CUSTOM_CHAT_HOME_CHANNEL_NAME` | Human-readable name for the home channel |
| `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` | Web BFF base URL for publishing outbound attachments (optional when the web BFF sends `client.register` on connect) |
| `CUSTOM_CHAT_MAX_UPLOAD_BYTES` | Maximum inbound attachment size; replaces legacy `CUSTOM_CHAT_MAX_AUDIO_BYTES` |
| `CUSTOM_CHAT_ALLOWED_UPLOAD_MIME_TYPES` | Comma-separated MIME allowlist for inbound attachments |
| `CUSTOM_CHAT_TTS_RESPONSE_FORMAT` | Optional override for Hermes TTS `response_format` used by `audio_response`; set `pcm` to force PCM synthesis and automatic OGG/Opus conversion for Telegram-style voice delivery |
| `CUSTOM_CHAT_TTS_TIMEOUT_SECONDS` | Maximum seconds to wait for Hermes TTS during `audio_response` before failing the reply path cleanly (default `120`) |

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

Send JSON events per [interface_contract.md](interface_contract.md). The older [plans/universal-platform-adapter-v1.md](plans/universal-platform-adapter-v1.md) is retained as a compact Event Schema summary.

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

Messages starting with `/` are forwarded verbatim as text to Hermes (same pass-through behavior as the Telegram adapter). The gateway runner detects the leading `/` and routes commands like `/model`, `/reset`, `/reload-mcp`.

The `command.create` inbound event type is still accepted by the schema as an explicit form, but the resulting `MessageEvent` is plain text — no `metadata.is_command` flag.

## Interactive button confirmations

For commands that need user approval (e.g. `/reload-mcp`), Hermes calls `adapter.send_slash_confirm(...)`. The adapter emits an `assistant_buttons` event with three buttons:

```json
{
  "type": "assistant_buttons",
  "payload": {
    "message_id": "<confirm_id>",
    "confirm_id": "<confirm_id>",
    "title": "Reload MCP",
    "body": "...",
    "kind": "slash_confirm",
    "buttons": [
      {"id": "once",   "label": "Approve Once",   "style": "primary"},
      {"id": "always", "label": "Always Approve", "style": "primary"},
      {"id": "cancel", "label": "Cancel",         "style": "danger"}
    ]
  }
}
```

The client sends the user's choice back as a `button.click` inbound event:

```json
{
  "type": "button.click",
  "payload": {
    "message_id": "<confirm_id>",
    "confirm_id": "<confirm_id>",
    "button_id": "once",
    "choice": "once"
  }
}
```

The adapter then calls `GatewayRunner._resolve_slash_confirm(confirm_id, choice)`, which unblocks the agent.

Tool/skill approvals that must call `resolve_gateway_approval` instead use the same
`send_slash_confirm` helper with `metadata={"gateway_approval": true}` (or
`metadata={"approval": true}`). The adapter stores those prompts in `_approval_state`
rather than `_slash_confirm_state`.

## Stream cancellation

Send `message.cancel` with `target_message_id` set to the **turn** id
(`turn_message_id` from `assistant_start`, or the stream reply id). After tool
segments, the web UI sends the turn id, not the segment line id. The plugin resolves
line and segment ids to the active stream and emits `assistant_done` with
`interrupted: true`.

## Slash-command option menus

For commands that accept an argument chosen from a list (e.g. `/model` without a model name), Hermes calls `adapter.send_slash_options(...)`. The adapter emits an `assistant_buttons` event with `kind: "slash_pick"`:

```json
{
  "type": "assistant_buttons",
  "payload": {
    "message_id": "<pick_id>",
    "pick_id": "<pick_id>",
    "command": "/model",
    "title": "Select model",
    "body": "Choose a model for this session.",
    "kind": "slash_pick",
    "buttons": [
      {"id": "gpt-4", "label": "GPT-4", "style": "primary"},
      {"id": "claude-3", "label": "Claude 3", "style": "secondary"}
    ]
  }
}
```

The web client renders the buttons in a grid. When the user clicks one, the client **immediately** sends a `command.create` event with the full command (e.g. `/model gpt-4`). No `button.click` is required for `slash_pick` prompts.

### Gateway integration

When the gateway runner receives a slash command without required arguments (e.g. bare `/model`), it calls `send_model_picker` on adapters that implement it (Telegram, Discord, custom_chat). The picker is a two-step provider -> model flow with in-place card updates. No separate gateway patch is required when the installed Hermes gateway already supports that adapter hook.

The older `send_slash_options` helper remains available for simple flat option lists, but `/model` uses `send_model_picker` for Telegram parity.

Example (pseudo-code inside the gateway runner):

```python
await adapter.send_model_picker(
    chat_id=chat_id,
    providers=list_picker_providers(...),
    current_model=current_model,
    current_provider=current_provider,
    session_key=session_key,
    on_model_selected=callback,
)
```

## Additional outbound events

| Type | Purpose |
|------|---------|
| `assistant_buttons` | Interactive button prompt (slash confirm, slash pick, approvals) |
| `assistant_segment` | Segment boundary within one turn (after tool calls) |
| `assistant_notice` | System/info/tool/reasoning bubble outside the streaming reply flow |
| `assistant_image` | Image attachment with optional caption |
| `assistant_file` | Generic file attachment with filename, MIME type, optional size, and HTTP URL |
| `assistant_audio` | TTS/audio response with MIME type and HTTP URL |
| `session_meta` | Hermes session metadata (e.g. session title) bound to `session_id`/`thread_id` |
| `typing` | Typing indicator (`state: "start"` / `"stop"`) |

### `session_meta`

Emitted by the plugin when Hermes assigns or updates the session title (manual `/title <name>` or auto-title). The envelope carries `chat_id`, `session_id` and `thread_id` so the client can route the update.

```json
{
  "type": "session_meta",
  "chat_id": "workspace:abc",
  "session_id": "sess-7",
  "thread_id": "thread-3",
  "payload": { "title": "Refactor billing service" }
}
```

The web client stores the title on the session and renders it in the chat header instead of the generic local label.

On the Hermes host, deploy the plugin/schema and patch the gateway so auto-title callbacks reach the web UI:

```bash
rsync -av packages/custom_chat_schema/ HOST:~/packages/custom_chat_schema/
rsync -av plugins/platforms/custom_chat/ HOST:~/.hermes/plugins/custom_chat/
bash scripts/apply-hermes-session-meta-patch.sh   # idempotent v1 + v2
systemctl --user restart hermes-gateway.service
```

The plugin broadcasts `session_meta` to all connected WebSocket clients (the web BFF multiplexes every chat over one upstream socket); the frontend routes by `chat_id`.

## Agent inner steps (tool / reasoning)

Tool output and model reasoning appear as **plain text** in the transcript — the same approach as Telegram and Discord.

Enable reasoning display in Hermes:

```yaml
display:
  show_reasoning: true
  tool_progress: all
  tool_progress_command: true
gateway:
  streaming: true
```

`tool_progress_command: true` enables `/verbose` in messaging chats. `tool_progress: all` shows each tool call (default on most platforms; required for custom_chat because the adapter implements `edit_message` for in-place progress updates).

Behavior:

- Hermes skips tool progress entirely unless the adapter implements `edit_message` (custom_chat does).
- Streaming text (`send_draft`) emits incremental `assistant_delta` chunks.
- An empty draft after a tool call emits `assistant_segment` and continues in a new assistant line.
- When Hermes passes `metadata.reasoning`, `assistant_done` includes `reasoning_text` (full thinking for the web UI) and `final_text` (user-facing answer only). If the gateway already embedded `💭 Reasoning:` in the response text, it remains in `final_text` for Telegram/Discord-style clients.
- Interim tool status messages routed through `send()` with `metadata.kind: tool` appear as `assistant_notice` bubbles.

## Audio

Inbound `audio.uploaded` events require allowed MIME types and size under the configured maximum. Responses may include `assistant_audio` when TTS is requested.

## Outbound attachments

When Hermes calls `send_file`, `send_image`, or `send` with a local path, the adapter uploads the bytes to `{media_public_base_url}/api/v1/media/upload` and emits an `assistant_file` / `assistant_image` event with the returned HTTP URL.

`audio_response` now uses the same path: the plugin synthesizes a real local audio file via Hermes TTS, publishes it through the media API, then emits `assistant_audio` with the resulting URL. If `tts_response_format: pcm` (or `CUSTOM_CHAT_TTS_RESPONSE_FORMAT=pcm`) is configured, the plugin asks Hermes for PCM-compatible synthesis and delivers the final file as `audio/ogg` so Telegram-style voice-note clients can play it directly. `CUSTOM_CHAT_TTS_TIMEOUT_SECONDS` caps the synthesis wait time so failed or hanging TTS providers do not block the gateway event loop indefinitely.

The web BFF announces its public media base URL via inbound `client.register` on WebSocket connect. That URL takes precedence over `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` / `extra.media_public_base_url`. Without either, local paths appear in the chat as plain filesystem links the browser cannot open.

For setups without the web BFF (or before the BFF connects), set a reachable base URL on the Hermes host:

```bash
CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL=http://192.0.2.10:8000
```

The BFF must listen on `0.0.0.0` (or the LAN interface) so the Hermes host can POST uploads when using LAN split deployments.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Port 8765 not listening | `plugins.enabled` contains `custom_chat-platform`; `extra.enabled: true`; gateway restarted |
| Config ignored | Settings under top-level `platforms.custom_chat`, not `gateway.platforms` |
| `ws_host` / `ws_port` stay at defaults | Keys must be under `extra`, not directly under `custom_chat` |
| Log: `Skipping 'custom_chat-platform' (not in plugins.enabled)` | Add plugin to `plugins.enabled` or run `hermes plugins enable custom_chat-platform` |
| Log: `has no register() function` | Update plugin: `__init__.py` must export `register` (current repo version) |
| Log: `'dict' object has no attribute 'platform'` on inbound | Update plugin (`adapter.py`, `events/mapping.py`); restart gateway |
| Connection closed immediately | Bearer token mismatch |
| `assistant_error` after connect | User allowlist (`CUSTOM_CHAT_ALLOWED_USERS`) or Hermes authorization for `user_id` |
| `RATE_LIMITED` errors | Reduce message frequency or raise `rate_limit_per_minute` in config extra |
| Duplicate messages ignored | Reused `event_id` within dedupe TTL |
| No streaming deltas | Gateway streaming enabled; adapter uses `send_draft` |
