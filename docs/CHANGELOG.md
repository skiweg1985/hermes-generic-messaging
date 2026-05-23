# Changelog

## [Unreleased]

### Fixed

- Plugin loaded by Hermes `discover_plugins`: `__init__.py` now exports `register` and bootstraps `packages/` onto `sys.path`
- Plugin-internal imports use relative paths so the adapter works when Hermes loads it via `spec_from_file_location` (no global `plugins.platforms.custom_chat` package required)
- `_env_enablement` no longer overwrites YAML `extra.ws_host` / `ws_port` with hard-coded defaults when the env vars are unset

### Changed

- Operator docs: Hermes config uses top-level `platforms:` and `plugins.enabled: [custom_chat-platform]` (not `gateway.platforms`)
- Install: use `scripts/bootstrap-venv.sh` on hosts without writable system/user site-packages; removed `setup.py` legacy develop shim
- `requires-python` set to `>=3.10`

### Added

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
