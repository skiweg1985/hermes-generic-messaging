# Worklog

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
