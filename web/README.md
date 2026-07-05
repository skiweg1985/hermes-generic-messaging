# 🖥️ Web-App Kurzstart

Diese Datei ist der schnelle Einstieg für die Web-App im Verzeichnis `web/`.
Die ausführliche Betriebsdokumentation steht in
[docs/web-app.md](../docs/web-app.md).

## Backend starten

```bash
cd web
cp .env.example .env
# CUSTOM_CHAT_TARGET und CUSTOM_CHAT_BEARER_TOKEN eintragen

cd ..
pip install -e ".[dev,web]"

cd web/backend
uvicorn app.main:app --reload --port 8000
```

Für ruhigere Logs:

```bash
uvicorn app.main:app --reload --port 8000 --log-config log_config.yaml --no-access-log
```

## Frontend starten

```bash
cd web/frontend
npm install
npm run dev
```

Öffne danach <http://127.0.0.1:5173>. Vite leitet `/api` und `/ws` an das BFF
weiter.

## Diagnose

```bash
curl http://127.0.0.1:8000/api/v1/diagnostics
```

Wenn `upstream.status` nicht `ok` ist, prüfe zuerst `CUSTOM_CHAT_TARGET`, den
Bearer Token und ob das `custom_chat` Plugin im Hermes Gateway läuft.
