"""Server-side persistence for web chat sessions."""

from __future__ import annotations

import json
import os
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.core.config import Settings

try:  # POSIX only; used for cross-process (multi-worker) locking.
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None  # type: ignore[assignment]

STORE_VERSION = 1
MAX_SESSIONS = 80
MAX_TRANSCRIPT_LINES = 200
LEGACY_DEMO_CHAT_ID = "workspace:demo"

_LOCK = threading.Lock()


class SessionStore:
    def __init__(self, settings: Settings):
        self.path = Path(settings.session_store_path)

    @contextmanager
    def _cross_process_lock(self) -> Iterator[None]:
        """Serialize the read-modify-write across processes (uvicorn workers).
        threading.Lock alone only guards a single process. Falls back to a no-op
        where fcntl is unavailable."""
        if fcntl is None:
            yield
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self.path.with_name(f"{self.path.name}.lock")
        with open(lock_path, "w", encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def load(self) -> dict[str, Any]:
        with _LOCK:
            return self._read_unlocked()

    def save(self, payload: dict[str, Any]) -> dict[str, Any]:
        incoming = normalize_store_payload(payload)
        with _LOCK, self._cross_process_lock():
            existing = self._read_unlocked()
            merged = merge_store_payloads(existing, incoming)
            self._write_unlocked(merged)
            return merged

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.path.is_file():
            return empty_store_payload()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return empty_store_payload()
        if not isinstance(raw, dict):
            return empty_store_payload()
        return normalize_store_payload(raw)

    def _write_unlocked(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Unique temp name per writer so concurrent processes can't interleave
        # into a shared "*.tmp" and promote a corrupt file via replace().
        tmp_path = self.path.with_name(
            f"{self.path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
        )
        try:
            tmp_path.write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            tmp_path.replace(self.path)
        finally:
            tmp_path.unlink(missing_ok=True)


def empty_store_payload() -> dict[str, Any]:
    return {"version": STORE_VERSION, "activeChatId": None, "sessions": []}


def normalize_store_payload(payload: dict[str, Any]) -> dict[str, Any]:
    raw_sessions = payload.get("sessions")
    sessions = []
    if isinstance(raw_sessions, list):
        sessions = [
            normalized
            for entry in raw_sessions
            if isinstance(entry, dict)
            for normalized in [_normalize_session(entry)]
            if normalized is not None
        ]

    sessions.sort(key=_session_timestamp, reverse=True)
    sessions = sessions[:MAX_SESSIONS]
    chat_ids = {session["chatId"] for session in sessions}
    raw_active = payload.get("activeChatId")
    active_chat_id = raw_active if isinstance(raw_active, str) and raw_active in chat_ids else None
    if active_chat_id is None and sessions:
        active_chat_id = sessions[0]["chatId"]

    return {
        "version": STORE_VERSION,
        "activeChatId": active_chat_id,
        "sessions": sessions,
    }


def merge_store_payloads(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    by_chat_id: dict[str, dict[str, Any]] = {
        session["chatId"]: session for session in existing.get("sessions", [])
    }

    for session in incoming.get("sessions", []):
        chat_id = session["chatId"]
        current = by_chat_id.get(chat_id)
        if current is None or _session_timestamp(session) >= _session_timestamp(current):
            by_chat_id[chat_id] = session

    sessions = sorted(by_chat_id.values(), key=_session_timestamp, reverse=True)[:MAX_SESSIONS]
    chat_ids = {session["chatId"] for session in sessions}
    active_chat_id = incoming.get("activeChatId")
    if not isinstance(active_chat_id, str) or active_chat_id not in chat_ids:
        active_chat_id = existing.get("activeChatId")
    if not isinstance(active_chat_id, str) or active_chat_id not in chat_ids:
        active_chat_id = sessions[0]["chatId"] if sessions else None

    return {
        "version": STORE_VERSION,
        "activeChatId": active_chat_id,
        "sessions": sessions,
    }


def _normalize_session(session: dict[str, Any]) -> dict[str, Any] | None:
    chat_id = session.get("chatId")
    label = session.get("label")
    lines = session.get("lines")
    created_at = session.get("createdAt")
    updated_at = session.get("updatedAt")
    # NOTE: `input` (composer draft text) is deliberately NOT required. It lives
    # in a separate client-side draft store and is never part of the persisted
    # session, so requiring it here silently dropped every real session the
    # frontend sent (server-side history sync was a no-op).
    if not (
        isinstance(chat_id, str)
        and isinstance(label, str)
        and isinstance(lines, list)
        and isinstance(created_at, str)
        and isinstance(updated_at, str)
    ):
        return None
    if chat_id == LEGACY_DEMO_CHAT_ID and label.lower() == "demo":
        return None
    if len(lines) == 0:
        return None

    normalized = dict(session)
    normalized["lines"] = [
        {**line, "streaming": False}
        for line in lines[-MAX_TRANSCRIPT_LINES:]
        if isinstance(line, dict)
    ]
    for line in normalized["lines"]:
        if line.get("toolStatus") == "running":
            line["toolStatus"] = "idle"
    normalized["streamingMessageId"] = None
    normalized["streamTurnId"] = None
    normalized["pendingAttachments"] = []
    normalized["typing"] = False
    normalized.pop("typingStartedAt", None)
    # Preserve typingClosed so the client's late-typing guard survives a
    # server round-trip (a completed turn stays closed).
    normalized["typingClosed"] = bool(session.get("typingClosed", False))
    normalized["unread"] = bool(normalized.get("unread", False))
    return normalized


def _session_timestamp(session: dict[str, Any]) -> str:
    updated_at = session.get("updatedAt")
    if isinstance(updated_at, str):
        return updated_at
    created_at = session.get("createdAt")
    return created_at if isinstance(created_at, str) else ""
