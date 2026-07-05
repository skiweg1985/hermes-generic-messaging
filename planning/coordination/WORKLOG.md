# 🗂️ Worklog

> **Status:** Historisches Arbeitsprotokoll. Dieses Dokument ist hilfreich, um
> Entscheidungen und Deployments nachzuvollziehen. Für aktuelle Betriebs- und
> Entwicklerdokumentation nutze `README.md` und `docs/README.md`.

## 2026-05-24 – cursor – Config-Vereinfachung BFF/Plugin

- Done:
  - Schema v1: inbound `client.register` + `ClientRegisterPayload`
  - Plugin: empfängt `client.register`, nutzt registrierte Media-URL vor Env/YAML
  - BFF: `CUSTOM_CHAT_TARGET`, Auto-Detect `WEB_PUBLIC_MEDIA_BASE_URL`, sendet `client.register` nach Upstream-Connect
  - Dev: `WEB_CORS_REFLECT_ORIGIN`, Vite `VITE_API_PROXY`, Docker Compose `CUSTOM_CHAT_TARGET`
  - Tests: `test_client_register.py`, `test_network.py`, `test_client_register` (web)
  - Docs: `web-app.md`, `custom_chat.md`, `.env.example`, CHANGELOG
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: (local)
  - PR: none
- Files touched:
  - packages/custom_chat_schema/
  - plugins/platforms/custom_chat/
  - web/backend/
  - web/frontend/vite.config.ts
  - web/.env.example
  - web/docker-compose.yml
  - scripts/dev.sh
  - docs/
  - tests/
- Test notes:
  - `python -m pytest tests/web tests/plugins/custom_chat/test_client_register.py -q`
- Changelog updated:
  - yes (Added)
- Follow-ups:
  - Deploy updated plugin + BFF to Homer VM; remove redundant `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` if BFF registers

## 2026-05-24 21:47 – cursor – Homer Plugin deploy (client.register)

- Done:
  - rsync `packages/custom_chat_schema/` → `homer@192.168.177.149:~/packages/custom_chat_schema/`
  - rsync `adapter.py`, `media.py` → `homer@192.168.177.149:~/.hermes/plugins/custom_chat/`
  - `systemctl --user restart hermes-gateway.service` → active; WS `:8765` on `192.168.177.149`
  - Remote verify: `_handle_client_register` in adapter, `client.register` in schema
- Next:
  - BFF neu verbinden (Browser/WS öffnen), dann optional `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` aus `~/.hermes/.env` entfernen
- Blockers:
  - none
- Branch/PR:
  - branch: (local)
  - PR: none
- Files touched:
  - (remote) ~/.hermes/plugins/custom_chat/adapter.py, media.py
  - (remote) ~/packages/custom_chat_schema/
- Test notes:
  - `ss -tlnp | grep 8765` → listening
  - `systemctl --user is-active hermes-gateway.service` → active
- Changelog updated:
  - no
- Follow-ups:
  - Smoke: BFF connect → Log auf Homer sollte `client.register: media base ...` zeigen

## 2026-05-23 14:25 – cursor – Web dev stack on Homer VM

- Done:
  - Rsynced `web/` + `packages/` to `homer@192.168.177.149:~/hermes-generic-messaging`
  - Created `web/.env` (BFF → `ws://127.0.0.1:8765`, CORS for LAN `:5173`)
  - `npm install` in `web/frontend`; started BFF `:8000` and Vite `:5173` (`--host 0.0.0.0`, nohup)
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - (remote) ~/hermes-generic-messaging/web/.env, processes in /tmp/*.log
- Test notes:
  - UI: http://192.168.177.149:5173/
  - BFF health: http://192.168.177.149:8000/api/v1/health
  - logs: `/tmp/custom-chat-vite.log`, `/tmp/custom-chat-bff.log`
- Changelog updated:
  - no
- Follow-ups:
  - Stop: `pkill -f "uvicorn app.main:app.*8000"; pkill -f "vite.*5173"`

## 2026-05-23 14:15 – cursor – SessionSource inbound mapping fix

- Done:
  - `inbound_to_message_event` takes Hermes `SessionSource` from `adapter.build_source()` instead of a dict
  - Test stubs: `SessionSource`, `build_source()` on base adapter; assertion on `source.platform.value`
  - Deployed `adapter.py` + `events/mapping.py` to homer VM; `systemctl --user restart hermes-gateway.service`
  - WS smoke: `assistant_start` received; no `custom_chat inbound failed` / AttributeError in gateway log
  - Docs: CHANGELOG Fixed, troubleshooting row in `custom_chat.md`
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - plugins/platforms/custom_chat/events/mapping.py
  - tests/conftest.py
  - tests/plugins/custom_chat/test_adapter.py
  - docs/CHANGELOG.md
  - docs/custom_chat.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `python -m pytest tests/plugins/custom_chat -q` → 30 passed
  - VM: WS `message.create` → `assistant_start`
- Changelog updated:
  - yes (Fixed under Unreleased)
- Follow-ups:
  - none

## 2026-05-23 14:05 – cursor – Operator docs (Hermes config path)

- Done:
  - `docs/custom_chat.md`: correct `plugins.enabled` + top-level `platforms.custom_chat.extra`, env/LAN notes, troubleshooting table
  - `README.md`: same config snippet; link to operator doc
  - `docs/web-app.md`: pointer to `custom_chat.md` for Hermes setup
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - docs/custom_chat.md
  - README.md
  - docs/web-app.md
  - docs/CHANGELOG.md
- Test notes:
  - none (docs only)
- Changelog updated:
  - yes (Changed under Unreleased)
- Follow-ups:
  - none

## 2026-05-23 13:55 – cursor – Plugin load fix on Hermes host

- Done:
  - Verified live Hermes setup on `homer@192.168.177.149`: plugin symlink present but `Skipping 'custom_chat-platform' (not in plugins.enabled)` and later `no register() function`
  - `~/.hermes/config.yaml` moved `custom_chat` from `gateway.platforms.*` (ignored by loader) to top-level `platforms.*` and added `plugins.enabled: [custom_chat-platform]`; backup at `config.yaml.bak.20260523-134559`
  - Plugin code refactored to relative imports (`__init__.py`, `adapter.py`, `events/*`, `media.py`); `__init__.py` adds `<repo>/packages/` to `sys.path` so `custom_chat_schema` resolves
  - `_env_enablement` only seeds env-derived keys; YAML `extra` for `ws_host` / `ws_port` is preserved
  - Files synced to VM via scp, gateway restarted
- Next:
  - Decide if `~/.hermes/.env` should pin `CUSTOM_CHAT_WS_HOST=192.168.177.149` (currently driven by YAML extra)
  - Confirm user-allowlist for non-test `user_id`s (smoke send returned `assistant_error` from Hermes authorization layer)
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/__init__.py
  - plugins/platforms/custom_chat/adapter.py
  - plugins/platforms/custom_chat/events/__init__.py
  - plugins/platforms/custom_chat/events/mapping.py
  - plugins/platforms/custom_chat/events/schema.py
  - plugins/platforms/custom_chat/media.py
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
  - (remote only) /home/homer/.hermes/config.yaml
- Test notes:
  - `python -m pytest tests/plugins/custom_chat -q` → 30 passed
  - VM: `ss -tlnp | grep 8765` → `LISTEN 192.168.177.149:8765`
  - VM gateway.log: `Connecting to custom_chat... ✓ custom_chat connected`, `Gateway running with 6 platform(s)`
  - WS smoke (`ws://192.168.177.149:8765`, bearer): connected, sent `message.create`, received `assistant_error` envelope
- Changelog updated:
  - yes (Fixed under Unreleased)
- Follow-ups:
  - Consider vendoring `custom_chat_schema` into the plugin to drop the `sys.path` shim

## 2026-05-23 – composer – Web app (custom_chat BFF + terminal UI)

- Done:
  - Monorepo layout: `packages/custom_chat_schema`, `web/backend`, `web/frontend`
  - Plugin `config.py` re-exports shared schema package
  - FastAPI: health, WS proxy, media upload/download
  - React terminal UI: text, commands, streaming, cancel, audio in/out
  - Tests: `tests/web/`, frontend Vitest reducer tests
  - Docs: `docs/web-app.md`, README, path-discovery, CHANGELOG
- Next:
  - Auth (fastapi-auth) when required
  - E2E Playwright against live Hermes stack
- Blockers:
  - none
- Branch/PR:
  - branch: (current)
  - PR: none
- Files touched:
  - packages/custom_chat_schema/
  - plugins/platforms/custom_chat/config.py
  - web/
  - tests/web/
  - docs/web-app.md, docs/CHANGELOG.md, docs/plans/path-discovery.md
  - README.md, pyproject.toml, scripts/dev.sh
- Test notes:
  - `pip install -e ".[dev,web]" && python -m pytest tests/plugins/custom_chat tests/web -q`
  - `cd web/frontend && npm test`
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - Set `WEB_PUBLIC_MEDIA_BASE_URL` for Docker/Hermes media fetch

## 2026-05-23 – composer – Universal Hermes Platform Adapter (full plan)

- Done:
  - Repo skeleton, path discovery, contract doc, config module
  - custom_chat plugin: WebSocket transport, adapter, streaming, commands, audio, hardening
  - Full test suite and operator documentation
- Next:
  - Wire real STT/TTS providers when chosen
  - Optional Redis backend for dedupe state
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/
  - tests/plugins/custom_chat/
  - docs/
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `pip install -e ".[dev]" && python -m pytest tests/plugins/custom_chat -q`
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - Publish initial commit and open PR1–PR7 split if review prefers smaller PRs

## 2026-05-23 – composer – Multi-chat sessions plan

- Done:
  - Plan document `docs/plans/multi-chat-sessions-web-ui.md` (4 PRs: state/persistenz, inbound routing, tab UI, docs)
  - Verweis in `docs/plans/path-discovery.md`
- Next:
  - Hermes-Verifikation: Kontexttrennung pro `chat_id`
  - Implementierung PR1 (Session-Modell) nach Freigabe
- Blockers:
  - none
- Branch/PR:
  - branch: (current)
  - PR: none
- Files touched:
  - docs/plans/multi-chat-sessions-web-ui.md
  - docs/plans/path-discovery.md
  - docs/CHANGELOG.md
- Test notes:
  - none (plan only)
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - Tab vs. Session-Menü vor PR3 festlegen

## 2026-05-23 14:50 – cursor – Custom-Chat Hermes alignment + Telegram parity

- Done:
  - API alignment to real Hermes `MessageEvent` (`raw_message` / `media_urls` / `media_types`) and `SendResult` (no `already_sent`); fixes the two `TypeError` crashes observed live on Homer
  - Slash command pass-through (Telegram parity): `text_to_command_event` no longer wraps inbound text; `command.create` is still accepted but the resulting event is plain `TEXT`
  - Event Schema v1.1 added: `assistant_buttons`, `assistant_notice`, `assistant_image`, `typing` outbound; `button.click` inbound; new Pydantic models `ButtonClickPayload`, `ButtonSpec`
  - Adapter hooks: `send_slash_confirm` (3-button confirm), `send_typing` / `stop_typing`, `send_image`, `send_private_notice`, `interrupt_session_activity`
  - `button.click` inbound routed to `GatewayRunner._resolve_slash_confirm` via `_message_handler.__self__` (same pattern as Telegram); fallback for approvals
  - `register()` extended (`cron_deliver_env_var`, `apply_yaml_config_fn`, `platform_hint`, `emoji`) with defensive kwarg drop for older Hermes versions
  - `plugin.yaml` `optional_env` extended with `CUSTOM_CHAT_HOME_CHANNEL`, `CUSTOM_CHAT_HOME_CHANNEL_NAME`, `CUSTOM_CHAT_ALLOW_ALL_USERS`
  - Test stubs in `tests/conftest.py` re-aligned to the real Hermes signatures; existing `test_commands.py::test_model_command_routed` updated for pass-through; new tests `test_slash_confirm.py`, `test_interrupt.py`, `test_notice_image_typing.py`
  - Deployed to Homer (`rsync` of plugin + schema), gateway restarted, plugin loaded (kwarg `apply_yaml_config_fn` dropped with warning), 6 platforms connected; WS smoke `say hello in 4 words` → `assistant_start` + `assistant_done`, no Tracebacks
- Next:
  - Frontend: render `assistant_buttons` in the React UI and send `button.click` back when the user clicks one of the buttons
  - Tool/skill approval pattern (`extra_approval` / `ea:once|session|always|deny`) on top of the same button mechanism
  - Once Homer's Hermes catches up to a build that knows `apply_yaml_config_fn`, the defensive kwarg-drop warning will go away on its own
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - plugins/platforms/custom_chat/events/mapping.py
  - plugins/platforms/custom_chat/events/schema.py
  - plugins/platforms/custom_chat/config.py
  - plugins/platforms/custom_chat/plugin.yaml
  - packages/custom_chat_schema/schema.py
  - packages/custom_chat_schema/__init__.py
  - tests/conftest.py
  - tests/plugins/custom_chat/test_commands.py
  - tests/plugins/custom_chat/test_slash_confirm.py (new)
  - tests/plugins/custom_chat/test_interrupt.py (new)
  - tests/plugins/custom_chat/test_notice_image_typing.py (new)
  - docs/custom_chat.md
  - docs/examples/custom-chat-events-v1.json
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - `python -m pytest tests/plugins/custom_chat -q` → 39 passed
  - `python -m pytest -q` (full) → 45 passed
  - Homer: `systemctl --user is-active hermes-gateway.service` → `active`, gateway log: `Gateway running with 6 platform(s)`, `✓ custom_chat connected`
  - WS smoke (`ws://192.168.177.149:8765`, bearer): `message.create` "say hello in 4 words" → received `assistant_start` + `assistant_done`, no TypeError in `errors.log`
- Changelog updated:
  - yes (Fixed / Changed / Added under Unreleased)
- Follow-ups:
  - Frontend rendering for `assistant_buttons` + `button.click` outbound from web UI (out of scope for this work)

## 2026-05-23 18:03 – cursor – Anhang-Flow: agent sees uploaded files

- Done:
  - Diagnosed root cause: BFF bound only to loopback while Hermes runs on another LAN host (`192.168.177.149`), so `media_urls` pointed to a URL the agent cannot fetch
  - `web/.env`: `WEB_PUBLIC_MEDIA_BASE_URL` updated to the host's LAN IP (local-only, gitignored)
  - `scripts/dev.sh`: honour `BFF_HOST` so the BFF can bind beyond `127.0.0.1`
  - `docs/web-app.md`: documented the LAN/cross-host case alongside the existing Docker note
  - `WsClient.send` and `sendFileUploaded` / `sendAudioUploaded` now return a boolean; `ChatPage.handleFile` raises a `WS_NOT_CONNECTED` chat error when the upload-followup WS event was dropped because the socket was not open
  - `events/mapping.py`: `MessageEvent.text` for `file.uploaded` / `audio.uploaded` now includes the filename and media URL alongside the existing `[file:mime]` / `[audio:mime]` marker, so an agent that does not auto-fetch `media_urls` still has something to act on
- Next:
  - Wire real STT / file-content extraction in `plugins/platforms/custom_chat/media.py`, or have the Hermes runtime fetch `media_urls` itself
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - web/.env (local only, not tracked)
  - scripts/dev.sh
  - docs/web-app.md
  - docs/CHANGELOG.md
  - web/frontend/src/api/wsClient.ts
  - web/frontend/src/features/chat/ChatPage.tsx
  - plugins/platforms/custom_chat/events/mapping.py
- Test notes:
  - `python -m pytest tests/plugins/custom_chat tests/web -q` → 50 passed, 1 pre-existing failure in `test_streaming.py::test_stream_lifecycle_start_delta_done` (unrelated; order of `typing` vs `assistant_done` outbound)
  - `cd web/frontend && npm test` → 17 passed
  - manual: `lsof -nP -iTCP:8000 -sTCP:LISTEN`, `curl /api/v1/health` → 200
- Changelog updated:
  - yes (Fixed under Unreleased)
- Follow-ups:
  - Provide a real STT provider for `transcribe_audio`
  - Consider PDF/text extraction before `handle_message` for agents that do not load `media_urls`
  - Investigate the pre-existing streaming-order test failure separately

## 2026-05-24 09:16 – cursor-agent – slash-command-autocomplete

- Done:
  - Slash-command autocomplete in the web composer (popup above input on `/`, prefix filter, keyboard + click selection)
  - Shared `SLASH_COMMANDS` list for inspector panel and autocomplete
  - `/` toolbar button inserts `/` when the input is empty
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: (local)
  - PR: none
- Files touched:
  - web/frontend/src/features/chat/PromptLine.tsx
  - web/frontend/src/features/chat/AttachControls.tsx
  - web/frontend/src/features/chat/ChatPage.tsx
  - web/frontend/src/features/chat/slashCommands.ts
  - web/frontend/src/features/chat/slashCommandSuggest.ts
  - web/frontend/src/features/chat/slashCommandSuggest.test.ts
  - web/frontend/src/styles/terminal.css
  - docs/CHANGELOG.md
- Test notes:
  - `cd web/frontend && npm test -- --run` → 24 passed
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - Extend `SLASH_COMMANDS` when new gateway slash commands are documented

## 2026-05-24 – cursor – Outbound Hermes-Dateien in Chat

- Done:
  - Ursache: Hermes liefert lokale Pfade (`/path/...`, `file://...`); der Browser kann diese nicht als Anhang öffnen
  - Plugin lädt lokale Pfade bei `send` / `send_file` / `send_image` auf den Web-BFF hoch und emittiert HTTP-URLs (`assistant_file` / `assistant_image`)
  - Setting `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` / `extra.media_public_base_url` (gleicher Wert wie `WEB_PUBLIC_MEDIA_BASE_URL`)
  - Tests: `tests/plugins/custom_chat/test_publish_local_file.py`
- Next:
  - none (Homer deploy done 2026-05-24)
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - packages/custom_chat_schema/settings.py
  - plugins/platforms/custom_chat/media.py
  - plugins/platforms/custom_chat/adapter.py
  - docs/custom_chat.md
  - docs/CHANGELOG.md
  - tests/plugins/custom_chat/test_publish_local_file.py
- Test notes:
  - `python -m pytest tests/plugins/custom_chat/test_publish_local_file.py tests/plugins/custom_chat/test_notice_image_typing.py -q` → 8 passed
- Changelog updated:
  - yes (Fixed under Unreleased)
- Follow-ups:
  - none
- Homer deploy (2026-05-24):
  - rsync `adapter.py`, `media.py` → `~/.hermes/plugins/custom_chat/`
  - rsync `custom_chat_schema` → `~/packages/custom_chat_schema/` (takes precedence over venv)
  - `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL=http://192.168.177.217:8000` in `~/.hermes/.env`
  - `systemctl --user restart hermes-gateway.service` → active; WS :8765 listening; BFF health from Homer → 200

## 2026-05-24 09:43 – cursor-agent – slash-command-menus

- Done:
  - Adapter hook `send_slash_options` emits `assistant_buttons` with `kind: slash_pick` for dynamic option menus (e.g. `/model`)
  - Schema types `SlashPickPayload` and `SlashConfirmPayload` in `custom_chat_schema`
  - Web UI: `slash_pick` buttons render in a grid; click auto-sends full slash command via `command.create`
  - `slash_confirm` approvals: distinct card styling + inspector hint
  - Docs: `docs/custom_chat.md` gateway integration note, events example, CHANGELOG, web-app.md
- Next:
  - Hermes gateway: call `send_slash_options` when `/model` is sent without an argument
- Blockers:
  - Model menu requires Hermes gateway hook (outside this repo)
- Branch/PR:
  - branch: (local)
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - packages/custom_chat_schema/schema.py
  - packages/custom_chat_schema/__init__.py
  - tests/plugins/custom_chat/test_slash_options.py
  - web/frontend/src/features/chat/ChatPage.tsx
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/chatReducer.test.ts
  - web/frontend/src/features/chat/TranscriptLine.tsx
  - web/frontend/src/types/events.ts
  - web/frontend/src/styles/terminal.css
  - docs/custom_chat.md
  - docs/web-app.md
  - docs/examples/custom-chat-events-v1.json
  - docs/CHANGELOG.md
- Test notes:
  - `python -m pytest tests/plugins/custom_chat/test_slash_options.py -q` → 3 passed
  - `cd web/frontend && npm test -- --run` → 25 passed
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - Gateway runner integration for bare `/model` → `send_slash_options`

## 2026-05-24 – cursor-agent – homer deploy slash-command-menus

- Done:
  - rsync `adapter.py` → `homer@192.168.177.149:~/.hermes/plugins/custom_chat/`
  - rsync `packages/custom_chat_schema/` → `homer@192.168.177.149:~/packages/custom_chat_schema/`
  - `systemctl --user restart hermes-gateway.service` → active; WS listening on `192.168.177.149:8765`
  - Verified remote `send_slash_options` present in adapter.py
- Next:
  - Hermes gateway core: call `send_slash_options` on bare `/model`
- Blockers:
  - none (deploy)
- Branch/PR:
  - branch: (local)
  - PR: none
- Test notes:
  - remote grep + gateway restart + port check OK
- Changelog updated:
  - no (deploy only)

## 2026-05-24 10:13 – cursor-agent – send_model_picker parity

- Done:
  - `send_model_picker` on custom_chat adapter (provider → model drill-down, Telegram callback ids)
  - Web UI: `model_picker` cards upsert in-place; navigation via `button.click`
  - Tests: `test_model_picker.py`, chatReducer upsert test
  - Deployed `adapter.py` to homer; gateway restarted
- Next:
  - Manual smoke: `/model` in web chat should show provider buttons
- Blockers:
  - none
- Branch/PR:
  - branch: (local)
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/chatReducer.test.ts
  - web/frontend/src/features/chat/ChatPage.tsx
  - web/frontend/src/features/chat/TranscriptLine.tsx
  - tests/plugins/custom_chat/test_model_picker.py
  - docs/custom_chat.md
  - docs/CHANGELOG.md
- Test notes:
  - `pytest tests/plugins/custom_chat/test_model_picker.py -q` → 2 passed
  - `npm test -- --run` → 26 passed
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - none

## 2026-05-24 10:49 – cursor – Homer deploy tool/reasoning parity

- Done:
  - rsync `adapter.py`, `streaming.py` → `homer@192.168.177.149:~/.hermes/plugins/custom_chat/`
  - rsync `packages/custom_chat_schema/` → `~/packages/custom_chat_schema/`
  - rsync frontend (`chatReducer`, `TranscriptLine`, `events.ts`, `terminal.css`) → `~/hermes-generic-messaging/web/frontend/`
  - `systemctl --user restart hermes-gateway.service` → active; WS `:8765` listening; BFF `:8000`, Vite `:5173` running
- Next:
  - Manual smoke: tool-heavy prompt + `display.show_reasoning: true` in web UI
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Test notes:
  - remote grep: `assistant_segment`, `begin_segment` present; ports OK
- Changelog updated:
  - no (deploy only)
- Follow-ups:
  - none

## 2026-05-24 10:57 – cursor – Tool progress fix (edit_message + config)

- Done:
  - Root cause: Hermes `send_progress_messages` skips platforms without `edit_message`
  - Implemented `edit_message` + `_send_tool_progress`; progress `send()` → updatable `assistant_notice` (`kind: tool`)
  - Frontend upserts tool notices by `message_id`
  - Homer: `tool_progress_command: true`, adapter + chatReducer deployed, gateway restarted
- Next:
  - Retry `/verbose` or tool-heavy prompt in web UI
- Test notes:
  - `pytest test_streaming.py` → 9 passed; `npm test` → 30 passed
- Changelog updated:
  - yes (Fixed)

- Done:
  - Incremental `assistant_delta` in adapter `send_draft` (fixes cumulative delta bug)
  - `assistant_segment` outbound type + segment boundaries after tool calls
  - Reasoning prepend on `send()` via `metadata.reasoning`; tool status via `assistant_notice` (`kind: tool`)
  - Frontend: `assistant_segment` handler, notice/tool/reasoning styling, segment labels
  - Schema, docs, examples, tests
- Next:
  - Manual smoke with Hermes `display.show_reasoning: true` + tool-heavy prompt
- Blockers:
  - none
- Branch/PR:
  - branch: (local)
  - PR: none
- Files touched:
  - packages/custom_chat_schema/schema.py
  - plugins/platforms/custom_chat/adapter.py
  - plugins/platforms/custom_chat/streaming.py
  - web/frontend/src/types/events.ts
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/TranscriptLine.tsx
  - web/frontend/src/styles/terminal.css
  - tests/plugins/custom_chat/test_streaming.py
  - web/frontend/src/features/chat/chatReducer.test.ts
  - docs/custom_chat.md
  - docs/web-app.md
  - docs/CHANGELOG.md
  - docs/examples/custom-chat-events-v1.json
  - docs/plans/universal-platform-adapter-v1.md
- Test notes:
  - `pytest tests/plugins/custom_chat/test_streaming.py -q` → 7 passed
  - `npm test -- --run` → 29 passed
- Changelog updated:
  - yes (Added under Unreleased)
- Follow-ups:
  - none

## 2026-05-24 10:57 – cursor – Tool progress fix (edit_message + config)

- Done:
  - Root cause: Hermes `send_progress_messages` skips platforms without `edit_message`
  - Implemented `edit_message` + `_send_tool_progress`; `send()` without `reply_id` → updatable `assistant_notice` (`kind: tool`)
  - Frontend upserts tool notices by `message_id`
  - Homer: `tool_progress_command: true`, adapter deployed, gateway restarted
- Next:
  - Retry `/verbose` or tool-heavy prompt in web UI
- Blockers:
  - none
- Test notes:
  - `pytest test_streaming.py` → 9 passed; `npm test` → 30 passed
- Changelog updated:
  - yes (Fixed)

## 2026-05-24 12:58 – cursor – MIME-Normalisierung Mikrofon-Upload

- Done:
  - `normalize_mime_type` in `packages/custom_chat_schema/mime.py` (Basis-MIME ohne `;codecs=…`)
  - BFF `MediaStore` und Plugin `validate_file_payload` normalisieren vor Allowlist-Check
  - Frontend: `normalizeMimeType` + `useAudioRecorder` bereinigt Blob-Typ
  - Tests: `test_media_store`, `test_media` (plugin), Vitest für `normalizeMimeType`
- Next:
  - Manuell: Mikrofon im Composer testen (Chrome → `audio/webm;codecs=opus`)
- Blockers:
  - none
- Branch/PR:
  - branch: (current)
  - PR: none
- Files touched:
  - packages/custom_chat_schema/mime.py
  - packages/custom_chat_schema/__init__.py
  - web/backend/app/services/media_store.py
  - plugins/platforms/custom_chat/media.py
  - web/frontend/src/lib/normalizeMimeType.ts
  - web/frontend/src/lib/normalizeMimeType.test.ts
  - web/frontend/src/hooks/useAudioRecorder.ts
  - tests/web/test_media_store.py
  - tests/plugins/custom_chat/test_media.py
  - docs/CHANGELOG.md
- Test notes:
  - commands: `pytest tests/web/test_media_store.py tests/plugins/custom_chat/test_media.py -q` → 12 passed
  - `npm test -- --run src/lib/normalizeMimeType.test.ts` → 2 passed
- Changelog updated:
  - yes (Fixed under Unreleased)
- Follow-ups:
  - none

## 2026-05-24 12:58 – cursor – MIME-Normalisierung Mikrofon-Upload

- Done:
  - `normalize_mime_type` in `packages/custom_chat_schema/mime.py` (Basis-MIME ohne `;codecs=…`)
  - BFF `MediaStore` und Plugin `validate_file_payload` normalisieren vor Allowlist-Check
  - Frontend: `normalizeMimeType` + `useAudioRecorder` bereinigt Blob-Typ
  - Tests: `test_media_store`, `test_media` (plugin), Vitest für `normalizeMimeType`
- Next:
  - Manuell: Mikrofon im Composer testen (Chrome → `audio/webm;codecs=opus`)
- Blockers:
  - none
- Branch/PR:
  - branch: (current)
  - PR: none
- Files touched:
  - packages/custom_chat_schema/mime.py
  - packages/custom_chat_schema/__init__.py
  - web/backend/app/services/media_store.py
  - plugins/platforms/custom_chat/media.py
  - web/frontend/src/lib/normalizeMimeType.ts
  - web/frontend/src/lib/normalizeMimeType.test.ts
  - web/frontend/src/hooks/useAudioRecorder.ts
  - tests/web/test_media_store.py
  - tests/plugins/custom_chat/test_media.py
  - docs/CHANGELOG.md
- Test notes:
  - commands: `pytest tests/web/test_media_store.py tests/plugins/custom_chat/test_media.py -q` → 12 passed
  - `npm test -- --run src/lib/normalizeMimeType.test.ts` → 2 passed
- Changelog updated:
  - yes (Fixed under Unreleased)
- Follow-ups:
  - none

## 2026-05-24 13:15 – cursor – Voice STT + private URL fix

- Done:
  - Root cause: Hermes `allow_private_urls: false` blockiert Agent-Fetch von LAN-BFF-URLs; `transcribe_audio` war nur Platzhalter
  - `transcribe_audio` lädt Audio per HTTP und nutzt Hermes `tools.transcription_tools` (Whisper)
  - Mikrofon sendet `audio.uploaded`; BFF lädt `web/.env` automatisch
  - Homer: `allow_private_urls: true`, `media.py` + Frontend + `config.py` deployed, Gateway restarted
- Next:
  - Browser hard-refresh; neue Voice-Nachricht senden — Agent sollte Transkript als Text sehen
- Test notes:
  - `pytest tests/plugins/custom_chat/test_media.py tests/plugins/custom_chat/test_custom_chat_e2e.py` → 8 passed
- Changelog updated:
  - yes (Fixed)

## 2026-05-24 13:19 – cursor – Mobile Drawer für Rail

- Done:
  - Hamburger-Button im TopBar (sichtbar bei ≤1080 px) öffnet die Rail als Slide-in-Overlay
  - Rail im Drawer-Modus rendert volle Sektionen (Workspace, New chat, Search, Sessions mit Titeln, Footer) und einen Schließen-Button
  - Backdrop-Klick, Chat-Auswahl, "New chat" und Esc schließen den Drawer automatisch
  - ≤720 px: Rail standardmäßig versteckt, nur über Drawer erreichbar; 720–1080 px: kollabierte Icon-Rail bleibt + Drawer-Overlay verfügbar
  - prefers-reduced-motion respektiert (keine Slide-Animation)
- Next:
  - Manueller Test in Mobil-Viewport (Browser DevTools)
- Blockers:
  - none
- Branch/PR:
  - branch: (current)
  - PR: none
- Files touched:
  - web/frontend/src/features/chat/ChatPage.tsx
  - web/frontend/src/features/shell/Rail.tsx
  - web/frontend/src/features/shell/TopBar.tsx
  - web/frontend/src/features/shell/icons.tsx
  - web/frontend/src/features/shell/shell.css
  - docs/CHANGELOG.md
- Test notes:
  - UI path: Browser ≤1080 px → TopBar-Hamburger → Rail-Drawer öffnet, Auswahl schließt
  - keine neuen Unit-Tests (rein UI/CSS-Verhalten)
- Changelog updated:
  - yes (Added unter Unreleased)
- Follow-ups:
  - none

## 2026-05-24 13:23 – cursor – Chat-Titel aus erstem User-Text

- Done:
  - Neue Helper-Funktion `chatDisplayTitle(session)` leitet den Anzeigenamen eines Chats aus dem ersten User-Text/Command ab (auf 40 Zeichen gekürzt mit Ellipse), Fallback bleibt `session.label` bzw. die `chat_id`
  - TopBar zeigt diesen Titel statt generischem `chat N`
  - Rail (`SessionGroupList`) und Command-Palette nutzen denselben Helper, damit alle Anzeigen konsistent sind
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/ChatPage.tsx
  - web/frontend/src/features/shell/SessionGroupList.tsx
  - docs/CHANGELOG.md
- Test notes:
  - commands: `cd web/frontend && npx vitest run src/features/chat/chatReducer.test.ts` (19 passed)
  - UI path: neuer Chat anlegen → erste Nachricht senden → Titel in TopBar und Rail wechselt von `chat N` auf den Nachrichtentext
- Changelog updated:
  - yes (Changed unter Unreleased)
- Follow-ups:
  - none

## 2026-05-24 13:31 – cursor – session_meta Event für Hermes-Titel

- Done:
  - Schema v1: neuer Outbound-Event-Typ `session_meta` mit `SessionMetaPayload { title?, extra }`; export aus `custom_chat_schema`
  - Plugin-Adapter: `send_session_meta(chat_id, *, title, session_id, thread_id, extra, metadata)` emittiert das Event über `_emit_outbound` mit Routing über `_route_for_send`
  - Frontend (`events.ts`): `session_meta` in `OutboundType`; neue `SessionMetaPayload`; `ChatSession` erweitert um `title?`, `sessionId?`, `threadId?`
  - Reducer: behandelt `session_meta`, setzt Session-Title und Session-/Thread-IDs (leerer Title überschreibt bestehenden nicht)
  - `chatDisplayTitle` priorisiert ausschließlich `session.title` von Hermes, danach lokales Label, dann chat_id (kein Auto-Title aus erstem User-Text mehr, da Hermes den Titel liefert)
  - Tests: `tests/plugins/custom_chat/test_session_meta.py` (Plugin-Emission inkl. extra), `chatReducer.test.ts` (Frontend-Reducer-Routing)
  - Docs: `docs/custom_chat.md` Sektion `session_meta` mit Event-Beispiel
- Next:
  - Hermes-seitig: `/title`-Handler / Auto-Title-Hook ruft `adapter.send_session_meta(...)` auf (außerhalb dieses Repos)
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - packages/custom_chat_schema/schema.py
  - packages/custom_chat_schema/__init__.py
  - plugins/platforms/custom_chat/adapter.py
  - tests/plugins/custom_chat/test_session_meta.py
  - web/frontend/src/types/events.ts
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/chatReducer.test.ts
  - docs/custom_chat.md
  - docs/CHANGELOG.md
- Test notes:
  - commands: `python -m pytest tests/plugins/custom_chat -x -q` (62 passed → 64 mit den neuen Tests), `cd web/frontend && npx vitest run` (33 passed), `npx tsc -p . --noEmit` (clean)
  - endpoints: keine
  - UI path: Hermes sendet `session_meta` mit Titel → TopBar zeigt Titel statt `chat N`
- Changelog updated:
  - yes (Added unter Unreleased)
- Follow-ups:
  - Hermes-Side-Wiring (Plugin-Hook, der Hermes-Titel-Events an `send_session_meta` weiterreicht)

## 2026-05-24 13:41 – cursor – Homer deploy session_meta + Gateway-Patch

- Done:
  - rsync `packages/custom_chat_schema/` → `homer@192.168.177.149:~/packages/custom_chat_schema/` (inkl. `session_meta` in OUTBOUND_TYPES)
  - rsync `adapter.py` → `homer@192.168.177.149:~/.hermes/plugins/custom_chat/` (`send_session_meta` verifiziert: 2 Treffer)
  - Neues Script `scripts/apply-hermes-session-meta-patch.sh`: patcht Hermes `gateway/run.py` idempotent mit `_notify_custom_chat_session_title` / `_schedule_custom_chat_session_title_notify`
  - Patch auf Homer angewendet (Hooks: `/title`, `/new <title>`, Auto-Title via `maybe_auto_title` title_callback)
  - `systemctl --user restart hermes-gateway.service` → active; WS :8765 listening
- Next:
  - Manuell testen: `/title Mein Projekt` im Web-Chat → TopBar sollte Titel zeigen
  - Optional: initialer Title-Sync beim WS-Connect für bereits benannte Sessions
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched (remote):
  - ~/.hermes/plugins/custom_chat/adapter.py
  - ~/packages/custom_chat_schema/
  - ~/.hermes/hermes-agent/gateway/run.py (patched)
- Test notes:
  - remote: `grep -c send_session_meta adapter.py` → 2; `grep -c _notify_custom_chat_session_title run.py` → 2
  - gateway: active, port 8765 LISTEN
- Changelog updated:
  - no (deploy only; schema/feature already in prior commit)
- Follow-ups:
  - Title-Sync für bestehende Sessions beim Chat-Wechsel/Reconnect

## 2026-05-24 14:20 – cursor – MIME-Normalisierung, STT, Mobile-Rail-Drawer

- Done:
  - `packages/custom_chat_schema/mime.py`: gemeinsame `normalize_mime_type` für BFF und Plugin
  - BFF `MediaStore` + Plugin `validate_*`: Codec-Parameter aus MIME entfernen (`audio/webm;codecs=opus` → `audio/webm`)
  - `transcribe_audio`: Audio laden (lokal/HTTP) und Hermes-STT (Whisper) statt Platzhaltertext
  - Frontend: `normalizeMimeType`, Mikrofon sendet `audio.uploaded`, Mobile-Rail-Drawer (Hamburger, Backdrop, Esc)
  - BFF lädt `web/.env` beim Start (`WEB_PUBLIC_MEDIA_BASE_URL` u. a.)
  - Tests angepasst/erweitert (media, e2e, media_store, vitest)
- Next:
  - Homer: Plugin + Schema deployen, Gateway neu starten
  - STT-End-to-End mit echter Whisper-Instanz auf Homer prüfen
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - packages/custom_chat_schema/mime.py
  - plugins/platforms/custom_chat/media.py
  - web/backend/app/core/config.py
  - web/backend/app/services/media_store.py
  - web/frontend/src/lib/normalizeMimeType.ts
  - web/frontend/src/hooks/useAudioRecorder.ts
  - web/frontend/src/features/chat/useChatController.ts
  - web/frontend/src/features/shell/Rail.tsx, TopBar.tsx, shell.css, icons.tsx
  - web/frontend/src/api/wsClient.ts
  - tests/plugins/custom_chat/test_media.py, test_custom_chat_e2e.py
  - tests/web/test_media_store.py
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `pytest tests/plugins/custom_chat/test_media.py tests/web/test_media_store.py -q`, `cd web/frontend && npx vitest run src/lib/normalizeMimeType.test.ts`
- Changelog updated:
  - yes (bereits unter Unreleased: MIME/STT/Drawer)
- Follow-ups:
  - Deploy auf Homer

## 2026-05-24 14:05 – cursor – Auto-Titel Hintergrund-Delivery

- Done:
  - Root cause: BFF nutzt eine Upstream-WS für alle Chats; `session_meta` fiel durch `broadcast(chat_id=...)` + stale `client_context` durch, wenn Auto-Titel für einen anderen Chat im Hintergrund lief
  - Adapter: `session_meta` wird via `broadcast(all_clients=True)` gesendet; `_bind_ws_for_chat` rebindet bei Single-Client alle Chat-Routen auf die aktive WS
  - Gateway-Patch v2 auf Homer: `_resolve_custom_chat_source_for_session_id`, robuster Adapter-Lookup, Auto-Title-Callback über session_id
  - Deploy: `adapter.py`, `transport/ws_server.py`, Gateway-Upgrade-Script; Gateway restarted (active)
  - Tests: `test_session_meta` erweitert (stale client_context Szenario)
- Next:
  - Manuell: neuer Chat → erste Nachricht → Auto-Titel erscheint in TopBar ohne Reload
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Changelog updated:
  - yes (Fixed)

## 2026-05-24 14:10 – cursor – Repo commit + push session_meta

- Done:
  - `apply-hermes-session-meta-patch.sh` chained mit v2-Upgrade (idempotent one-shot)
  - Deploy-Hinweis in `docs/custom_chat.md` ergänzt
  - Branch `feat/adapter-contract-v1` committed und gepusht
- Next:
  - none
- Changelog updated:
  - no (docs only)

## 2026-05-24 22:05 – cursor – Reasoning-Panel rendert Markdown + dangling Fence wird entfernt

- Done:
  - `MessageReasoning` rendert den Reasoning-Body via `MarkdownText`; bisher wurde der Text als rohe `<p>`-Absätze gezeigt, sodass `**bold**` und ` ``` ` literal erschienen
  - `MarkdownText` läuft jetzt durch `balanceFencedCode`: ein offener Fence-Opener ohne passenden Closer wird entfernt, damit nachfolgender Markdown-Inhalt (Bold, Listen, Links) nicht in einem `<pre><code>`-Block verschwindet
  - Reasoning-CSS angepasst (gemeinsame `.markdown-text`-Regeln im Reasoning-Body, ohne die `prose`-Größe zu erben)
  - Tests: neue Vitest-Cases für `balanceFencedCode` und für „Bold tail nach offenem Fence rendert weiterhin"
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - web/frontend/src/features/chat/MarkdownText.tsx
  - web/frontend/src/features/chat/MarkdownText.test.tsx
  - web/frontend/src/features/chat/messages/MessageReasoning.tsx
  - web/frontend/src/styles/transcript.css
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `npx vitest run` (38 passed), `npx tsc --noEmit` (clean)
  - UI path: Sidebar → demo → Reasoning-Toggle „Thought for …" expandiert; Antwortliste mit Bold-Produktnamen, Preisen und Links rendert ohne Code-Block
- Changelog updated:
  - yes (Fixed)
- Follow-ups:
  - Backend-seitig: prüfen, ob `_prepend_reasoning` auf einen klareren Separator (oder eigenes Notice-Event) umgestellt werden soll, sobald die Splitting-Heuristik im Frontend an weiteren Edge Cases scheitert

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-24 22:20 – composer – interrupt_session_activity API fix

- Done:
  - Root cause für hängende Session `workspace:a0f9a64f-…`: Hermes gateway ruft `interrupt_session_activity(session_key, chat_id)` auf, Plugin hatte nur `(chat_id)` → TypeError bei `/new`
  - Signatur in `adapter.py` auf `(session_key, chat_id)` angepasst; Tests aktualisiert (2 passed)
  - CHANGELOG [Unreleased] Fixed ergänzt
- Next:
  - Nach Deploy auf Homer: Session mit `/new` resetten oder neuen Chat anlegen
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - tests/plugins/custom_chat/test_interrupt.py
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `python -m pytest tests/plugins/custom_chat/test_interrupt.py -q` → 2 passed
  - BFF/Hermes smoke: `workspace:demo` antwortet; `workspace:a0f9a64f-…` hing vor Fix (typing ohne assistant_done)
  - Deploy Homer: rsync adapter.py; `systemctl --user restart hermes-gateway.service` → active; WS :8765; `/new` auf hängender Session → assistant_done ohne TypeError
- Changelog updated:
  - yes (Fixed)
- Follow-ups:
  - none

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-24 22:34 – cursor – Reasoning-Text vollständig in Reasoning-Box

- Done:
  - Bug: gestreamter Thinking-Text landete in der Antwort-Bubble, weil `splitReasoning` am ersten `\n\n` trennte und Hermes nur Abschnitts-Header in `metadata.reasoning` lieferte
  - Adapter: `assistant_done.reasoning_text` + sauberes `final_text`; `_split_reasoning_answer` merged Header + gestreamten Gedankengang
  - Frontend: `reasoningText` auf TranscriptLine; Fallback-Split an letzter Leerzeile
- Next:
  - Plugin auf Homer deployen + Frontend neu bauen, dann Smoke mit `läuft?`
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - web/frontend/src/features/chat/reasoningSplit.ts
  - web/frontend/src/features/chat/reasoningSplit.test.ts
  - web/frontend/src/features/chat/TurnGroup.tsx
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/chatReducer.test.ts
  - web/frontend/src/types/events.ts
  - docs/CHANGELOG.md
  - docs/custom_chat.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `npx vitest run reasoningSplit chatReducer`, `pytest test_streaming.py::test_reasoning_*`
- Changelog updated:
  - yes (Fixed)
- Follow-ups:
  - none

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-24 22:49 – cursor – Homer Plugin deploy (reasoning_text + aktueller Stand)

- Done:
  - rsync `packages/custom_chat_schema/` → `homer@192.168.177.149:~/packages/custom_chat_schema/`
  - rsync `plugins/platforms/custom_chat/` → `~/.hermes/plugins/custom_chat/`
  - `systemctl --user restart hermes-gateway.service` → `active`; WS `:8765` listening
- Next:
  - Frontend-Deploy separat, falls UI-Änderungen auf Homer laufen sollen
- Changelog updated:
  - no (deploy only)

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-24 23:00 – cursor – User-Uploads rechts ausrichten

- Done:
  - `TranscriptLine.role` für User/Assistant-Media im Reducer
  - Turn-Gruppierung: Bilder und Audio als User-Anchor
  - `TurnGroup`: Uploads, Bilder und Sprachnachrichten rechts rendern
  - CSS: `media-image-card-right`, `audio-card-right`
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - web/frontend/src/types/events.ts
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/turnGrouping.ts
  - web/frontend/src/features/chat/TurnGroup.tsx
  - web/frontend/src/features/media/ImageCard.tsx
  - web/frontend/src/features/media/AudioCard.tsx
  - web/frontend/src/features/media/media.css
  - docs/CHANGELOG.md
- Test notes:
  - commands: `cd web/frontend && npm test -- --run`
- Changelog updated:
  - yes (Fixed)
- Follow-ups:
  - none

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-25 20:12 – cursor – Chat media/message rendering

- Done:
  - `ChatMessage` / `MessagePart` model + `normalizeTranscript` / `groupMessages` / `PartRenderer`
  - Streaming: `sequence` dedup, reorder buffer, interrupted partial preserve
  - `message.create` + `attachments[]` (schema, mapping, wsClient, Composer draft)
  - Structured tool notices + `ActivityCard` structured-first
  - `VideoCard` + video MIME routing
  - Vitest + schema tests (61 frontend, 10 python config)
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - web/frontend/src/features/chat/model/*
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/composer/*
  - packages/custom_chat_schema/schema.py
  - plugins/platforms/custom_chat/events/mapping.py
  - docs/CHANGELOG.md
- Test notes:
  - commands: `cd web/frontend && npm test`, `npm run build`, `pytest tests/plugins/custom_chat/test_config.py`
- Changelog updated:
  - yes (Added)
- Follow-ups:
  - optional Playwright UI smoke for Composer attachments

## 2026-05-25 20:32 – cursor-agent – Schnittstellen-Audit Fixes

- Done:
  - Plugin: `message.cancel` resolves line/segment/turn ids; emits `assistant_done(interrupted)` via `_cancel_reply_streams`
  - Plugin: `send_slash_confirm` with `metadata.gateway_approval` populates `_approval_state`
  - Frontend: `streamTurnId` + `resolveCancelTargetId` for cancel after segments
  - Schema: `ModelPickerPayload`, extended `AssistantNoticePayload` tool fields
  - BFF: media GET returns guessed MIME type; docs for cancel, upload limits, TTS placeholder warning
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: (current)
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - plugins/platforms/custom_chat/streaming.py
  - plugins/platforms/custom_chat/media.py
  - packages/custom_chat_schema/schema.py
  - web/backend/app/api/media.py
  - web/frontend/src/features/chat/*
  - tests/plugins/custom_chat/test_cancel.py
  - tests/plugins/custom_chat/test_slash_confirm.py
  - docs/custom_chat.md
  - docs/web-app.md
  - docs/CHANGELOG.md
- Test notes:
  - commands: `pytest tests/plugins/custom_chat/test_cancel.py tests/plugins/custom_chat/test_interrupt.py tests/plugins/custom_chat/test_slash_confirm.py -q`, `cd web/frontend && npm test -- --run chatReducer.test.ts`
- Changelog updated:
  - yes (Fixed, Added schema note)
- Follow-ups:
  - wire real TTS provider when `audio_response` is needed in production

## 2026-05-25 20:45 – cursor – Interface Contract Dokument

- Done:
  - `docs/interface_contract.md` erstellt: vollständiges Contract-Dokument für alle drei Schichten
    - Abschnitt 1: Frontend ↔ BFF (WS /ws/chat, REST /api/v1/…, Env-Variablen)
    - Abschnitt 2: BFF ↔ Plugin (Event Schema v1, alle Inbound-/Outbound-Events mit TypeScript-Typen, Streaming-Sequenzen, Auth, Deduplizierung)
    - Abschnitt 3: Plugin ↔ Hermes Core (BasePlatformAdapter-Methoden, SendResult, MessageEvent, SessionSource, register(ctx))
    - Abschnitt 4: MIME-Allowlists
    - Abschnitt 5: Invarianten & Regeln
  - Hermes-Dokumentation (NousResearch/hermes-agent) als Referenz für BasePlatformAdapter und ctx.register_platform() herangezogen
  - CHANGELOG [Unreleased] → Added ergänzt
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: (aktueller Working-Tree)
  - PR: none
- Files touched:
  - docs/interface_contract.md (neu)
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: n/a (Dokumentation)
  - endpoints: n/a
  - UI path: n/a
- Changelog updated:
  - yes (Added)
- Follow-ups:
  - Contract-Dokument bei größeren Schema-Änderungen mitpflegen
  - Versionierungsstrategie für Schema-Upgrades (v2) definieren

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-25 22:30 – cursor – Contract-Code Abgleich

- Done:
  - `docs/interface_contract.md` an Code angeglichen: `typing` state, `interrupted`, REST `detail`, WS 4401, Env-Namen, `slash_pick` → `command.create`, `register`/`check_fn`, `raw_message`, MessageType PHOTO/IMAGE
  - Plugin-Defaults: `ws_host` `0.0.0.0`, `dedupe_ttl_seconds` 60 in `packages/custom_chat_schema/settings.py`
  - `send_image`: `mime_type` immer gesetzt (Metadata, URL-Guessing, Fallback `image/png`)
  - Tests: `test_config.py`, `test_notice_image_typing.py` (neuer Guessing-Test)
  - `docs/custom_chat.md` Defaults aktualisiert
- Next:
  - none
- Blockers:
  - none
- Branch/PR:
  - branch: (aktueller Working-Tree)
  - PR: none
- Files touched:
  - docs/interface_contract.md
  - docs/custom_chat.md
  - docs/CHANGELOG.md
  - packages/custom_chat_schema/settings.py
  - plugins/platforms/custom_chat/adapter.py
  - tests/plugins/custom_chat/test_config.py
  - tests/plugins/custom_chat/test_notice_image_typing.py
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `pytest tests/plugins/custom_chat/test_config.py tests/plugins/custom_chat/test_notice_image_typing.py tests/web/test_enrich.py -q` (19 passed)
- Changelog updated:
  - yes (Changed)
- Follow-ups:
  - none

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-25 22:10 – cursor – Media-Round-Trip Fix (Web ↔ Hermes)

- Done:
  - Plugin `message.create`-Pfad: pro Anhang `validate_message_attachment`, Audio-Anhänge laufen über `transcribe_attachment` (Hermes-STT) — Voice-/Datei-Uploads aus dem Composer landen wieder als sinnvoller `MessageEvent.text` bei Hermes
  - `events/mapping.py`: media-only `message.create` (kein Text) bekommt `[file:…] name url=…` / `[audio:…]`-Fallback-Text, plus existierende `media_urls`/`media_types`
  - BFF `resolve_public_media_base_url`: defaultet auf `get_primary_ipv4()`, wenn weder `WEB_PUBLIC_MEDIA_BASE_URL`/`WEB_PUBLIC_HOST` noch ein nicht-loopback `BFF_HOST` gesetzt sind (vorher hartes `127.0.0.1` → entferntes Hermes konnte den BFF nicht erreichen, Bilder/Medien kamen nie im Frontend an)
  - BFF startup: loggt die ausgehandelte `public_media_base_url`
  - Neue Tests: `test_message_create_audio_attachment_transcribed`, `test_message_create_file_attachment_fallback_text`, `test_message_create_attachment_rejects_unsupported_mime`, `test_message_create_text_with_attachment_keeps_text`, `validate_message_attachment`/`transcribe_attachment` Unit-Tests, `test_resolve_public_media_*` LAN-Fallback-Tests
- Next:
  - Frontend könnte zusätzlich `audio.uploaded`/`file.uploaded` für reine Single-Attachment-Sends senden, um vor-Plugin-Update-Hosts zu unterstützen (optional, Plugin deckt beide Pfade ab)
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1
  - PR: none
- Files touched:
  - plugins/platforms/custom_chat/adapter.py
  - plugins/platforms/custom_chat/config.py
  - plugins/platforms/custom_chat/events/mapping.py
  - plugins/platforms/custom_chat/media.py
  - web/backend/app/core/network.py
  - web/backend/app/main.py
  - tests/plugins/custom_chat/test_media.py
  - tests/web/test_network.py
  - docs/CHANGELOG.md
  - planning/coordination/WORKLOG.md
- Test notes:
  - commands: `pytest tests/plugins/custom_chat/test_media.py tests/web/test_network.py -q` → 25 passed; `npm test -- --run` → 65 passed; volle Plugin+BFF-Suite → 103 passed (1 vorbestehender Test-Isolation-Fehler `test_settings_from_extra` durch `web/.env`-Pollution, nicht aus diesem Change)
  - endpoints: n/a
  - UI path: Composer → Paperclip/Mic → Datei senden → Hermes empfängt `MessageEvent.text` mit STT bzw. `[file:…] url=…`; assistant_image / -file werden mit LAN-IP an Frontend ausgeliefert
- Changelog updated:
  - yes (Fixed/Added)
- Follow-ups:
  - Pre-existing Test-Isolation Issue: `web/.env` wird global geladen und überschreibt `bearer_token` in `test_settings_from_extra` — separat in conftest fixen

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none

## 2026-05-25 21:23 – Auto – Frontend Edge-Case Fixes

- Done:
  - Browser-Audit Edge Cases umgesetzt (Scroll, Upload-Race, Lightbox, MIME, Offline, WS-Reconnect)
  - `useScrollFollow` + `Transcript`: Scroll-Reset bei Session-Wechsel
  - Pending-Attachments an `chatId` gebunden; Offline `NOT_CONNECTED`-Fehler
  - `MediaProvider.registryKey`, `ImageCard`-HTML, Composer-Hint, `MessageReasoning` „Thought briefly“
  - `wsClient`: Reconnect-Timer canceln, doppeltes `connect()` vermeiden
  - `sessionPersistence`: `running` → `idle`, localStorage try/catch
- Next:
  - BFF neu starten und Mikrofon manuell verifizieren
- Blockers:
  - none
- Branch/PR:
  - branch: feat/adapter-contract-v1 (working tree)
  - PR: none
- Files touched:
  - web/frontend/src/hooks/useScrollFollow.ts
  - web/frontend/src/features/chat/Transcript.tsx
  - web/frontend/src/features/chat/ChatPage.tsx
  - web/frontend/src/features/chat/useChatController.ts
  - web/frontend/src/features/chat/chatReducer.ts
  - web/frontend/src/features/chat/sessionPersistence.ts
  - web/frontend/src/features/chat/sessionPersistence.test.ts
  - web/frontend/src/features/composer/Composer.tsx
  - web/frontend/src/features/media/MediaProvider.tsx
  - web/frontend/src/features/media/ImageCard.tsx
  - web/frontend/src/features/media/media.css
  - web/frontend/src/features/shell/ConnectionBanner.tsx
  - web/frontend/src/features/chat/messages/MessageReasoning.tsx
  - web/frontend/src/api/wsClient.ts
  - docs/CHANGELOG.md
- Test notes:
  - commands: `cd web/frontend && npm test` (63 passed)
- Changelog updated:
  - yes (Fixed)
- Follow-ups:
  - Manuell: Chat-Wechsel, Mikrofon, Lightbox über zwei Sessions

Security leak check: PASS
PII check: PASS
Sensitive data touched: no
Redactions performed: none
