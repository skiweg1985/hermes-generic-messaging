# 🗂️ Historische Event-Schema-Planung

Dieses Dokument ist ein historischer Planungsstand für Event Schema v1. Die
aktuelle, gepflegte Referenz steht in
[docs/interface_contract.md](../interface_contract.md).

Verwende dieses Dokument nur, wenn du nachvollziehen möchtest, wie der Adapter
ursprünglich geplant wurde.

## Was umgesetzt wurde

Der heutige `custom_chat` Stack unterstützt:

- Textnachrichten und Anhänge
- Slash Commands
- Audio- und Datei-Uploads
- Streaming-Antworten
- Segmentgrenzen nach Tool-Aufrufen
- interaktive Buttons und Modell-Auswahl
- Medien-Events für Bilder, Dateien und Audio
- Session-Metadaten wie Chat-Titel
- Rate Limit, Deduplizierung und Bearer-Token-Auth

## Aktuelle Event-Gruppen

| Richtung | Events |
|----------|--------|
| Client → Plugin | `message.create`, `command.create`, `audio.uploaded`, `file.uploaded`, `message.cancel`, `button.click`, `client.register` |
| Plugin → Client | `assistant_start`, `assistant_delta`, `assistant_done`, `assistant_segment`, `assistant_notice`, `assistant_buttons`, `assistant_image`, `assistant_file`, `assistant_audio`, `session_meta`, `typing`, `assistant_error` |

## Aktuelle Referenzen

- [Schnittstellenreferenz](../interface_contract.md)
- [Plugin-Betrieb](../custom_chat.md)
- [Web-App-Betrieb](../web-app.md)
- [JSON-Beispiele](../examples/custom-chat-events-v1.json)
