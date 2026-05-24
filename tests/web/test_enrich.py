from app.core.config import Settings
from app.ws.chat_proxy import enrich_inbound


def test_enrich_fills_missing_fields():
    settings = Settings(web_chat_id="c1", web_user_id="u1")
    data = {
        "type": "message.create",
        "payload": {"message_id": "m1", "text": "hi"},
    }
    out = enrich_inbound(data, settings)
    assert out["schema_version"] == "v1"
    assert out["platform"] == "custom_chat"
    assert out["chat_id"] == "c1"
    assert out["user_id"] == "u1"
    assert "event_id" in out
    assert "timestamp" in out


def test_enrich_preserves_existing():
    settings = Settings()
    data = {
        "schema_version": "v1",
        "event_id": "fixed",
        "timestamp": "2026-01-01T00:00:00Z",
        "platform": "custom_chat",
        "chat_id": "x",
        "user_id": "y",
        "type": "command.create",
        "payload": {"message_id": "m", "command": "/reset"},
    }
    out = enrich_inbound(data, settings)
    assert out["event_id"] == "fixed"


def test_enrich_supports_button_click():
    settings = Settings(web_chat_id="c1", web_user_id="u1")
    data = {
        "type": "button.click",
        "payload": {
            "message_id": "cf-1",
            "confirm_id": "cf-1",
            "button_id": "once",
            "choice": "once",
        },
    }

    out = enrich_inbound(data, settings)

    assert out["schema_version"] == "v1"
    assert out["platform"] == "custom_chat"
    assert out["chat_id"] == "c1"
    assert out["user_id"] == "u1"
    assert out["type"] == "button.click"


def test_enrich_supports_file_uploaded():
    settings = Settings(web_chat_id="c1", web_user_id="u1")
    data = {
        "type": "file.uploaded",
        "payload": {
            "message_id": "f1",
            "filename": "report.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 123,
            "url": "https://example.local/report.pdf",
        },
    }
    out = enrich_inbound(data, settings)
    assert out["type"] == "file.uploaded"
    assert out["chat_id"] == "c1"
