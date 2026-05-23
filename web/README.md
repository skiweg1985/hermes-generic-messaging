# custom_chat Web App

FastAPI BFF and terminal-style React UI for Event Schema v1.

## Backend

```bash
cd web
cp .env.example .env
# edit CUSTOM_CHAT_BEARER_TOKEN

cd ..
pip install -e "..[dev,web]"
cd backend
uvicorn app.main:app --reload --port 8000
```

## Frontend

```bash
cd web/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173 — Vite proxies `/api` and `/ws` to the BFF.

See [docs/web-app.md](../docs/web-app.md).
