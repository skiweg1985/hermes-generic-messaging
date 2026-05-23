# Changelog

## [Unreleased]

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
