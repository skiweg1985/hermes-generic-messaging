# Worklog

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
