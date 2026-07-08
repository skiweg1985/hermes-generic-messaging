# Dependency Management und CI

Dieses Projekt nutzt GitHub Actions und Dependabot, um Dependency- und Supply-Chain-Risiken früh zu erkennen.

## CI-Gates

Der Workflow `.github/workflows/ci.yml` läuft auf Pull Requests, Pushes nach `main` und manuell per `workflow_dispatch`.

Er prüft:

- Python-Installation per `uv sync --locked --extra dev --extra web`
- `uv pip check`
- `uv run pip-audit`
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
- Python-Abhängigkeiten aus dem Repository-Root mit `uv.lock`
- Docker-Basisimages unter `web/`

Patch- und Minor-Updates werden gruppiert, damit Wartungs-PRs überschaubar bleiben. Major-Updates werden absichtlich nicht in die Patch/Minor-Gruppen gepackt und sollten einzeln geprüft werden.

Für normale Versionsupdates gilt ein 14-Tage-Cooldown. Dependabot öffnet Routine-PRs erst, wenn die neue Version mindestens 14 Tage alt ist. Das reduziert das Risiko, frisch kompromittierte oder unmittelbar zurückgezogene Releases automatisch zu übernehmen.

Der Cooldown gilt bewusst nicht für Dependabot Security Updates. Wenn GitHub eine bekannte Advisory erkennt, soll der Fix ohne künstliche Wartezeit vorgeschlagen werden.

## Sicherheitsupdates

Zusätzlich zu den geplanten Version-Update-PRs sollte GitHub Dependabot Security Updates aktiviert sein. Diese PRs sind für bekannte Advisories priorisiert und sollten vor Routine-Maintenance behandelt werden.

Empfohlene Reihenfolge beim Abarbeiten:

1. Kritische Security Updates isoliert mergen.
2. High/Moderate Security Updates prüfen und zeitnah mergen.
3. Patch/Minor-Gruppen erst nach dem 14-Tage-Cooldown mergen, wenn CI grün ist.
4. Major-Updates separat planen und testen.

Diese Policy schützt nicht gegen jede Supply-Chain-Attacke. Sie kombiniert aber mehrere Kontrollen: verzögerte Routine-Updates, Security-Update-Ausnahmen, reproduzierbare npm-Installationen mit Lockfile, reproduzierbare Python-Installationen mit `uv.lock`, Dependency Review, Audit-Checks und Branch Protection mit required CI.

## Pinning-Policy

Python-Abhängigkeiten werden über `uv.lock` konkret aufgelöst. Die CI installiert ausschließlich mit `uv sync --locked`, damit Pull Requests nicht unbemerkt andere Python-Versionen ziehen.

Die Frontend-Abhängigkeiten bleiben über `package-lock.json` und `npm ci` reproduzierbar.

GitHub Actions werden auf Commit-SHAs gepinnt. Kommentare neben den Pins dokumentieren den zugehörigen Major-Track, während Dependabot die Pins weiter aktualisieren kann.

Das BFF-Docker-Image nutzt ein digest-gepinntes Base Image. Dadurch zeigt `python:3.12-slim` weiterhin die beabsichtigte Linie, aber der konkrete Image-Inhalt ist an den `sha256`-Digest gebunden.

## Branch Protection

Sobald der CI-Workflow einmal auf `main` existiert und die Check-Namen stabil sind, sollte `main` diese Checks als required status checks verlangen:

- `Python tests and audit`
- `Frontend tests, build and audit`
- `Dependency review`

Für ein Solo-Repository bleibt `required_approving_review_count` auf `0`, damit der Maintainer nicht durch fehlende externe Reviewer blockiert wird.
