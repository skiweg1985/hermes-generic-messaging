# Changelog

## [Unreleased]

### Added

- Config simplification: BFF accepts `CUSTOM_CHAT_TARGET` (host, `host:port`, or `ws://` URL) instead of coordinating multiple IP/URL env vars
- Inbound `client.register` event: web BFF announces `public_media_base_url` on upstream connect; plugin uses it for outbound media uploads (overrides `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL`)
- BFF auto-detects public media base URL from bind host (`BFF_HOST=0.0.0.0` → LAN IP); overrides via `WEB_PUBLIC_MEDIA_BASE_URL`, `WEB_PUBLIC_HOST`, `WEB_PUBLIC_PORT`
- Dev: `WEB_CORS_REFLECT_ORIGIN=true` allows any HTTP(S) Origin; Vite reads `VITE_API_PROXY` for `/api` and `/ws` proxy targets

### Fixed

- Web UI: User-Uploads (Bilder, Audio, Dateien) erscheinen rechts wie Text-Nachrichten statt links im Assistant-Bereich
- Plugin: `interrupt_session_activity(session_key, chat_id)` matches current Hermes gateway API (was single-arg; broke `/new` and session reset with `TypeError`)
- Web UI: Unbalancierte Code-Fences (`\`\`\``) im Assistant-Stream werden vor dem Rendern entfernt, damit nachfolgender Markdown (Bold, Listen, Links) nicht mehr in einem `<pre><code>`-Block verschwindet
- Web UI: Auto-Titel (`session_meta`) erreicht den Client auch bei Hintergrund-Generierung — der BFF nutzt eine gemeinsame Upstream-WebSocket-Verbindung; `session_meta` wird deshalb an alle Clients gebroadcastet (Routing im Frontend per `chat_id`), und Chat-Sockets werden bei Single-Client-Betrieb auf die aktive Verbindung umgebunden
- Hermes Gateway (Homer): Auto-Title-Callback löst Session-Titel über `session_id` → `session_store.origin` auf statt nur über das zur Laufzeit erfasste `source`-Objekt
- Reasoning-Panel: `assistant_done.reasoning_text` trennt strukturiert Gedankengang und Antwort; gestreamter Thinking-Text landet nicht mehr in der Antwort-Bubble, wenn Hermes nur Abschnitts-Header in `metadata.reasoning` liefert
- Web UI: Reasoning-Split im Fallback nutzt die letzte Leerzeile statt der ersten, damit mehrzeiliger Reasoning-Text nicht abgeschnitten wird

### Added

- Outbound event `session_meta` (Schema v1) für Hermes-Session-Metadaten (Titel via `/title` / Auto-Title); Plugin-Helper `adapter.send_session_meta(chat_id, title=, session_id=, thread_id=, extra=)`
- Web UI: TopBar und Rail zeigen den von Hermes gelieferten `session_meta.title` als Chat-Titel an (auf 40 Zeichen gekürzt), Fallback bleibt das lokale Label bzw. die `chat_id`
- Web UI: Mobile-/Tablet-Drawer für Workspace-Navigation (Hamburger im TopBar bei ≤1080 px Viewport-Breite öffnet die Rail als Overlay; Auswahl eines Chats oder Backdrop-/Esc-Klick schließt automatisch)

### Added

- Tool/reasoning text parity (Telegram/Discord style): incremental `assistant_delta`, `assistant_segment` for post-tool boundaries, reasoning prepend on `assistant_done`, tool status via `assistant_notice` (`kind: tool`)
- Schema types `AssistantSegmentPayload`, `AssistantNoticePayload`; notice kinds `tool` / `reasoning`
- Web chat composer: Telegram-style slash-command autocomplete (popup on `/`, filter while typing, arrow keys / Tab / Enter to pick)
- Slash-command option menus (`slash_pick`): Hermes emits `assistant_buttons` via `send_slash_options`; web UI renders a button grid and auto-sends the full command on click (e.g. `/model gpt-4`)
- Interactive `/model` picker (`model_picker`): `send_model_picker` on custom_chat (Telegram/Discord parity); provider → model drill-down with in-place card updates
- Schema types `SlashPickPayload` and `SlashConfirmPayload` in `custom_chat_schema`

### Fixed

- Mikrofon-Aufnahme im Web-Composer: Browser-MIME mit Codec-Parametern (z. B. `audio/webm;codecs=opus`) wird vor Upload-Validierung auf den Basis-Typ normalisiert
- Voice messages: `transcribe_audio` lädt Audio vom BFF und nutzt Hermes-STT (Whisper); Mikrofon sendet `audio.uploaded` statt `file.uploaded`
- BFF lädt `web/.env` beim Start (u. a. `WEB_PUBLIC_MEDIA_BASE_URL`)
- Tool progress invisible in web chat: Hermes drops tool-progress events when `edit_message` is missing; custom_chat now implements `edit_message` and routes progress `send()` calls (no `reply_id`) to updatable `assistant_notice` bubbles
- Final assistant answers no longer misclassified as tool progress when `send()` lacks `reply_id` local filesystem paths in `send` / `send_file` / `send_image` are uploaded to the web BFF and emitted as HTTP URLs (`CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL`) instead of unusable `file://` or absolute-path links in the chat UI
- Outbound `send()` text that embeds a local path (e.g. `🖼️ Image: /home/.../shot.png`) is parsed, the file is published, and an `assistant_image` / `assistant_file` event is emitted before `assistant_done`
- Frontend surfaces a chat error line when `file.uploaded` cannot be sent because the WebSocket is not open (previously the upload appeared successful in the UI while the agent never learned about the attachment)
- Inbound `file.uploaded` / `audio.uploaded` events now include the filename and media URL in `MessageEvent.text`, so the agent can recognise the attachment even when it does not fetch `media_urls` itself
- BFF dev script accepts `BFF_HOST=0.0.0.0` so the BFF can be reached from a Hermes instance running on another host on the LAN

### Fixed

- Plugin aligned with real Hermes `MessageEvent` / `SendResult` signatures: dropped unsupported `metadata=` kwarg on `MessageEvent`, dropped `already_sent=` on `SendResult` (fixes `TypeError` crash on inbound messages and outbound `send()` on the Homer VM)
- `register()` now drops kwargs the installed Hermes version doesn't accept (warning logged) instead of failing plugin load (fixes "Failed to load plugin … unexpected keyword argument 'apply_yaml_config_fn'" on older Hermes versions)
- Inbound `MessageEvent.source` built via `build_source()` as Hermes `SessionSource` (fixes `AttributeError: 'dict' object has no attribute 'platform'` in gateway session routing)
- Plugin loaded by Hermes `discover_plugins`: `__init__.py` now exports `register` and bootstraps `packages/` onto `sys.path`
- Plugin-internal imports use relative paths so the adapter works when Hermes loads it via `spec_from_file_location` (no global `plugins.platforms.custom_chat` package required)
- `_env_enablement` no longer overwrites YAML `extra.ws_host` / `ws_port` with hard-coded defaults when the env vars are unset

### Changed

- Slash commands pass through verbatim as `TEXT` `MessageEvent` (Telegram parity); the `command.create` inbound event is still accepted by the schema but no longer carries an `is_command` metadata flag
- Audio inbound events map URL / MIME type into `MessageEvent.media_urls` / `media_types` (was previously stuffed into the removed `metadata` field)
- `register()` now publishes `cron_deliver_env_var="CUSTOM_CHAT_HOME_CHANNEL"`, `apply_yaml_config_fn`, full env-driven config bridge, and a `platform_hint` describing streaming + button capabilities
- Operator docs: Hermes config uses top-level `platforms:` and `plugins.enabled: [custom_chat-platform]` (not `gateway.platforms`)
- Install: use `scripts/bootstrap-venv.sh` on hosts without writable system/user site-packages; removed `setup.py` legacy develop shim
- `requires-python` set to `>=3.10`

### Added

- Telegram-parity adapter hooks: `send_slash_confirm`, `send_typing` / `stop_typing`, `send_image`, `send_private_notice`, `interrupt_session_activity`
- Event Schema v1.1 outbound events: `assistant_buttons` (interactive prompts), `assistant_notice` (system/info bubble), `assistant_image`, `typing`
- Event Schema v1.1 inbound event: `button.click` (routed to `GatewayRunner._resolve_slash_confirm` via `_message_handler.__self__`)
- `ButtonClickPayload` and `ButtonSpec` Pydantic models in `custom_chat_schema`
- Optional env vars: `CUSTOM_CHAT_HOME_CHANNEL`, `CUSTOM_CHAT_HOME_CHANNEL_NAME`, `CUSTOM_CHAT_ALLOW_ALL_USERS`
- Tests: `test_slash_confirm.py`, `test_interrupt.py`, `test_notice_image_typing.py`
- `scripts/bootstrap-venv.sh` for venv-based editable install

### Added

- Plan: multi-chat sessions in web UI (`docs/plans/multi-chat-sessions-web-ui.md`)
- Web app: FastAPI BFF (`web/backend`) with WebSocket proxy and audio media upload API
- Terminal-style React UI (`web/frontend`) with full Event Schema v1 client support
- Shared package `packages/custom_chat_schema` for plugin and BFF models
- `docs/web-app.md`, `tests/web/`, `scripts/dev.sh`, optional `web/docker-compose.yml`
- `custom_chat` Hermes platform plugin with Event Schema v1 over WebSocket
- Contract documentation (`docs/plans/universal-platform-adapter-v1.md`)
- Config validation, streaming, slash commands, audio hooks, dedupe/auth/rate limiting
- Operator docs and example event payloads
- Test suite under `tests/plugins/custom_chat/`
