# 🗺️ Repository-Wegweiser

Dieses Dokument ist ein historisch entstandener Wegweiser durch das Repository.
Für den laufenden Betrieb sind [README.md](../../README.md),
[docs/custom_chat.md](../custom_chat.md) und [docs/web-app.md](../web-app.md)
wichtiger. Für Entwicklung und Fehlersuche hilft diese Übersicht weiterhin.

## Plugin

| Bereich | Pfad |
|---------|------|
| Adapter | `plugins/platforms/custom_chat/adapter.py` |
| Plugin-Metadaten | `plugins/platforms/custom_chat/plugin.yaml` |
| Konfigurations-Reexport | `plugins/platforms/custom_chat/config.py` |
| WebSocket-Transport | `plugins/platforms/custom_chat/transport/ws_server.py` |
| Event-Mapping | `plugins/platforms/custom_chat/events/` |
| Streaming-Helfer | `plugins/platforms/custom_chat/streaming.py` |
| Medien-Helfer | `plugins/platforms/custom_chat/media.py` |
| Deduplizierung und Cancel-State | `plugins/platforms/custom_chat/state.py` |
| Plugin-Tests | `tests/plugins/custom_chat/` |

## Gemeinsames Schema

| Bereich | Pfad |
|---------|------|
| Event- und Payload-Modelle | `packages/custom_chat_schema/schema.py` |
| Plugin-Einstellungen | `packages/custom_chat_schema/settings.py` |
| MIME-Helfer | `packages/custom_chat_schema/mime.py` |

## Web-App

| Bereich | Pfad |
|---------|------|
| FastAPI-App | `web/backend/app/` |
| WebSocket-Proxy | `web/backend/app/ws/chat_proxy.py` |
| REST-Endpunkte | `web/backend/app/api/` |
| Session-Speicher | `web/backend/app/services/session_store.py` |
| Medien-Speicher | `web/backend/app/services/media_store.py` |
| React-App | `web/frontend/src/` |
| Frontend-Tests | `web/frontend/src/**/*.test.ts*` |
| Web-BFF-Tests | `tests/web/` |

## Dokumentation

| Zweck | Datei |
|-------|-------|
| Einstieg | `README.md` |
| Dokumentationsübersicht | `docs/README.md` |
| Plugin-Betrieb | `docs/custom_chat.md` |
| Web-App-Betrieb | `docs/web-app.md` |
| Schnittstellenreferenz | `docs/interface_contract.md` |
| Beispiel-Events | `docs/examples/custom-chat-events-v1.json` |
| Historische Pläne | `docs/plans/` |

## Nützliche Befehle

```bash
python -m pytest tests/plugins/custom_chat tests/web -q
cd web/frontend && npm test
```

Für Layout-Prüfungen der Web-App:

```bash
cd web/frontend
npm run check:layout
```
