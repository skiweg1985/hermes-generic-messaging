from app.core.config import Settings
from app.ws.chat_proxy import enrich_inbound


def test_enrich_message_create_normalizes_media_urls():
    settings = Settings(
        web_chat_id="workspace:demo",
        web_user_id="user-demo",
        public_media_base_url="http://bff.local:8000",
        custom_chat_media_base_url="http://127.0.0.1:8001",
    )
    data = {
        "type": "message.create",
        "payload": {
            "message_id": "m-1",
            "text": "describe this image",
            "attachments": [
                {
                    "attachment_id": "att-1",
                    "mime_type": "image/png",
                    "size_bytes": 128,
                    "url": "/api/v1/media/img-1",
                }
            ],
        },
    }

    out = enrich_inbound(data, settings)

    attachment = out["payload"]["attachments"][0]
    assert attachment["url"] == "http://127.0.0.1:8001/api/v1/media/img-1"
    assert attachment["file_ref"] == "http://127.0.0.1:8001/api/v1/media/img-1"


def test_enrich_message_create_rewrites_public_media_url_for_hermes():
    settings = Settings(
        web_chat_id="workspace:demo",
        web_user_id="user-demo",
        public_media_base_url="https://192.0.2.10:8000",
        custom_chat_media_base_url="http://127.0.0.1:8001",
    )
    data = {
        "type": "message.create",
        "payload": {
            "message_id": "m-1",
            "text": "",
            "attachments": [
                {
                    "attachment_id": "att-1",
                    "mime_type": "audio/webm",
                    "size_bytes": 128,
                    "url": "https://192.0.2.10:8000/api/v1/media/audio-1",
                }
            ],
        },
    }

    out = enrich_inbound(data, settings)

    attachment = out["payload"]["attachments"][0]
    assert attachment["url"] == "http://127.0.0.1:8001/api/v1/media/audio-1"
    assert attachment["file_ref"] == "http://127.0.0.1:8001/api/v1/media/audio-1"


def test_enrich_audio_uploaded_rewrites_public_media_url_for_hermes():
    settings = Settings(
        web_chat_id="workspace:demo",
        web_user_id="user-demo",
        public_media_base_url="https://192.0.2.10:8000",
        custom_chat_media_base_url="http://127.0.0.1:8001",
    )
    data = {
        "type": "audio.uploaded",
        "payload": {
            "message_id": "voice-1",
            "mime_type": "audio/webm",
            "size_bytes": 128,
            "url": "https://192.0.2.10:8000/api/v1/media/audio-1",
        },
    }

    out = enrich_inbound(data, settings)

    assert out["payload"]["url"] == "http://127.0.0.1:8001/api/v1/media/audio-1"
    assert out["payload"]["file_ref"] == "http://127.0.0.1:8001/api/v1/media/audio-1"


def test_enrich_forces_user_id_and_cannot_be_spoofed():
    settings = Settings(web_chat_id="workspace:demo", web_user_id="user-demo")
    data = {
        "type": "message.create",
        "user_id": "victim",
        "chat_id": "workspace:mine",
        "payload": {"message_id": "m-1", "text": "hi"},
    }

    out = enrich_inbound(data, settings)

    # user_id is the BFF's identity and must be overwritten...
    assert out["user_id"] == "user-demo"
    # ...but chat_id stays client-owned (multi-chat namespace).
    assert out["chat_id"] == "workspace:mine"
