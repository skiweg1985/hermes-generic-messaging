# Hermes Generic Messaging

Hermes Generic Messaging verbindet den Hermes Gateway mit eigenen Chat-Oberflächen.
Das Projekt liefert zwei Bausteine:

- ein Hermes-Platform-Plugin namens `custom_chat`
- eine optionale Weboberfläche mit FastAPI-Backend und React-Frontend

Das Plugin spricht ein JSON-basiertes WebSocket-Protokoll. Die Weboberfläche nutzt
dieses Protokoll bereits und eignet sich als fertiger Browser-Chat, als Beispiel
für eigene Clients und als Testumgebung für den Betrieb.

## 🧭 Für wen ist dieses Projekt?

| Zielgruppe | Einstieg |
|------------|----------|
| Administratoren | [Plugin installieren und konfigurieren](docs/custom_chat.md) |
| Betreiber der Weboberfläche | [Web-App betreiben](docs/web-app.md) |
| Entwickler eigener Clients | [Schnittstellenreferenz](docs/interface_contract.md) |
| Beitragende am Repository | [Entwicklungs- und Testbefehle](#entwicklung) |

Eine vollständige Dokumentationsübersicht steht in [docs/README.md](docs/README.md).

## 🧱 Systemüberblick

```text
Browser oder eigener Client
        |
        |  WebSocket / REST
        v
FastAPI-BFF der Web-App
        |
        |  Event Schema v1 über WebSocket
        v
custom_chat Plugin
        |
        v
Hermes Gateway
```

Das Plugin ist die Integrationsschicht zu Hermes. Die Web-App ist optional, aber
praktisch: Sie kümmert sich um Browser-Verbindungen, Medien-Uploads, Diagnose und
lokale Chat-Sitzungen.

## 🗂️ Repository-Struktur

| Pfad | Zweck |
|------|-------|
| `plugins/platforms/custom_chat/` | Hermes-Plugin mit WebSocket-Adapter |
| `packages/custom_chat_schema/` | Gemeinsame Schema- und Konfigurationsmodelle |
| `web/backend/` | FastAPI-BFF für WebSocket-Proxy, Medien, Diagnose und Sitzungen |
| `web/frontend/` | React-Oberfläche für den Browser-Chat |
| `docs/` | Produkt-, Betriebs- und Referenzdokumentation |
| `tests/` | Python-Tests für Plugin und Web-BFF |

## ✅ Voraussetzungen

- Python 3.10 oder neuer
- Node.js und npm für die Weboberfläche
- ein laufender Hermes Gateway, wenn du echte Nachrichten verarbeiten möchtest

**Hinweis:** Auf Servern sollte die Python-Installation in einer virtuellen
Umgebung erfolgen. Das vermeidet Rechteprobleme und hält System-Python sauber.

## 🚀 Schnellstart für Entwicklung

```bash
./scripts/bootstrap-venv.sh
source .venv/bin/activate
```

Der Befehl installiert die Python-Abhängigkeiten im Repository. Für die Web-App
wird zusätzlich das Frontend eingerichtet:

```bash
cd web/frontend
npm install
cd ../..
```

Starte anschließend die drei beteiligten Prozesse:

```bash
# Terminal 1: Hermes Gateway mit aktiviertem custom_chat Plugin
# Siehe docs/custom_chat.md

# Terminal 2: FastAPI-BFF
cd web/backend
uvicorn app.main:app --reload --port 8000

# Terminal 3: React-Frontend
cd web/frontend
npm run dev
```

Die Oberfläche ist danach unter <http://127.0.0.1:5173> erreichbar.

## 🔌 Plugin in Hermes aktivieren

Verlinke das Plugin in das Hermes-Plugin-Verzeichnis:

```bash
ln -s "$(pwd)/plugins/platforms/custom_chat" ~/.hermes/plugins/custom_chat
```

Aktiviere es in `~/.hermes/config.yaml`:

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

Setze außerdem `CUSTOM_CHAT_BEARER_TOKEN` in `~/.hermes/.env`. Der Token schützt
die WebSocket-Verbindung zwischen Client oder Web-BFF und dem Plugin.

Die vollständige Anleitung steht in [docs/custom_chat.md](docs/custom_chat.md).

## 🖥️ Weboberfläche betreiben

Die Weboberfläche besteht aus einem FastAPI-BFF und einem React-Frontend. Das BFF
stellt `/ws/chat`, `/api/v1/media/*`, `/api/v1/diagnostics` und
`/api/v1/sessions` bereit.

Für lokale Entwicklung:

```bash
cd web
cp .env.example .env
# CUSTOM_CHAT_TARGET und CUSTOM_CHAT_BEARER_TOKEN setzen

cd ..
pip install -e ".[dev,web]"

cd web/backend
uvicorn app.main:app --reload --port 8000
```

In einem zweiten Terminal:

```bash
cd web/frontend
npm install
npm run dev
```

Mehr Details zu LAN-Betrieb, Medien-URLs, Session-Speicher und Produktion stehen
in [docs/web-app.md](docs/web-app.md).

## 🧪 Entwicklung

Python-Tests:

```bash
python -m pytest tests/plugins/custom_chat tests/web -q
```

Frontend-Tests:

```bash
cd web/frontend
npm test
```

Layout-Prüfung für die Weboberfläche:

```bash
cd web/frontend
npm run check:layout
```

## ✍️ Wichtige Begriffe

| Begriff | Bedeutung |
|---------|-----------|
| Chat | Eine Unterhaltung, identifiziert über `chat_id` |
| Sitzung | Lokaler UI-Zustand eines Chats in der Weboberfläche |
| BFF | Backend for Frontend; der FastAPI-Dienst zwischen Browser und Plugin |
| Plugin | Hermes-Platform-Plugin `custom_chat` |
| Event Schema v1 | JSON-Protokoll zwischen Client/BFF und Plugin |

## 📚 Weiterführende Dokumentation

- [Dokumentationsübersicht](docs/README.md)
- [Plugin installieren und betreiben](docs/custom_chat.md)
- [Web-App konfigurieren und betreiben](docs/web-app.md)
- [Schnittstellenreferenz für Entwickler](docs/interface_contract.md)
- [Beispiel-Events](docs/examples/custom-chat-events-v1.json)
