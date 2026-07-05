# Interface Contract — custom_chat Stack

Dieses Dokument beschreibt verbindlich alle Schnittstellen und Datenmodelle zwischen den drei
Schichten des custom_chat-Stacks.

```
Frontend (React/Vite)
    ↕  WebSocket  /ws/chat
    ↕  REST       /api/v1/…
BFF (FastAPI)
    ↕  WebSocket  ws://host:8765
Plugin (custom_chat adapter)
    ↕  Python API  BasePlatformAdapter
Hermes Gateway
```

---

## 1  Frontend ↔ BFF

### 1.1  WebSocket `/ws/chat`

Der BFF öffnet eine WebSocket-Verbindung. Alle Nachrichten sind JSON-codiert. Das Frontend sendet
**Inbound-Events** und empfängt **Outbound-Events** (→ Abschnitt 2).

#### Verbindungsaufbau

Das Frontend stellt eine WebSocket-Verbindung zu `ws(s)://<bff-host>/ws/chat` her. Die
Verbindung wird sofort akzeptiert. Der BFF schickt daraufhin **selbstständig** das erste Event
an den Upstream-Plugin-WebSocket:

```json
{
  "schema_version": "v1",
  "event_id": "<uuid4>",
  "timestamp": "<ISO-UTC>",
  "platform": "custom_chat",
  "chat_id": "<WEB_CHAT_ID>",
  "user_id": "<WEB_USER_ID>",
  "type": "client.register",
  "payload": {
    "public_media_base_url": "<WEB_PUBLIC_MEDIA_BASE_URL>",
    "client_kind": "web_bff"
  }
}
```

Das Frontend selbst schickt dieses Event **nicht** — es wird vom BFF erzeugt.

#### Relay-Verhalten

Der BFF ergänzt alle Inbound-Events vom Frontend um fehlende Pflichtfelder:

| Feld           | Verhalten                                              |
|----------------|--------------------------------------------------------|
| `schema_version` | `"v1"` (falls fehlend)                               |
| `platform`     | `"custom_chat"` (falls fehlend)                        |
| `chat_id`      | Wert aus `WEB_CHAT_ID` (falls fehlend)                 |
| `user_id`      | Wert aus `WEB_USER_ID` (falls fehlend)                 |
| `timestamp`    | aktueller UTC-Zeitstempel ISO 8601 (falls fehlend)     |
| `event_id`     | neue UUID4 (falls fehlend)                             |

Events mit `type == "client.register"` werden unverändert weitergeleitet (kein Enrichment).

Outbound-Events vom Plugin werden **unverändert** an das Frontend weitergeleitet.

#### Fehlerbehandlung

| Situation                          | BFF-Verhalten                                            |
|------------------------------------|----------------------------------------------------------|
| Upstream-Plugin nicht erreichbar   | WS-Close `1011 upstream unavailable`                     |
| Upstream trennt die Verbindung     | WS-Close `1011 upstream closed`                          |
| Frontend trennt                    | stille Aufräumung                                        |
| Ungültiges JSON vom Frontend       | Event wird verworfen (kein Close)                        |

---

### 1.2  REST-API

Basis-URL: `http(s)://<bff-host>`

#### `GET /api/v1/health`

Liveness-Check.

**Response 200**
```json
{ "status": "ok" }
```

---

#### `POST /api/v1/media/upload`

Datei hochladen. Multipart-Form, Feld `file`.

**Request**
```
POST /api/v1/media/upload
Content-Type: multipart/form-data

file: <binary>
```

**Response 200**
```json
{
  "file_id": "<uuid>",
  "url":      "http://<public_media_base_url>/api/v1/media/<uuid>",
  "mime_type": "image/jpeg",
  "size_bytes": 204800
}
```

**Fehlercodes (HTTP)**

| HTTP-Status | `code`                   | Bedingung                            |
|-------------|--------------------------|--------------------------------------|
| 415         | `UNSUPPORTED_MEDIA_TYPE` | MIME-Typ nicht in Allowlist          |
| 413         | `PAYLOAD_TOO_LARGE`      | Datei > `WEB_MAX_UPLOAD_BYTES`       |

Fehler-Body (FastAPI-Standard mit `detail`-Wrapper):

```json
{
  "detail": {
    "code": "UNSUPPORTED_MEDIA_TYPE",
    "message": "mime type not allowed: …"
  }
}
```

Clients lesen `detail.code` und `detail.message` (z. B. `mediaClient.ts`).

---

#### `GET /api/v1/media/{file_id}`

Hochgeladene Datei abrufen.

**Response 200** — Binärdaten mit korrekt gesetztem `Content-Type`.

**Response 404** — Datei unbekannt.

---

#### `GET /api/v1/diagnostics`

BFF-Liveness plus kurzer BFF→Plugin-WebSocket-Probe.

**Response 200**
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
`target` enthält nur `host:port`, keine Credentials.

---

#### `GET /api/v1/sessions`

Lädt den leichten Browser-Session-State aus `WEB_SESSION_STORE_PATH`.

**Response 200**
```json
{
  "version": 1,
  "activeChatId": "workspace:abc",
  "sessions": []
}
```

---

#### `PUT /api/v1/sessions`

Speichert und merged Browser-Session-State. Der Store begrenzt auf 80 Sessions
und 200 Transcript-Zeilen pro Session; leere Platzhalter-Sessions werden nicht
persistiert.

---

### 1.3  BFF-Konfiguration (Env-Variablen)

| Variable                       | Standard                   | Beschreibung                                  |
|-------------------------------|----------------------------|-----------------------------------------------|
| `CUSTOM_CHAT_TARGET`           | –                          | `host:port` des Plugin-WS (empfohlen)         |
| `CUSTOM_CHAT_WS_URL`           | `ws://127.0.0.1:8765`      | Fallback (legacy), wenn TARGET nicht gesetzt  |
| `CUSTOM_CHAT_BEARER_TOKEN`     | –                          | Bearer-Token für Plugin-WS-Auth               |
| `WEB_CHAT_ID`                  | `workspace:demo`           | chat_id für outgehendes Enrichment            |
| `WEB_USER_ID`                  | `user-demo`                | user_id für outgehendes Enrichment            |
| `WEB_PUBLIC_MEDIA_BASE_URL`    | `http://127.0.0.1:8000`    | Öffentliche Basis-URL für Media-Links         |
| `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` | `WEB_PUBLIC_MEDIA_BASE_URL` | Media-Basis-URL, die per `client.register` an Hermes gemeldet wird |
| `CUSTOM_CHAT_INTERNAL_MEDIA_BASE_URL` | `WEB_PUBLIC_MEDIA_BASE_URL` | Legacy-Alias für `WEB_CUSTOM_CHAT_MEDIA_BASE_URL` |
| `WEB_PUBLIC_HOST`              | –                          | Alternativ zu PUBLIC_MEDIA_BASE_URL           |
| `WEB_PUBLIC_PORT`              | –                          | Alternativ zu PUBLIC_MEDIA_BASE_URL           |
| `WEB_MEDIA_UPLOAD_DIR`         | `./data/uploads`           | Speicherort für Uploads                       |
| `WEB_SESSION_STORE_PATH`       | `./data/chat_sessions.json` | JSON-Speicher für `/api/v1/sessions`         |
| `WEB_MAX_UPLOAD_BYTES`         | `20971520` (20 MB)         | Maximale Upload-Größe                         |
| `WEB_ALLOWED_UPLOAD_MIME_TYPES`| (schema default list)      | Komma-separierte MIME-Allowlist               |
| `WEB_CORS_ORIGINS`             | `http://127.0.0.1:5173,…`  | Erlaubte CORS-Origins                         |
| `WEB_CORS_REFLECT_ORIGIN`      | `false`                    | Origin-Wildcard (`1`/`true`/`yes`)            |

---

## 2  BFF ↔ Plugin (Event Schema v1)

Kommunikation über WebSocket (`ws://host:8765`). Alle Nachrichten sind JSON.

### 2.1  Event-Umschlag (`EventEnvelope`)

Jedes Event — Inbound wie Outbound — teilt denselben Umschlag:

```typescript
interface EventEnvelope {
  schema_version: "v1";
  event_id:       string;          // UUID4
  timestamp:      string;          // ISO 8601 UTC
  platform:       "custom_chat";
  chat_id:        string;          // z. B. "workspace:demo"
  user_id:        string;          // z. B. "user-demo"
  thread_id?:     string;
  session_id?:    string;
  type:           InboundType | OutboundType;
  payload:        Record<string, unknown>;
}
```

### 2.2  Inbound-Events (BFF → Plugin)

#### `client.register`

Wird einmalig nach Verbindungsaufbau vom BFF geschickt. Kein chat_id/user_id-Enrichment.

```typescript
interface ClientRegisterPayload {
  public_media_base_url: string;   // http(s)-URL ohne trailing slash
  client_kind: "web_bff";
}
```

---

#### `message.create`

Neue Textnachricht, optional mit Anhängen.

```typescript
interface MessageCreatePayload {
  message_id:      string;
  text:            string;               // darf leer sein, wenn attachments gesetzt
  attachments?:    MessageAttachment[];
  idempotency_key?: string;
}

interface MessageAttachment {
  attachment_id: string;
  mime_type:     string;
  size_bytes:    number;
  url?:          string;       // public HTTP-URL
  file_ref?:     string;       // lokale Referenz (Hermes-Seite)
  filename?:     string;
  // Invariante: url ODER file_ref muss gesetzt sein
}
```

---

#### `command.create`

Slash-Kommando vom Nutzer.

```typescript
interface CommandCreatePayload {
  message_id: string;
  command:    string;   // beginnt mit "/"
}
```

---

#### `audio.uploaded`

Sprachaufnahme. Wird vom Plugin an Hermes Whisper-STT weitergeleitet.

```typescript
interface AudioUploadedPayload {
  message_id: string;
  mime_type:  string;
  size_bytes: number;
  url?:       string;
  file_ref?:  string;
}
```

---

#### `file.uploaded`

Allgemeiner Dateianhang (Bild, Dokument, …).

```typescript
interface FileUploadedPayload {
  message_id: string;
  filename:   string;
  mime_type:  string;
  size_bytes: number;
  url?:       string;
  file_ref?:  string;
}
```

---

#### `message.cancel`

Unterbricht den laufenden Stream für `target_message_id`.

```typescript
interface MessageCancelPayload {
  target_message_id: string;
}
```

---

#### `button.click`

Nutzer hat einen interaktiven Button gedrückt (`slash_confirm`, `model_picker`).

```typescript
interface ButtonClickPayload {
  message_id:  string;
  confirm_id?: string;       // gesetzt bei slash_confirm
  button_id:   string;
  choice?:     string;
  extra?:      Record<string, unknown>;
}
```

**`slash_pick`:** Bei `assistant_buttons` mit `kind: "slash_pick"` sendet das Web-Frontend
beim Klick **kein** `button.click`, sondern sofort `command.create` mit dem vollen Slash-Befehl
aus dem Button-Label (z. B. `/model gpt-4`). Siehe auch [`custom_chat.md`](custom_chat.md).

---

### 2.3  Outbound-Events (Plugin → BFF)

#### `typing`

Tipp-Indikator. `send_typing` / `stop_typing` im Adapter setzen `state`. Das Frontend zeigt
die Bubble bis `typingClosed`, ein explizites `stop` oder ein abschließendes Assistant-Event.

```typescript
{
  type: "typing";
  payload: {
    state: "start" | "stop";
  };
}
```

---

#### `assistant_start`

Beginn eines neuen Streaming-Blocks.

```typescript
{
  type: "assistant_start";
  payload: {
    message_id:      string;   // ID der Transkript-Zeile
    turn_message_id: string;   // ID des übergeordneten Turns
  };
}
```

---

#### `assistant_delta`

Inkrementeller Text-Chunk während des Streams.

```typescript
{
  type: "assistant_delta";
  payload: {
    message_id: string;
    sequence:   number;   // monoton steigend pro Turn
    delta:      string;   // inkrementelles Textstück
  };
}
```

---

#### `assistant_done`

Abschluss des Turns. Enthält vollständigen Endtext.

```typescript
{
  type: "assistant_done";
  payload: {
    message_id:      string;
    final_text:      string;
    turn_message_id: string;
    reasoning_text?: string;   // Thinking-Block (Extended Thinking)
    segments?:       number;   // Anzahl Segmente, wenn > 1
    interrupted?:    boolean;  // true bei message.cancel / /stop
  };
}
```

---

#### `assistant_segment`

Segment-Grenze innerhalb eines Turns (z. B. nach einem Tool-Call).

```typescript
{
  type: "assistant_segment";
  payload: {
    message_id:         string;   // Turn-ID
    segment_message_id: string;   // ID des neuen Segments
    label?:             string;   // z. B. "🔧 read_file"
  };
}
```

---

#### `assistant_error`

Fehler-Event (Validierung, Rate-Limit, interne Fehler).

```typescript
{
  type: "assistant_error";
  payload: {
    message_id: string;
    code:       ErrorCode;
    message:    string;
  };
}

type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "STREAM_TIMEOUT"
  | "INTERNAL_ERROR";
```

---

#### `assistant_buttons`

Interaktives Button-Set. Das `kind`-Feld im Payload bestimmt die UI-Variante.

```typescript
interface ButtonSpec {
  id:    string;
  label: string;
  style: "primary" | "secondary" | "danger";
}

// kind: "slash_confirm"
interface SlashConfirmPayload {
  message_id: string;
  confirm_id: string;
  title:      string;
  body:       string;
  kind:       "slash_confirm";
  buttons:    ButtonSpec[];
}

// kind: "model_picker"
interface ModelPickerPayload {
  message_id: string;
  pick_id:    string;
  title:      string;
  body:       string;
  kind:       "model_picker";
  buttons:    ButtonSpec[];
  page_info?: string;
}

// kind: "slash_pick"
interface SlashPickPayload {
  message_id: string;
  pick_id:    string;
  command:    string;   // beginnt mit "/"
  title:      string;
  body:       string;
  kind:       "slash_pick";
  buttons:    ButtonSpec[];
}
```

---

#### `assistant_notice`

System-, Tool- oder Reasoning-Bubble.

```typescript
{
  type: "assistant_notice";
  payload: {
    message_id:  string;
    text:        string;
    kind:        "info" | "tool" | "reasoning" | "warning" | "error";
    tool_name?:  string;
    status?:     string;   // z. B. "running" | "success" | "error"
    args?:       unknown;
    result?:     unknown;
    duration_ms?: number;
    error?:      string;
  };
}
```

---

#### `assistant_image`

Bild-Attachment vom Agenten.

```typescript
{
  type: "assistant_image";
  payload: {
    message_id: string;
    url:        string;
    mime_type:  string;   // aus Metadata, URL-Guessing oder Fallback image/png
    caption?:   string;
  };
}
```

---

#### `assistant_file`

Datei-Attachment vom Agenten.

```typescript
{
  type: "assistant_file";
  payload: {
    message_id: string;
    filename:   string;
    url:        string;
    mime_type:  string;
    size_bytes?: number;
  };
}
```

---

#### `assistant_audio`

Sprach-Antwort (TTS).

```typescript
{
  type: "assistant_audio";
  payload: {
    message_id: string;
    mime_type:  string;
    url:        string;
  };
}
```

---

#### `session_meta`

Hermes-Session-Metadaten (Titel-Update). Wird an **alle** verbundenen Clients gebroadcasted.

```typescript
{
  type: "session_meta";
  payload: {
    title?: string;
    extra?: Record<string, unknown>;
  };
  // Routing über Envelope: chat_id + session_id
}
```

---

### 2.4  Streaming-Sequenz (Normal-Fall)

```
BFF → Plugin:   message.create { message_id: "m1", text: "…" }
Plugin → BFF:   typing { state: "start" }
Plugin → BFF:   assistant_start { message_id: "r1", turn_message_id: "r1" }
Plugin → BFF:   assistant_delta { message_id: "r1", sequence: 1, delta: "Hallo" }
Plugin → BFF:   assistant_delta { message_id: "r1", sequence: 2, delta: " Welt" }
Plugin → BFF:   assistant_done  { message_id: "r1", final_text: "Hallo Welt", turn_message_id: "r1" }
```

#### Mit Tool-Call (Segment)

```
assistant_start { message_id: "r1", turn_message_id: "r1" }
assistant_delta { message_id: "r1", … }
assistant_notice { message_id: "n1", kind: "tool", tool_name: "read_file", status: "running" }
assistant_segment { message_id: "r1", segment_message_id: "r1-s1", label: "🔧 read_file" }
assistant_start { message_id: "r1-s1", turn_message_id: "r1" }
assistant_delta { message_id: "r1-s1", … }
assistant_done  { message_id: "r1-s1", final_text: "…", turn_message_id: "r1", segments: 2 }
```

#### Abbruch (message.cancel)

```
BFF → Plugin:   message.cancel { target_message_id: "r1" }
Plugin → BFF:   assistant_done { message_id: "r1", final_text: "", interrupted: true }
                 oder kein Event (je nach Timing)
```

---

### 2.5  Auth (Plugin-WebSocket)

Der BFF sendet bei gesetztem `CUSTOM_CHAT_BEARER_TOKEN`:

```
Authorization: Bearer <token>
```

Das Plugin lehnt Verbindungen ohne gültiges Token mit WebSocket-Close **4401**
(`reason: unauthorized`) ab — kein HTTP-Status auf der WS-Ebene.

---

### 2.6  Duplikat- und Rate-Schutz (Plugin-Seite)

| Mechanismus              | Default-Konfiguration   |
|--------------------------|-------------------------|
| Deduplizierung per event_id | TTL: 60 s (`CUSTOM_CHAT_DEDUPE_TTL_SECONDS`) |
| Rate-Limit               | 60 Nachrichten/Minute (`CUSTOM_CHAT_RATE_LIMIT_PER_MINUTE`) pro `chat_id:user_id` |

---

## 3  Plugin ↔ Hermes Core

Das Plugin implementiert die `BasePlatformAdapter`-Abstraktion aus
`gateway.platforms.base` und registriert sich über `ctx.register_platform()`.

Referenz: [Hermes Platform Adapter Guide](https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters)

### 3.1  Pflichtmethoden (`BasePlatformAdapter`)

```python
class BasePlatformAdapter:
    async def connect(self) -> bool: ...
    async def disconnect(self) -> None: ...
    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult: ...
```

---

### 3.2  Optionale Methoden (Hermes ruft diese auf, falls vorhanden)

| Methode                          | Zweck                                                    |
|----------------------------------|----------------------------------------------------------|
| `send_typing(chat_id, metadata)` | Tipp-Indikator starten                                   |
| `stop_typing(chat_id, metadata)` | Tipp-Indikator stoppen                                   |
| `send_draft(chat_id, draft_id, content, metadata)` | Inkrementeller Streaming-Chunk        |
| `supports_draft_streaming(chat_type, metadata) → bool` | Ob Draft-Streaming aktiviert ist |
| `edit_message(chat_id, message_id, new_content, metadata)` | In-Place-Update (Tool-Progress) |
| `send_image(chat_id, url, metadata)` | Bild senden                                        |
| `send_file(chat_id, url, filename, metadata)` | Datei senden                            |
| `get_chat_info(chat_id) → dict`  | Chat-Metadaten zurückgeben                               |
| `interrupt_session_activity(session_key, chat_id)` | `/stop`-Signal verarbeiten          |
| `send_private_notice(chat_id, text, metadata)` | Interne Hinweis-Bubble               |
| `send_slash_confirm(chat_id, confirm_id, title, body, buttons, metadata)` | Confirm-Dialog |
| `send_slash_options(chat_id, pick_id, command, title, body, buttons, metadata)` | Options-Picker |
| `send_model_picker(chat_id, providers, current_model, current_provider, session_key, on_model_selected, metadata)` | Modell-Auswahl |
| `send_session_meta(chat_id, title, session_id, thread_id)` | Session-Titel an Frontend  |

---

### 3.3  `SendResult`

```python
@dataclass
class SendResult:
    success:                  bool
    message_id:               Optional[str] = None
    error:                    Optional[str] = None
    raw_response:             Any = None
    retryable:                bool = False
    continuation_message_ids: tuple = ()
```

---

### 3.4  `MessageEvent` (Inbound → Hermes)

Das Plugin baut aus dem Inbound-Envelope ein `MessageEvent` und ruft
`self.handle_message(event)` auf:

```python
class MessageEvent:
    text:          str
    message_type:  MessageType   # TEXT | IMAGE | AUDIO | VIDEO | FILE | STICKER
    source:        SessionSource
    message_id:    Optional[str]
    raw_message:   Optional[str | dict]  # Envelope oder Attachment-Metadaten (dict bevorzugt)
    media_urls:    list[str]       # HTTP-URLs von Anhängen
    media_types:   list[str]       # MIME-Typen zu media_urls
```

Bild-Anhänge: `MessageType.PHOTO` wenn vorhanden, sonst `MessageType.IMAGE` (Hermes-Konvention).

#### `SessionSource`

```python
@dataclass
class SessionSource:
    platform:   Platform   # Platform("custom_chat")
    chat_id:    str
    chat_name:  Optional[str]
    chat_type:  str        # "dm"
    user_id:    Optional[str]
    user_name:  Optional[str]
    thread_id:  Optional[str]
    message_id: Optional[str]
```

---

### 3.5  `register(ctx)` — Plugin-Einstiegspunkt

```python
def register(ctx) -> None:
    ctx.register_platform(
        name="custom_chat",
        label="Custom Chat",
        adapter_factory=lambda cfg: CustomChatAdapter(cfg),
        check_fn=check_requirements,  # prüft CUSTOM_CHAT_BEARER_TOKEN (gesetzt)
        validate_config=validate_config,
        env_enablement_fn=_env_enablement,
        apply_yaml_config_fn=_apply_yaml_config,
        cron_deliver_env_var="CUSTOM_CHAT_HOME_CHANNEL",
        allowed_users_env="CUSTOM_CHAT_ALLOWED_USERS",
        allow_all_env="CUSTOM_CHAT_ALLOW_ALL_USERS",
        platform_hint="…",
        emoji="💬",
    )
```

`check_requirements()` verlangt ein gesetztes `CUSTOM_CHAT_BEARER_TOKEN`. WS-Host/Port werden
über `CUSTOM_CHAT_WS_HOST` / `CUSTOM_CHAT_WS_PORT` (oder YAML) konfiguriert, nicht als
`required_env` an `register_platform`.

---

### 3.6  Plugin-Konfiguration (Env-Variablen)

| Variable                          | Standard          | Beschreibung                                    |
|-----------------------------------|-------------------|-------------------------------------------------|
| `CUSTOM_CHAT_WS_HOST`             | `0.0.0.0`         | Bind-Adresse des Plugin-WS-Servers              |
| `CUSTOM_CHAT_WS_PORT`             | `8765`            | Port des Plugin-WS-Servers                      |
| `CUSTOM_CHAT_BEARER_TOKEN`        | –                 | Auth-Token (leer = kein Auth)                   |
| `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` | –               | Öffentliche Media-URL (Fallback, falls kein client.register) |
| `CUSTOM_CHAT_HOME_CHANNEL`        | –                 | Default-Chat für Cron-Delivery                  |
| `CUSTOM_CHAT_HOME_CHANNEL_NAME`   | `"Home"`          | Anzeige-Name des Home-Channels                  |
| `CUSTOM_CHAT_ALLOWED_USERS`       | –                 | Komma-separierte User-IDs (Allowlist)           |
| `CUSTOM_CHAT_ALLOW_ALL_USERS`     | –                 | `"true"` erlaubt alle User                      |
| `CUSTOM_CHAT_MAX_UPLOAD_BYTES`    | `20971520`        | Max. Größe für eingehende Anhänge               |
| `CUSTOM_CHAT_ALLOWED_UPLOAD_MIME_TYPES` | schema default list | Komma-separierte MIME-Allowlist für Anhänge |
| `CUSTOM_CHAT_DEDUPE_TTL_SECONDS`  | `60`              | Deduplizierungs-TTL in Sekunden                 |
| `CUSTOM_CHAT_RATE_LIMIT_PER_MINUTE` | `60`            | Max. Nachrichten/Minute pro User                |
| `CUSTOM_CHAT_TTS_RESPONSE_FORMAT` | –                 | Optionales Hermes-TTS-Format für `audio_response` |
| `CUSTOM_CHAT_TTS_TIMEOUT_SECONDS` | `120`             | Max. Wartezeit für Hermes-TTS                   |

---

## 4  Zugelassene MIME-Typen

### Audio (STT-Aufnahmen)

```
audio/ogg  audio/mpeg  audio/wav  audio/webm  audio/mp4
```

### Uploads (Dateien und Bilder)

```
image/png  image/jpeg  image/webp  image/gif
audio/ogg  audio/mpeg  audio/wav  audio/webm  audio/mp4
application/pdf  text/plain  text/csv
application/vnd.openxmlformats-officedocument.wordprocessingml.document
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

---

## 5  Invarianten & Regeln

1. **event_id** — UUID4, global eindeutig; das Plugin dedupliziert eingehende IDs (`CUSTOM_CHAT_DEDUPE_TTL_SECONDS`, Default 60 s).
2. **message_id** — Jedes Event-Paar `assistant_start` / `assistant_done` teilt dieselbe `message_id`.
3. **turn_message_id** — Konstant für einen gesamten Turn (auch über Segmente hinweg).
4. **sequence** — Monoton steigend pro `message_id`; Lücken sind zulässig, Rücksprünge nicht.
5. **session_meta** — Wird immer an alle verbundenen Clients gebroadcasted, nicht gefiltert.
6. **client.register** — Darf nur einmal pro WS-Verbindung gesendet werden; das Plugin überschreibt `_registered_media_base_url`.
7. **text oder attachments** — `message.create` verlangt mindestens ein nicht-leeres Feld.
8. **url oder file_ref** — `MessageAttachment`, `AudioUploadedPayload`, `FileUploadedPayload` verlangen mindestens eines der beiden Felder.
9. **Bearer-Token** — Fehlt `Authorization: Bearer <token>` bei gesetztem Token, schließt das Plugin die WS-Verbindung mit Code 4401.
10. **Sicherheit** — Keine Secrets in Events oder Logs; Media-URLs zeigen auf den öffentlichen BFF-Endpunkt, nicht auf interne Pfade.
