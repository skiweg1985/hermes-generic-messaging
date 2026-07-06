import json

from app.core.config import Settings, get_settings
from app.main import app
from app.services.session_store import SessionStore
from fastapi.testclient import TestClient


def session(chat_id: str, updated_at: str, text: str = ""):
    return {
        "chatId": chat_id,
        "label": chat_id,
        "lines": [{"id": f"{chat_id}-1", "kind": "user", "text": text}] if text else [],
        "streamingMessageId": "running",
        "streamTurnId": "turn-1",
        "input": "",
        "pendingAttachments": [{"localId": "upload-1"}],
        "typing": True,
        "typingClosed": True,
        "unread": False,
        "createdAt": updated_at,
        "updatedAt": updated_at,
    }


def test_session_store_merges_without_losing_newer_sessions(tmp_path):
    store = SessionStore(Settings(session_store_path=str(tmp_path / "sessions.json")))

    store.save(
        {
            "version": 1,
            "activeChatId": "c1",
            "sessions": [session("c1", "2026-07-03T10:00:00Z", "newer")],
        }
    )
    saved = store.save(
        {
            "version": 1,
            "activeChatId": "c2",
            "sessions": [
                session("c1", "2026-07-03T09:00:00Z", "older"),
                session("c2", "2026-07-03T11:00:00Z", "second"),
            ],
        }
    )

    by_id = {entry["chatId"]: entry for entry in saved["sessions"]}
    assert saved["activeChatId"] == "c2"
    assert by_id["c1"]["lines"][0]["text"] == "newer"
    assert by_id["c1"]["streamingMessageId"] is None
    assert by_id["c1"]["pendingAttachments"] == []
    assert by_id["c1"]["typing"] is False
    assert by_id["c2"]["lines"][0]["text"] == "second"


def test_session_store_persists_sessions_without_input_field(tmp_path):
    # The real frontend payload has no "input" key (drafts live client-side).
    # Such sessions must persist, not be silently dropped.
    store = SessionStore(Settings(session_store_path=str(tmp_path / "sessions.json")))
    entry = session("c1", "2026-07-03T10:00:00Z", "hello")
    entry.pop("input", None)

    saved = store.save({"version": 1, "activeChatId": "c1", "sessions": [entry]})

    assert [s["chatId"] for s in saved["sessions"]] == ["c1"]
    assert store.load()["sessions"][0]["chatId"] == "c1"


def test_session_store_drops_draft_only_sessions(tmp_path):
    path = tmp_path / "sessions.json"
    draft = session("draft", "2026-07-03T12:00:00Z")
    draft["input"] = "/bg"
    path.write_text(
        json.dumps({"version": 1, "activeChatId": "draft", "sessions": [draft]}),
        encoding="utf-8",
    )

    store = SessionStore(Settings(session_store_path=str(path)))

    assert store.load() == {"version": 1, "activeChatId": None, "sessions": []}


def test_sessions_api_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("WEB_SESSION_STORE_PATH", str(tmp_path / "api_sessions.json"))
    get_settings.cache_clear()
    client = TestClient(app)

    res = client.get("/api/v1/sessions")
    assert res.status_code == 200
    assert res.json()["sessions"] == []

    payload = {
        "version": 1,
        "activeChatId": "c-api",
        "sessions": [session("c-api", "2026-07-03T12:00:00Z", "hello")],
    }
    res = client.put("/api/v1/sessions", json=payload)
    assert res.status_code == 200
    assert res.json()["activeChatId"] == "c-api"

    res = client.get("/api/v1/sessions")
    assert res.status_code == 200
    assert res.json()["sessions"][0]["chatId"] == "c-api"
    get_settings.cache_clear()
