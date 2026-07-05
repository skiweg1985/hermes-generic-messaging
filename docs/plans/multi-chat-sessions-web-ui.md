# 🗂️ Historische Planung: Multi-Chat in der Web-App

Dieses Dokument beschreibt eine inzwischen umgesetzte Planungsphase. Die aktuelle
Betriebsdokumentation steht in [docs/web-app.md](../web-app.md).

## Aktueller Stand

Die Web-App unterstützt mehrere parallele Chats:

- Jeder Chat hat eine eigene `chat_id`.
- Neue Chats verwenden IDs wie `workspace:<uuid>`.
- Eingehende Events werden anhand von `event.chat_id` der richtigen Sitzung
  zugeordnet.
- Unbekannte `chat_id`s erzeugen automatisch eine neue Sitzung.
- Sitzungen werden lokal im Browser und über `/api/v1/sessions` im BFF
  gespeichert.
- Chat-Titel können aus `session_meta` übernommen werden.

## Warum `chat_id` wichtig ist

`chat_id` ist die Grenze zwischen Unterhaltungen. `session_id` und `thread_id`
können zusätzliche Metadaten liefern, ersetzen aber nicht die `chat_id`.

Für Benutzer bedeutet das: Mehrere Chats in der Seitenleiste bleiben getrennt,
auch wenn sie über dieselbe WebSocket-Verbindung laufen.

## Aktuelle Referenzen

- [Web-App betreiben](../web-app.md)
- [Schnittstellenreferenz](../interface_contract.md)
- [custom_chat Plugin betreiben](../custom_chat.md)
