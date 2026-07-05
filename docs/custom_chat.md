# 🔌 custom_chat Plugin betreiben

Das `custom_chat` Plugin verbindet den Hermes Gateway mit beliebigen
WebSocket-Clients. Es ist die richtige Wahl, wenn du Hermes über eine eigene
Oberfläche, die mitgelieferte Web-App oder eine andere Anwendung nutzen möchtest.

Das Plugin öffnet einen WebSocket-Port, prüft eingehende Verbindungen und übersetzt
Nachrichten in das Format, das Hermes intern verarbeitet. Antworten, Streaming,
Freigaben, Medien und Statusmeldungen werden wieder als JSON-Events ausgegeben.

## 🧭 Wann brauchst du dieses Plugin?

Nutze `custom_chat`, wenn du:

- die Web-App aus diesem Repository betreiben möchtest
- einen eigenen Browser-, Desktop- oder Server-Client anbinden willst
- mehrere Chats über stabile `chat_id`s trennen möchtest
- Medien, Streaming und Slash Commands außerhalb der klassischen Messenger-Adapter
  verwenden willst

Wenn du nur das React-Frontend lokal ausprobieren möchtest, brauchst du trotzdem
einen laufenden Hermes Gateway mit aktiviertem Plugin. Die Web-App ist nicht der
Agent selbst, sondern verbindet sich mit diesem Plugin.

## ✅ Voraussetzungen

- Hermes Gateway ist installiert und lauffähig.
- Python 3.10 oder neuer ist verfügbar.
- Dieses Repository ist auf dem Hermes-Host vorhanden.
- Du kannst `~/.hermes/config.yaml` und `~/.hermes/.env` bearbeiten.

**Hinweis:** Installiere Python-Abhängigkeiten auf Servern bevorzugt in einer
virtuellen Umgebung. Das verhindert Konflikte mit Systempaketen.

## 🚀 Installation

Installiere die Python-Abhängigkeiten:

```bash
./scripts/bootstrap-venv.sh
source .venv/bin/activate
```

Wenn du nur das Plugin ohne Web-App-Abhängigkeiten installieren möchtest:

```bash
EXTRAS=dev ./scripts/bootstrap-venv.sh
source .venv/bin/activate
```

Verlinke anschließend das Plugin in das Hermes-Plugin-Verzeichnis:

```bash
ln -s "$(pwd)/plugins/platforms/custom_chat" ~/.hermes/plugins/custom_chat
```

Der Symlink sorgt dafür, dass Hermes das Plugin beim Start finden kann. Geladen
wird es aber erst, wenn es in `plugins.enabled` eingetragen ist.

## ⚙️ Grundkonfiguration

Öffne `~/.hermes/config.yaml` und ergänze:

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

Wichtig sind zwei Ebenen:

- `plugins.enabled` lädt das installierte Plugin.
- `platforms.custom_chat.extra.enabled` startet den WebSocket-Listener.

Lege anschließend in `~/.hermes/.env` einen Bearer Token fest:

```bash
CUSTOM_CHAT_BEARER_TOKEN=ein-langer-zufaelliger-token
```

Der Token schützt den WebSocket-Port. Jeder Client muss ihn beim Verbindungsaufbau
als `Authorization: Bearer ...` senden.

Starte den Gateway neu:

```bash
hermes gateway restart
```

Prüfe danach, ob der Port geöffnet ist:

```bash
ss -tlnp | grep 8765
```

In den Gateway-Logs sollten Meldungen wie `Connecting to custom_chat...` und
`custom_chat connected` erscheinen.

## 🌐 LAN- und Serverbetrieb

Für lokale Entwicklung reicht `127.0.0.1`. Wenn die Web-App oder ein Client auf
einem anderen Host läuft, muss das Plugin auf eine erreichbare Adresse binden:

```yaml
platforms:
  custom_chat:
    enabled: true
    extra:
      enabled: true
      ws_host: "192.168.177.149"
      ws_port: 8765
```

Alternativ kannst du `0.0.0.0` verwenden, wenn Firewall und Netzwerkzugriff
bewusst geregelt sind.

**Achtung:** Ein öffentlich erreichbarer WebSocket-Port sollte immer durch einen
starken Bearer Token, Firewall-Regeln und idealerweise einen Reverse Proxy mit TLS
geschützt werden.

## 🔐 Benutzerzugriff

Das Plugin kann Benutzer einschränken. Das ist hilfreich, wenn mehrere Clients
denselben WebSocket-Port erreichen können.

```bash
CUSTOM_CHAT_ALLOWED_USERS=alice,bob
```

Für bewusst offene Testumgebungen:

```bash
CUSTOM_CHAT_ALLOW_ALL_USERS=true
```

Im Normalbetrieb ist eine Allowlist vorzuziehen. So bleiben versehentliche oder
falsch konfigurierte Clients vom Gateway getrennt.

## 🧩 Konfiguration im Überblick

### YAML unter `platforms.custom_chat.extra`

| Feld | Standard | Zweck |
|------|----------|-------|
| `enabled` | `false` | Startet den WebSocket-Listener |
| `ws_host` | `0.0.0.0` | Bind-Adresse |
| `ws_port` | `8765` | WebSocket-Port |
| `bearer_token` | leer | Token, falls nicht per Env gesetzt |
| `rate_limit_per_minute` | `60` | Schutz vor zu vielen Nachrichten |
| `dedupe_ttl_seconds` | `60` | Zeitfenster für doppelte Event-IDs |
| `media_public_base_url` | leer | Fallback-URL für veröffentlichte Medien |
| `max_upload_bytes` | `20971520` | Maximale Größe eingehender Anhänge |
| `allowed_upload_mime_types` | Schema-Standard | Erlaubte MIME-Typen |
| `tts_response_format` | leer | Optionales TTS-Ausgabeformat |

### Umgebungsvariablen

Umgebungsvariablen überschreiben die passenden YAML-Werte.

| Variable | Zweck |
|----------|-------|
| `CUSTOM_CHAT_BEARER_TOKEN` | Token für WebSocket-Verbindungen |
| `CUSTOM_CHAT_WS_HOST` | Bind-Adresse |
| `CUSTOM_CHAT_WS_PORT` | WebSocket-Port |
| `CUSTOM_CHAT_ALLOWED_USERS` | Kommagetrennte Benutzer-Allowlist |
| `CUSTOM_CHAT_ALLOW_ALL_USERS` | Erlaubt alle Benutzer, wenn auf `true` gesetzt |
| `CUSTOM_CHAT_HOME_CHANNEL` | Standard-Chat für Cron-Delivery |
| `CUSTOM_CHAT_HOME_CHANNEL_NAME` | Anzeigename des Home-Chats |
| `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` | Fallback-URL für veröffentlichte Medien |
| `CUSTOM_CHAT_MAX_UPLOAD_BYTES` | Maximale Größe eingehender Anhänge |
| `CUSTOM_CHAT_ALLOWED_UPLOAD_MIME_TYPES` | Kommagetrennte MIME-Allowlist |
| `CUSTOM_CHAT_TTS_RESPONSE_FORMAT` | Optionales TTS-Ausgabeformat |
| `CUSTOM_CHAT_TTS_TIMEOUT_SECONDS` | Maximale Wartezeit auf TTS |

## 💬 Nachrichten, Chats und Sitzungen

Jede Unterhaltung wird über `chat_id` getrennt. Die Web-App verwendet zum Beispiel
IDs wie `workspace:<uuid>`. Für Hermes ist das der wichtigste Schlüssel, um
Kontext und Verlauf auseinanderzuhalten.

`session_id` und `thread_id` können zusätzlich im Protokoll auftauchen. Sie sind
für UI-Routing und Metadaten nützlich, ersetzen aber nicht die `chat_id`.

## ⌨️ Slash Commands und Freigaben

Nachrichten, die mit `/` beginnen, werden an Hermes weitergereicht. Dadurch
funktionieren Befehle wie:

```text
/model
/reset
/reload-mcp
```

Wenn ein Befehl eine Bestätigung benötigt, sendet Hermes eine interaktive
Button-Karte. Der Client antwortet anschließend mit der gewählten Schaltfläche.
Für Benutzer sieht das wie ein normaler Freigabe-Dialog aus; technisch läuft es
über `assistant_buttons` und `button.click`.

Der `/model`-Befehl nutzt einen zweistufigen Picker: erst Anbieter, dann Modell.
So bleibt die Auswahl auch bei vielen Modellen bedienbar.

## ⏳ Streaming und Abbruch

Hermes kann Antworten während der Generierung streamen. Der Client erhält dann:

1. den Start der Antwort
2. mehrere Textstücke
3. den Abschluss der Antwort

Wenn ein Benutzer die Antwort abbricht, sendet der Client `message.cancel`.
Wichtig ist, dass dabei die Turn-ID verwendet wird. Die Web-App erledigt das
bereits automatisch.

## 🖼️ Medien und Dateien

Das Plugin unterstützt eingehende Anhänge und ausgehende Dateien:

- Bilder und Dokumente in Benutzer-Nachrichten
- Audio-Uploads für STT
- Bilder, Dateien und Audio-Antworten von Hermes

Wenn Hermes lokale Dateien verschicken möchte, müssen diese für den Client
erreichbar gemacht werden. Dafür nutzt das Plugin die Medien-API der Web-App.
Die Web-App teilt ihre erreichbare Medien-URL beim Verbindungsaufbau über
`client.register` mit.

Wenn du keinen Web-BFF nutzt, setze einen Fallback:

```bash
CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL=http://192.0.2.10:8000
```

Ohne erreichbare Medien-URL können Browser lokale Dateipfade vom Hermes-Host nicht
öffnen.

## 🧪 Minimaler WebSocket-Test

Mit diesem Beispiel prüfst du, ob Plugin, Token und Gateway erreichbar sind:

```python
import asyncio
import json
import uuid

import websockets


async def main():
    async with websockets.connect(
        "ws://127.0.0.1:8765",
        additional_headers={"Authorization": "Bearer YOUR_TOKEN_HERE"},
    ) as ws:
        await ws.send(json.dumps({
            "schema_version": "v1",
            "event_id": str(uuid.uuid4()),
            "timestamp": "2026-05-23T10:00:00Z",
            "platform": "custom_chat",
            "chat_id": "workspace:demo",
            "user_id": "user-demo",
            "type": "message.create",
            "payload": {
                "message_id": str(uuid.uuid4()),
                "text": "Hallo Hermes",
            },
        }))

        async for message in ws:
            print(json.loads(message))


asyncio.run(main())
```

Die vollständigen Event-Formate stehen in der
[Schnittstellenreferenz](interface_contract.md).

## 🛠️ Fehlerbehebung

| Symptom | Wahrscheinliche Ursache | Lösung |
|---------|-------------------------|--------|
| Port `8765` ist nicht offen | Plugin ist nicht geladen oder `extra.enabled` fehlt | `plugins.enabled`, `platforms.custom_chat.enabled` und `extra.enabled` prüfen |
| Hermes ignoriert die Konfiguration | Werte stehen unter `gateway.platforms` | Werte müssen unter top-level `platforms` stehen |
| Verbindung schließt sofort | Bearer Token stimmt nicht | Token in Client und `~/.hermes/.env` vergleichen |
| `assistant_error` nach Connect | Benutzer ist nicht erlaubt | Allowlist oder Hermes-Autorisierung prüfen |
| Medien erscheinen als lokale Pfade | Medien-Basis-URL fehlt | Web-BFF verbinden oder `CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL` setzen |
| Viele Nachrichten werden abgelehnt | Rate Limit greift | Frequenz senken oder `rate_limit_per_minute` erhöhen |
| Doppelte Nachricht wird ignoriert | `event_id` wurde wiederverwendet | Pro Event eine neue UUID verwenden |
| Keine Streaming-Deltas | Gateway-Streaming ist deaktiviert | Hermes-Streaming-Konfiguration prüfen |

## ✅ Betriebs-Checkliste

- [ ] Plugin ist in `~/.hermes/plugins/custom_chat` verlinkt.
- [ ] `custom_chat-platform` steht in `plugins.enabled`.
- [ ] `platforms.custom_chat.extra.enabled` ist `true`.
- [ ] `CUSTOM_CHAT_BEARER_TOKEN` ist gesetzt und nicht leer.
- [ ] Der WebSocket-Port ist nur für gewünschte Clients erreichbar.
- [ ] Medien-URL ist aus Sicht von Hermes und Browser erreichbar.
- [ ] Allowlist oder bewusst offene Testkonfiguration ist dokumentiert.

## 📸 Empfohlene Screenshots

- Hermes-Konfiguration mit `plugins.enabled` und `platforms.custom_chat`
- Web-App-Diagnose, wenn das Plugin erreichbar ist
- Interaktive Freigabe für `/reload-mcp`
