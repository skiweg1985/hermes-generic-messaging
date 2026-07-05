# 🔗 Schnittstellenreferenz

Diese Referenz beschreibt die Schnittstellen zwischen Web-App, `custom_chat`
Plugin und Hermes Gateway. Sie richtet sich an Entwickler, die einen eigenen
Client bauen, das BFF erweitern oder Integrationsprobleme analysieren möchten.

Für Installation und Betrieb lies zuerst:

- [custom_chat Plugin betreiben](custom_chat.md)
- [Web-App betreiben](web-app.md)

## 🧭 Architektur in einem Bild

```text
Frontend oder eigener Client
  |  WebSocket /ws/chat
  |  REST /api/v1/*
  v
FastAPI-BFF
  |  WebSocket ws://host:8765
  v
custom_chat Plugin
  |
  v
Hermes Gateway
```

Das BFF ist optional. Ein eigener Client kann auch direkt mit dem Plugin sprechen,
muss dann aber Authentifizierung, Medien-URLs und Event-Erzeugung selbst korrekt
umsetzen.

## 🧱 Grundprinzipien

- Alle Chat-Nachrichten verwenden **Event Schema v1**.
- `chat_id` trennt Unterhaltungen. Verwende für neue Chats stabile IDs wie
  `workspace:<uuid>`.
- `event_id` muss pro Event eindeutig sein. Das Plugin dedupliziert wiederholte
  IDs innerhalb eines kurzen Zeitfensters.
- Medien müssen über HTTP(S)-URLs erreichbar sein. Lokale Dateipfade sind für
  Browser und entfernte Hermes-Hosts nicht nutzbar.
- Der WebSocket zum Plugin kann mit einem Bearer Token geschützt werden.

## 🌐 REST-Endpunkte des BFF

Basis-URL: `http(s)://<bff-host>`

| Methode | Pfad | Zweck |
|---------|------|-------|
| `GET` | `/api/v1/health` | einfacher Liveness-Check |
| `GET` | `/api/v1/diagnostics` | prüft BFF und Verbindung zum Plugin |
| `POST` | `/api/v1/media/upload` | speichert einen Medien-Upload |
| `GET` | `/api/v1/media/{file_id}` | liefert einen gespeicherten Upload aus |
| `GET` | `/api/v1/sessions` | lädt UI-Sitzungen |
| `PUT` | `/api/v1/sessions` | speichert und merged UI-Sitzungen |

### Diagnose

```json
{
  "bff": "ok",
  "upstream": {
    "target": "127.0.0.1:8765",
    "status": "ok"
  }
}
```

`upstream.status` ist `ok`, `unreachable`, `unauthorized`, `closed` oder `error`.
Das Ziel enthält nur `host:port`; Tokens werden nie zurückgegeben.

### Medien-Upload

Uploads verwenden Multipart-Form mit dem Feld `file`.

```http
POST /api/v1/media/upload
Content-Type: multipart/form-data
```

Antwort:

```json
{
  "file_id": "4dfc...",
  "url": "http://127.0.0.1:8000/api/v1/media/4dfc...",
  "mime_type": "image/jpeg",
  "size_bytes": 204800
}
```

Fehler werden im FastAPI-Format zurückgegeben:

```json
{
  "detail": {
    "code": "UNSUPPORTED_MEDIA_TYPE",
    "message": "mime type not allowed: application/octet-stream"
  }
}
```

## 💬 WebSocket-Verbindung

### Browser oder Client zum BFF

Die Web-App verbindet sich mit:

```text
ws(s)://<bff-host>/ws/chat
```

Das BFF akzeptiert die Verbindung und öffnet danach die Upstream-Verbindung zum
Plugin. Direkt nach dem Upstream-Connect sendet das BFF automatisch
`client.register`. Der Browser muss dieses Event nicht selbst senden.

### BFF oder eigener Client zum Plugin

Direkte Plugin-Verbindungen verwenden:

```text
ws://<plugin-host>:8765
```

Wenn `CUSTOM_CHAT_BEARER_TOKEN` gesetzt ist, muss der Client senden:

```http
Authorization: Bearer <token>
```

Bei ungültigem Token schließt das Plugin die Verbindung mit WebSocket-Code `4401`.

## 📦 Event-Umschlag

Alle Events haben denselben Umschlag:

```json
{
  "schema_version": "v1",
  "event_id": "00000000-0000-4000-8000-000000000001",
  "timestamp": "2026-05-23T10:49:09Z",
  "platform": "custom_chat",
  "chat_id": "workspace:conversation",
  "user_id": "user-demo",
  "thread_id": null,
  "session_id": null,
  "type": "message.create",
  "payload": {}
}
```

| Feld | Bedeutung |
|------|-----------|
| `schema_version` | immer `v1` |
| `event_id` | eindeutige ID für Deduplizierung und Nachvollziehbarkeit |
| `timestamp` | UTC-Zeitpunkt als ISO-8601-String |
| `platform` | immer `custom_chat` |
| `chat_id` | Unterhaltung, in der das Event gilt |
| `user_id` | Benutzer oder technischer Absender |
| `thread_id` | optionaler Thread-Kontext |
| `session_id` | optionale Sitzungsmetadaten |
| `type` | Event-Typ |
| `payload` | typabhängige Nutzdaten |

Wenn Events über das BFF laufen, ergänzt das BFF fehlende Pflichtfelder. Direkte
Clients sollten vollständige Events senden.

## ⬇️ Inbound-Events zum Plugin

### `message.create`

Normale Benutzer-Nachricht. Text darf leer sein, wenn Anhänge vorhanden sind.

```json
{
  "message_id": "msg-1",
  "text": "Bitte fasse diese Datei zusammen.",
  "attachments": [
    {
      "attachment_id": "att-1",
      "filename": "report.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 120000,
      "url": "https://example.local/report.pdf"
    }
  ]
}
```

### `command.create`

Expliziter Slash Command. Die Web-App sendet Slash Commands normalerweise so:

```json
{
  "message_id": "msg-2",
  "command": "/model"
}
```

Textnachrichten, die mit `/` beginnen, werden ebenfalls als Befehle behandelt.

### `audio.uploaded`

Sprachaufnahme oder Audio-Datei:

```json
{
  "message_id": "voice-1",
  "mime_type": "audio/webm",
  "size_bytes": 4096,
  "url": "https://example.local/voice.webm"
}
```

### `file.uploaded`

Allgemeiner Datei-Upload:

```json
{
  "message_id": "file-1",
  "filename": "notes.txt",
  "mime_type": "text/plain",
  "size_bytes": 1024,
  "url": "https://example.local/notes.txt"
}
```

### `message.cancel`

Bricht eine laufende Antwort ab:

```json
{
  "target_message_id": "turn-1"
}
```

Nutze nach Möglichkeit die `turn_message_id`, nicht eine Segment-ID.

### `button.click`

Antwort auf eine interaktive Karte:

```json
{
  "message_id": "confirm-1",
  "confirm_id": "confirm-1",
  "button_id": "once",
  "choice": "once",
  "extra": {}
}
```

### `client.register`

Das BFF sendet dieses Event einmal pro Upstream-Verbindung:

```json
{
  "public_media_base_url": "http://127.0.0.1:8000",
  "client_kind": "web_bff"
}
```

Dadurch weiß das Plugin, wohin es lokale Hermes-Dateien hochladen kann.

## ⬆️ Outbound-Events vom Plugin

### Streaming-Antwort

Eine normale Streaming-Antwort besteht aus Start, Textstücken und Abschluss:

```json
{ "message_id": "line-1", "turn_message_id": "turn-1" }
```

```json
{ "message_id": "line-1", "sequence": 1, "delta": "Hallo" }
```

```json
{
  "message_id": "line-1",
  "turn_message_id": "turn-1",
  "final_text": "Hallo!",
  "interrupted": false
}
```

Die zugehörigen Event-Typen heißen `assistant_start`, `assistant_delta` und
`assistant_done`.

### `assistant_segment`

Markiert eine neue Antwort-Zeile innerhalb desselben Turns, etwa nach einem
Tool-Aufruf:

```json
{
  "message_id": "turn-1",
  "segment_message_id": "turn-1-s1",
  "label": "read_file"
}
```

### `assistant_notice`

Hinweis-, Tool- oder Reasoning-Karte:

```json
{
  "message_id": "notice-1",
  "kind": "tool",
  "text": "Running read_file",
  "tool_name": "read_file",
  "status": "running"
}
```

`kind` ist `info`, `tool`, `reasoning`, `warning` oder `error`.

### `assistant_buttons`

Interaktive Karte für Freigaben oder Auswahlmenüs:

```json
{
  "message_id": "confirm-1",
  "confirm_id": "confirm-1",
  "title": "Reload MCP",
  "body": "MCP neu laden?",
  "kind": "slash_confirm",
  "buttons": [
    {"id": "once", "label": "Approve Once", "style": "primary"},
    {"id": "cancel", "label": "Cancel", "style": "danger"}
  ]
}
```

`kind` ist `slash_confirm`, `slash_pick` oder `model_picker`.

### Medien-Events

Das Plugin kann Medien als eigene Events senden:

| Event | Zweck |
|-------|-------|
| `assistant_image` | Bild mit optionaler Bildunterschrift |
| `assistant_file` | Datei mit Name, MIME-Typ und URL |
| `assistant_audio` | Audio- oder TTS-Antwort |

Beispiel:

```json
{
  "message_id": "image-1",
  "url": "https://example.local/image.png",
  "mime_type": "image/png",
  "caption": "Diagramm"
}
```

### `typing`

Zeigt an, dass Hermes gerade arbeitet:

```json
{ "state": "start" }
```

`state` ist `start` oder `stop`.

### `session_meta`

Überträgt Metadaten wie automatisch vergebene Chat-Titel:

```json
{
  "title": "Release-Plan Q3",
  "extra": {}
}
```

Das Routing erfolgt über den Event-Umschlag, insbesondere `chat_id`.

### `assistant_error`

Fehler werden als normales Event gesendet:

```json
{
  "message_id": "err-1",
  "code": "BAD_REQUEST",
  "message": "text or attachments required"
}
```

Mögliche Codes:

| Code | Bedeutung |
|------|-----------|
| `BAD_REQUEST` | Event oder Payload ist ungültig |
| `UNAUTHORIZED` | Authentifizierung fehlt oder ist falsch |
| `FORBIDDEN` | Benutzer ist nicht erlaubt |
| `RATE_LIMITED` | Rate Limit erreicht |
| `UNSUPPORTED_MEDIA_TYPE` | MIME-Typ ist nicht erlaubt |
| `PAYLOAD_TOO_LARGE` | Upload ist zu groß |
| `STREAM_TIMEOUT` | Antwort oder TTS hat zu lange gedauert |
| `INTERNAL_ERROR` | unerwarteter Fehler |

## 🧩 Konfigurationen, die das Protokoll beeinflussen

### Plugin

| Variable | Wirkung |
|----------|---------|
| `CUSTOM_CHAT_BEARER_TOKEN` | schützt den Plugin-WebSocket |
| `CUSTOM_CHAT_ALLOWED_USERS` | beschränkt erlaubte Benutzer |
| `CUSTOM_CHAT_ALLOW_ALL_USERS` | deaktiviert Benutzerbeschränkung bewusst |
| `CUSTOM_CHAT_MAX_UPLOAD_BYTES` | begrenzt eingehende Anhänge |
| `CUSTOM_CHAT_ALLOWED_UPLOAD_MIME_TYPES` | begrenzt MIME-Typen |
| `CUSTOM_CHAT_DEDUPE_TTL_SECONDS` | Deduplizierungsfenster für `event_id` |
| `CUSTOM_CHAT_RATE_LIMIT_PER_MINUTE` | Nachrichtenlimit pro Chat/Benutzer |
| `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` | Fallback für ausgehende Medien |

### BFF

| Variable | Wirkung |
|----------|---------|
| `CUSTOM_CHAT_TARGET` | Plugin-Ziel |
| `CUSTOM_CHAT_BEARER_TOKEN` | Token für das Plugin |
| `WEB_PUBLIC_MEDIA_BASE_URL` | Medien-URL für Browser |
| `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` | Medien-URL, die dem Plugin gemeldet wird |
| `WEB_SESSION_STORE_PATH` | Speicherort für UI-Sitzungen |
| `WEB_CORS_ORIGINS` | erlaubte Browser-Origins |

## ✅ Client-Checkliste

Wenn du einen eigenen Client baust:

- [ ] Sende pro Event eine neue `event_id`.
- [ ] Verwende stabile `chat_id`s für getrennte Unterhaltungen.
- [ ] Sende den Bearer Token beim WebSocket-Upgrade.
- [ ] Lade Medien zuerst hoch und sende dann HTTP(S)-URLs.
- [ ] Behandle `assistant_delta.sequence` monoton und ignoriere alte Deltas.
- [ ] Brich laufende Antworten mit `turn_message_id` ab.
- [ ] Reagiere auf `assistant_buttons`, wenn du Freigaben unterstützen willst.
- [ ] Zeige `assistant_error` sichtbar an, statt es nur zu loggen.

## 📸 Empfohlene Screenshots

- Entwicklerkonsole mit WebSocket-Frames für `assistant_start` und `assistant_done`
- Diagnoseantwort von `/api/v1/diagnostics`
- Beispiel einer Button-Freigabe im Browser
