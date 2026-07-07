"""BFF-facing authentication for browser/API clients."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.config import get_settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_settings_cache_after_test():
    yield
    get_settings.cache_clear()


def _reset_settings(monkeypatch, token: str | None = None) -> None:
    if token is None:
        monkeypatch.delenv("WEB_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("WEB_REQUIRE_AUTH", raising=False)
    else:
        monkeypatch.setenv("WEB_AUTH_TOKEN", token)
    get_settings.cache_clear()


def test_health_stays_public_when_bff_auth_is_configured(monkeypatch):
    _reset_settings(monkeypatch, "secret-token")

    response = client.get("/api/v1/health")

    assert response.status_code == 200


def test_protected_http_endpoint_rejects_missing_bff_auth(monkeypatch):
    _reset_settings(monkeypatch, "secret-token")

    response = client.get("/api/v1/sessions")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHORIZED"


def test_protected_http_endpoint_accepts_bearer_bff_auth(monkeypatch):
    _reset_settings(monkeypatch, "secret-token")

    response = client.get(
        "/api/v1/sessions",
        headers={"Authorization": "Bearer secret-token"},
    )

    assert response.status_code == 200
    assert response.json()["version"] == 1


def test_protected_http_endpoint_rejects_wrong_bff_auth(monkeypatch):
    _reset_settings(monkeypatch, "secret-token")

    response = client.get(
        "/api/v1/sessions",
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert response.status_code == 401


def test_websocket_rejects_missing_bff_auth(monkeypatch):
    _reset_settings(monkeypatch, "secret-token")

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/chat"):
            pass

    assert exc.value.code == 4401


def test_websocket_accepts_query_bff_auth(monkeypatch):
    _reset_settings(monkeypatch, "secret-token")

    with client.websocket_connect("/ws/chat?auth_token=secret-token") as websocket:
        message = websocket.receive()

    # Auth passed; without an upstream Hermes plugin in the test environment the
    # BFF should fail only on the upstream leg, not at the browser auth gate.
    assert message["type"] == "websocket.close"
    assert message["code"] == 1011
