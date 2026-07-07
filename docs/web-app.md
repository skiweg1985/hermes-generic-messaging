# 🖥️ Web-App betreiben

Die Web-App ist die mitgelieferte Browser-Oberfläche für `custom_chat`. Sie ist
für Menschen gedacht, die Hermes im Browser nutzen möchten, und für Teams, die
einen Referenz-Client für eigene Integrationen brauchen.

Die Web-App besteht aus zwei Teilen:

- **FastAPI-BFF**: verbindet den Browser mit dem `custom_chat` Plugin, speichert
  Uploads, liefert Diagnoseinformationen und hält leichten Sitzungszustand.
- **React-Frontend**: zeigt Chats, Medien, Streaming-Antworten, Freigaben,
  Sitzungen und Diagnose im Browser an.

## 🧭 Wie die Web-App arbeitet

```text
Browser
  |  /ws/chat, /api/v1/*
  v
FastAPI-BFF
  |  Event Schema v1 über WebSocket
  v
custom_chat Plugin
  |
  v
Hermes Gateway
```

Der Browser spricht nicht direkt mit Hermes. Das BFF übernimmt diese Aufgabe,
weil es Token, Medien-URLs, Uploads und Diagnose zentral behandeln kann.

## ✅ Voraussetzungen

- Das `custom_chat` Plugin läuft im Hermes Gateway.
- Der WebSocket-Port des Plugins ist vom BFF aus erreichbar.
- `CUSTOM_CHAT_BEARER_TOKEN` ist im Plugin und im BFF gleich gesetzt.
- Python 3.10 oder neuer ist installiert.
- Node.js und npm sind für das Frontend verfügbar.

## 🚀 Lokal starten

Erstelle zuerst die BFF-Konfiguration:

```bash
cd web
cp .env.example .env
```

Bearbeite `web/.env`:

```bash
CUSTOM_CHAT_TARGET=127.0.0.1:8765
CUSTOM_CHAT_BEARER_TOKEN=ein-langer-zufaelliger-token
```

Installiere die Python-Abhängigkeiten aus dem Repository-Root:

```bash
cd ..
pip install -e ".[dev,web]"
```

Starte das BFF:

```bash
cd web/backend
uvicorn app.main:app --reload --port 8000
```

Starte in einem zweiten Terminal das Frontend:

```bash
cd web/frontend
npm install
npm run dev
```

Öffne anschließend <http://127.0.0.1:5173>.

## ⚙️ BFF-Konfiguration

Die wichtigsten Einstellungen stehen in `web/.env`.

| Variable | Standard | Wann relevant? |
|----------|----------|----------------|
| `CUSTOM_CHAT_TARGET` | leer | Ziel des Plugins, z. B. `127.0.0.1:8765` oder `ws://host:8765` |
| `CUSTOM_CHAT_WS_URL` | `ws://127.0.0.1:8765` | Legacy-Fallback, wenn `CUSTOM_CHAT_TARGET` fehlt |
| `CUSTOM_CHAT_BEARER_TOKEN` | leer | Token für die Verbindung zum Plugin |
| `WEB_AUTH_TOKEN` | leer | Optionaler Token für Browser/BFF-Zugriff auf `/ws/chat` und geschützte `/api/v1/*`-Routen |
| `WEB_REQUIRE_AUTH` | `false` | Erzwingt BFF-Auth und schlägt fehl, wenn `WEB_AUTH_TOKEN` fehlt |
| `WEB_CHAT_ID` | `workspace:demo` | Fallback-Chat, wenn ein Client keine `chat_id` sendet |
| `WEB_USER_ID` | `user-demo` | Fallback-Benutzer, wenn ein Client keine `user_id` sendet |
| `WEB_MEDIA_UPLOAD_DIR` | `./data/uploads` | Speicherort für Uploads |
| `WEB_SESSION_STORE_PATH` | `./data/chat_sessions.json` | Speicherort für UI-Sitzungen |
| `WEB_MAX_UPLOAD_BYTES` | `20971520` | Maximale Upload-Größe |
| `WEB_ALLOWED_UPLOAD_MIME_TYPES` | Schema-Standard | Erlaubte MIME-Typen |
| `WEB_PUBLIC_MEDIA_BASE_URL` | automatisch | URL, die Browser für Medien erhalten |
| `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` | öffentliche Medien-URL | URL, die dem Plugin per `client.register` gemeldet wird |
| `WEB_CORS_ORIGINS` | lokale Vite-Origins | Erlaubte Browser-Origins |
| `WEB_CORS_REFLECT_ORIGIN` | `false` | Erlaubt in Entwicklung alle HTTP(S)-Origins |

**Tipp:** Verwende für neue Installationen `CUSTOM_CHAT_TARGET`. Es ist
lesbarer als mehrere einzelne Host-/Port-Variablen.

## 🔐 BFF-Zugriffsschutz

Für reine localhost-Entwicklung bleibt die Web-App ohne zusätzlichen Browser-Token
nutzbar. Sobald das BFF im LAN oder öffentlich erreichbar ist, solltest du aber
einen separaten Browser/BFF-Token setzen:

```bash
WEB_AUTH_TOKEN=ein-zweiter-langer-zufaelliger-token
WEB_REQUIRE_AUTH=true
```

Dann schützt das BFF diese Flächen:

- `WS /ws/chat`
- `GET /api/v1/diagnostics`
- `POST /api/v1/media/upload`
- `GET /api/v1/media/{file_id}`
- `GET/PUT /api/v1/sessions`

Clients senden den Token per Authorization-Bearer-Header, `X-BFF-Auth` oder —
für Browser-Subresources wie Bilder/Audio/Video — per `?auth_token=...`. Für
Browser-WebSockets wird ebenfalls `?auth_token=...` unterstützt, weil Browser
beim `WebSocket`-Konstruktor keine beliebigen Header setzen können. Die
mitgelieferte Frontend-App liest den Token aus `VITE_WEB_AUTH_TOKEN` oder aus
`localStorage["custom-chat:bff-auth-token"]`.

`/api/v1/health` bleibt bewusst unauthentifiziert, damit Load Balancer und
Container-Healthchecks weiterhin funktionieren.

## 🌐 Medien-URLs richtig setzen

Medien sind der häufigste Stolperstein in verteilten Setups. Drei Systeme müssen
dabei dieselbe Datei erreichen können:

1. der Browser, um Medien anzuzeigen oder herunterzuladen
2. das BFF, um Uploads zu speichern
3. Hermes beziehungsweise das Plugin, um ausgehende lokale Dateien hochzuladen

Für lokale Entwicklung reicht meist die automatische Erkennung. In Docker- oder
LAN-Setups solltest du die URL bewusst setzen.

### Beispiel: Hermes in Docker, BFF auf dem Host

```bash
WEB_PUBLIC_MEDIA_BASE_URL=http://127.0.0.1:8000
WEB_CUSTOM_CHAT_MEDIA_BASE_URL=http://host.docker.internal:8000
```

Der Browser nutzt die lokale Host-URL. Das Plugin im Container nutzt die
Container-erreichbare Host-Adresse.

### Beispiel: Hermes auf einem anderen LAN-Host

```bash
CUSTOM_CHAT_TARGET=192.168.177.149:8765
WEB_PUBLIC_MEDIA_BASE_URL=http://192.168.177.20:8000
```

Starte das BFF dann auf einer erreichbaren Adresse:

```bash
BFF_HOST=0.0.0.0 ./scripts/dev.sh
```

## 💬 Chats und Sitzungen

Die Web-App unterstützt mehrere parallele Chats. Jeder Chat hat eine eigene
`chat_id`, zum Beispiel `workspace:<uuid>`.

Die Oberfläche speichert:

- die aktive Sitzung
- Chat-Titel
- die letzten Transcript-Zeilen
- Streaming- und Typing-Zustand nur als Laufzeitstatus

Der Zustand liegt im Browser in `localStorage` und wird zusätzlich über
`/api/v1/sessions` im BFF gespiegelt. Das ist praktisch für lokale Wiederaufnahme,
aber kein dauerhaftes Archiv des Hermes-Verlaufs.

Das BFF begrenzt den Session-Speicher auf 80 Sitzungen und 200 Transcript-Zeilen
pro Sitzung. Dadurch bleibt der Speicher kontrollierbar, auch wenn viele Chats
angelegt werden.

## 🧰 Funktionen in der Oberfläche

| Funktion | Was Benutzer sehen |
|----------|--------------------|
| Streaming | Antworten erscheinen fortlaufend statt erst am Ende |
| Slash Commands | Befehle wie `/model` oder `/reset` können direkt eingegeben werden |
| Freigaben | Aktionen wie `/reload-mcp` erscheinen als Button-Karte |
| Medien | Bilder, Dateien, Audio und Videos werden passend dargestellt |
| Mehrere Chats | Chats sind in der Seitenleiste getrennt |
| Diagnose | Verbindungszustand von Browser, BFF und Plugin ist sichtbar |
| Sicheres Markdown | Antworten können Listen, Tabellen, Code und Links enthalten |

## 🔍 Diagnose

Das BFF stellt eine Diagnose-Route bereit:

```bash
curl http://127.0.0.1:8000/api/v1/diagnostics
```

Eine gesunde Antwort sieht sinngemäß so aus:

```json
{
  "bff": "ok",
  "upstream": {
    "target": "127.0.0.1:8765",
    "status": "ok"
  }
}
```

Mögliche Upstream-Statuswerte:

| Status | Bedeutung |
|--------|-----------|
| `ok` | BFF erreicht das Plugin |
| `unreachable` | Host oder Port ist nicht erreichbar |
| `unauthorized` | Token fehlt oder ist falsch |
| `closed` | Plugin hat die Verbindung geschlossen |
| `error` | Unerwarteter WebSocket-Fehler |

## 🏭 Produktion auf einem HTTPS-Port

Für einfache Deployments kann das BFF das gebaute Frontend direkt ausliefern.
Dadurch laufen UI, API und WebSocket über denselben Host und Port.

```bash
cd web/frontend
npm install
npm run build

cd ../backend
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --ssl-certfile /path/to/cert.pem \
  --ssl-keyfile /path/to/key.pem
```

Das BFF bedient dann:

- `/` für das Frontend
- `/api/v1/*` für REST-Endpunkte
- `/ws/chat` für den Chat-WebSocket

In größeren Umgebungen ist ein Reverse Proxy vor dem BFF sinnvoll. Er kann TLS,
Zugriffsschutz, Logging und Rate Limits zentral übernehmen.

## 🔌 API der Web-App

| Methode | Pfad | Zweck |
|---------|------|-------|
| `GET` | `/api/v1/health` | einfacher Liveness-Check |
| `GET` | `/api/v1/diagnostics` | prüft BFF und Verbindung zum Plugin |
| `POST` | `/api/v1/media/upload` | speichert einen Medien-Upload |
| `GET` | `/api/v1/media/{file_id}` | liefert einen gespeicherten Upload aus |
| `GET` | `/api/v1/sessions` | lädt den UI-Sitzungszustand |
| `PUT` | `/api/v1/sessions` | speichert und merged UI-Sitzungen |
| `WS` | `/ws/chat` | Chat-Verbindung zwischen Browser und BFF |

Die detaillierten Event-Formate stehen in der
[Schnittstellenreferenz](interface_contract.md).

## 🛠️ Fehlerbehebung

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| Browser zeigt keine Verbindung | BFF läuft nicht oder Vite-Proxy zeigt falsch | BFF-URL und Vite-Proxy prüfen |
| Diagnose meldet `unreachable` | Plugin-Port nicht erreichbar | `CUSTOM_CHAT_TARGET`, Firewall und Plugin-Start prüfen |
| Diagnose meldet `unauthorized` | Token stimmt nicht | `CUSTOM_CHAT_BEARER_TOKEN` in BFF und Plugin angleichen |
| Upload funktioniert, aber Hermes kann Datei nicht lesen | Medien-URL ist aus Hermes-Sicht falsch | `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` setzen |
| Medien laden im Browser nicht | öffentliche Medien-URL ist falsch | `WEB_PUBLIC_MEDIA_BASE_URL` prüfen |
| Sitzungen verschwinden | Session-Store nicht beschreibbar oder leerer Chat | `WEB_SESSION_STORE_PATH` und Dateirechte prüfen |
| CORS-Fehler im Browser | Origin nicht erlaubt | `WEB_CORS_ORIGINS` oder im Dev-Betrieb `WEB_CORS_REFLECT_ORIGIN=true` setzen |

## ✅ Betriebs-Checkliste

- [ ] `custom_chat` Plugin läuft und ist vom BFF erreichbar.
- [ ] BFF und Plugin verwenden denselben Bearer Token.
- [ ] Bei LAN-/Produktionsbetrieb ist `WEB_AUTH_TOKEN` gesetzt oder ein Reverse Proxy schützt alle BFF-Routen.
- [ ] Medien-URLs sind aus Browser- und Hermes-Sicht erreichbar.
- [ ] Upload-Limits im BFF und im Plugin passen zusammen.
- [ ] `WEB_SESSION_STORE_PATH` liegt auf persistentem Speicher.
- [ ] In Produktion laufen UI/API/WebSocket über TLS.
- [ ] Reverse Proxy oder Firewall begrenzt den Zugriff auf gewünschte Clients.

## 📸 Empfohlene Screenshots

- Seitenleiste mit mehreren Chats und aktivem Chat
- Diagnoseansicht mit erfolgreichem Upstream-Status
- Medien-Upload mit Bild- oder Datei-Vorschau
- Button-Freigabe für eine Hermes-Aktion
