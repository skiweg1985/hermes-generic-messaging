# 📚 Dokumentation

Diese Dokumentation ist nach Arbeitsabläufen aufgebaut. Beginne oben, wenn du
Hermes Generic Messaging neu einrichtest, und springe später direkt in die
Referenz- oder Fehlerbehebungsseiten.

## 🧭 Schnellnavigation

| Du möchtest ... | Lies hier weiter |
|-----------------|------------------|
| verstehen, was das Projekt macht | [Projektüberblick](../README.md) |
| das Hermes-Plugin installieren | [custom_chat Plugin](custom_chat.md) |
| die Browser-Oberfläche betreiben | [Web-App](web-app.md) |
| CI und Dependency Updates verstehen | [Dependency Management und CI](dependency-management.md) |
| einen eigenen Client bauen | [Schnittstellenreferenz](interface_contract.md) |
| Beispielnachrichten sehen | [Event-Beispiele](examples/custom-chat-events-v1.json) |
| alte Umsetzungspläne einordnen | [Historische Pläne](plans/path-discovery.md) |

## 🧱 Dokumentationsstruktur

### 1. Einstieg

Der [Projektüberblick](../README.md) erklärt die Bausteine, die wichtigsten
Begriffe und den lokalen Schnellstart.

### 2. Betrieb

- [custom_chat Plugin](custom_chat.md): Installation, Hermes-Konfiguration,
  Sicherheit, Medien, Slash Commands und Fehlerbehebung.
- [Web-App](web-app.md): BFF, Frontend, Session-Speicher, Medien-URLs,
  Produktion und Diagnose.

### 3. Entwicklung

- [Schnittstellenreferenz](interface_contract.md): Event Schema v1,
  REST-Endpunkte und Adapter-Erweiterungspunkte.
- [Event-Beispiele](examples/custom-chat-events-v1.json): kompakte
  JSON-Beispiele für eigene Clients.

### 4. Historie

Die Dateien unter `docs/plans/`, `Plan.md` und `planning/coordination/WORKLOG.md`
sind historische Arbeitsdokumente. Sie erklären, wie Funktionen entstanden sind,
sollten aber nicht als aktuelle Betriebsanleitung verwendet werden.

## ✍️ Begriffe

Die Dokumentation verwendet bewusst wenige, konsistente Begriffe:

| Begriff | Bedeutung |
|---------|-----------|
| Benutzer | Mensch, der über die Weboberfläche oder einen Client mit Hermes spricht |
| Chat | Eine Unterhaltung, technisch über `chat_id` getrennt |
| Sitzung | Gespeicherter UI-Zustand eines Chats in der Web-App |
| BFF | FastAPI-Dienst zwischen Browser und Plugin |
| Plugin | Hermes-Platform-Plugin `custom_chat` |
| Client | Web-App oder eigener WebSocket-Client, der Event Schema v1 spricht |

## 📸 Sinnvolle Screenshots

Diese Screenshots würden die Dokumentation gut ergänzen:

- Web-App: Chat-Ansicht mit Seitenleiste und mehreren Sitzungen
- Web-App: Diagnose-Panel mit Browser-, BFF- und Upstream-Status
- Web-App: Medien-Upload in einer Nachricht
- Web-App: Interaktive Freigabe für einen Slash Command

Die Screenshots sind bewusst noch nicht eingebettet, damit sie aus einer stabilen
Produktversion erzeugt werden können.
