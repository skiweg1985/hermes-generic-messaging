from fastapi.testclient import TestClient

from app.api.diagnostics import upstream_target
from app.main import app

client = TestClient(app)


def test_diagnostics_reports_chain():
    res = client.get("/api/v1/diagnostics")
    assert res.status_code == 200
    body = res.json()
    assert body["bff"] == "ok"
    assert "status" in body["upstream"]
    assert "target" in body["upstream"]
    # No upstream in the test env: the probe must classify, not raise.
    assert body["upstream"]["status"] in {
        "ok",
        "unreachable",
        "unauthorized",
        "closed",
        "error",
    }


def test_upstream_target_strips_scheme_and_credentials():
    assert upstream_target("ws://127.0.0.1:8765") == "127.0.0.1:8765"
    assert upstream_target("wss://user:secret@host.example:443/path") == "host.example:443"
    assert upstream_target("ws://plainhost") == "plainhost"
