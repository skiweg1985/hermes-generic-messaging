# Dependency Management und CI

Dieses Projekt nutzt GitHub Actions und Dependabot, um Dependency- und Supply-Chain-Risiken früh zu erkennen.

## CI-Gates

Der Workflow `.github/workflows/ci.yml` läuft auf Pull Requests, Pushes nach `main` und manuell per `workflow_dispatch`.

Er prüft:

- Python-Installation mit `.[dev,web]`
- `pip check`
- `pip-audit`
- Python-Tests für Plugin und Web-BFF
- Frontend-Installation per `npm ci`
- `npm audit --audit-level=moderate`
- Frontend-Tests
- Frontend-Production-Build
- CSS-Cascade-Invarianten
- GitHub Dependency Review für Pull Requests

Der Workflow hat standardmäßig nur `contents: read`. Der Dependency-Review-Job bekommt zusätzlich `pull-requests: read`, weil die Action PR-Metadaten lesen muss.

## Dependabot

Die Konfiguration liegt in `.github/dependabot.yml`.

Dependabot prüft wöchentlich:

- GitHub Actions
- npm-Abhängigkeiten der Web-App
- Python-Abhängigkeiten aus dem Repository-Root
- Docker-Basisimages unter `web/`

Patch- und Minor-Updates werden gruppiert, damit Wartungs-PRs überschaubar bleiben. Major-Updates werden absichtlich nicht in die Patch/Minor-Gruppen gepackt und sollten einzeln geprüft werden.

## Sicherheitsupdates

Zusätzlich zu den geplanten Version-Update-PRs sollte GitHub Dependabot Security Updates aktiviert sein. Diese PRs sind für bekannte Advisories priorisiert und sollten vor Routine-Maintenance behandelt werden.

Empfohlene Reihenfolge beim Abarbeiten:

1. Kritische Security Updates isoliert mergen.
2. High/Moderate Security Updates prüfen und zeitnah mergen.
3. Patch/Minor-Gruppen mergen, wenn CI grün ist.
4. Major-Updates separat planen und testen.

## Branch Protection

Sobald der CI-Workflow einmal auf `main` existiert und die Check-Namen stabil sind, sollte `main` diese Checks als required status checks verlangen:

- `Python tests and audit`
- `Frontend tests, build and audit`
- `Dependency review`

Für ein Solo-Repository bleibt `required_approving_review_count` auf `0`, damit der Maintainer nicht durch fehlende externe Reviewer blockiert wird.
