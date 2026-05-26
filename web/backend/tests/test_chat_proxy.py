from app.core.config import Settings
from app.ws.chat_proxy import enrich_inbound


def test_enrich_message_create_normalizes_media_urls():
    settings = Settings(
        web_chat_id="workspace:demo",
        web_user_id="user-demo",
        public_media_base_url="http://bff.local:8000",
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
    assert attachment["url"] == "http://bff.local:8000/api/v1/media/img-1"
    assert attachment["file_ref"] == "http://bff.local:8000/api/v1/media/img-1"
