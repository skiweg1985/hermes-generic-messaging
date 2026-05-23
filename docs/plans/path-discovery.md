# Path discovery

Concrete paths for the Universal Hermes Platform Adapter in this repository.

## Plugin layout

| Role | Path |
|------|------|
| Platform adapter | `plugins/platforms/custom_chat/adapter.py` |
| Plugin metadata | `plugins/platforms/custom_chat/plugin.yaml` |
| Config / defaults | `plugins/platforms/custom_chat/config.py` |
| WebSocket transport | `plugins/platforms/custom_chat/transport/ws_server.py` |
| Event schema / mapping | `plugins/platforms/custom_chat/events/` |
| Streaming helper | `plugins/platforms/custom_chat/streaming.py` |
| Media (STT/TTS) | `plugins/platforms/custom_chat/media.py` |
| State (dedupe/cancel) | `plugins/platforms/custom_chat/state.py` |
| Tests | `tests/plugins/custom_chat/` |
| Contract doc | `docs/plans/universal-platform-adapter-v1.md` |
| Multi-chat UI plan | `docs/plans/multi-chat-sessions-web-ui.md` |
| Operator docs | `docs/custom_chat.md` |
| Example events | `docs/examples/custom-chat-events-v1.json` |

## Shared schema

| Role | Path |
|------|------|
| Event Schema v1 models | `packages/custom_chat_schema/` |

## Web app

| Role | Path |
|------|------|
| FastAPI BFF | `web/backend/app/` |
| React UI | `web/frontend/src/` |
| Web operator docs | `docs/web-app.md` |
| Web tests | `tests/web/` |
| Dev compose (optional) | `web/docker-compose.yml` |

## Hermes Agent reference (runtime dependency, not edited here)

| Role | Path in [hermes-agent](https://github.com/NousResearch/hermes-agent) |
|------|----------------------------------------------------------------------|
| Base adapter | `gateway/platforms/base.py` |
| Config types | `gateway/config.py` |
| Plugin loader | `plugins/platforms/*/adapter.py` + `register(ctx)` |

## Tooling

```bash
pip install -e ".[dev,web]"
python -m pytest tests/plugins/custom_chat tests/web -q
cd web/frontend && npm test
```

Optional integration against a local hermes-agent clone:

```bash
export HERMES_AGENT_PATH=../hermes-agent
python -m pytest tests/ -q
```
