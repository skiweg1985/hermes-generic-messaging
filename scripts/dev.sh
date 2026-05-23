#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Install Python deps..."
pip install -e ".[dev,web]" -q

echo "Start BFF on :8000 (background)..."
(cd web/backend && uvicorn app.main:app --reload --port 8000) &
BFF_PID=$!

cleanup() {
  kill "$BFF_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Start frontend on :5173..."
cd web/frontend
npm install --silent
npm run dev
