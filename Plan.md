# 🗂️ Historischer Projektplan

Dieses Dokument ersetzt einen alten, sehr detaillierten PR-Umsetzungsplan. Der
Plan selbst ist nicht mehr die richtige Quelle für Betrieb oder Entwicklung,
weil `custom_chat`, die Web-App und Event Schema v1 inzwischen implementiert
sind.

## Aktuelle Dokumentation

| Thema | Dokument |
|-------|----------|
| Einstieg und Schnellstart | [README.md](README.md) |
| Dokumentationsübersicht | [docs/README.md](docs/README.md) |
| Plugin installieren und betreiben | [docs/custom_chat.md](docs/custom_chat.md) |
| Web-App betreiben | [docs/web-app.md](docs/web-app.md) |
| Schnittstellenreferenz | [docs/interface_contract.md](docs/interface_contract.md) |
| Repository-Wegweiser | [docs/plans/path-discovery.md](docs/plans/path-discovery.md) |

## Was aus dem ursprünglichen Plan entstanden ist

- Hermes-Plugin `custom_chat`
- Event Schema v1 über WebSocket
- FastAPI-BFF für Browser-Clients
- React-Weboberfläche
- Medien-Upload und Medien-Ausgabe
- Slash Commands, interaktive Freigaben und Modell-Auswahl
- Streaming-Antworten mit Segmenten
- Diagnose- und Session-Endpunkte
- Tests für Plugin, BFF und Frontend

## Historische Details

Feingranulare Arbeitsnotizen stehen im Git-Verlauf und im
[Worklog](planning/coordination/WORKLOG.md). Sie sind hilfreich für
Nachvollziehbarkeit, aber nicht für die tägliche Nutzung des Projekts.
