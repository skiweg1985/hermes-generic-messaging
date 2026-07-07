"""Browser-facing BFF authentication helpers."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, WebSocket

from app.core.config import Settings, get_settings

UNAUTHORIZED_DETAIL = {
    "code": "UNAUTHORIZED",
    "message": "valid BFF authentication is required",
}
MISCONFIGURED_DETAIL = {
    "code": "BFF_AUTH_MISCONFIGURED",
    "message": "WEB_REQUIRE_AUTH is enabled but WEB_AUTH_TOKEN is not configured",
}


def bff_auth_enabled(settings: Settings) -> bool:
    return bool(settings.web_auth_token or settings.web_require_auth)


def _configured_token(settings: Settings) -> str:
    return settings.web_auth_token.strip()


def _token_matches(candidate: str | None, settings: Settings) -> bool:
    expected = _configured_token(settings)
    if not expected:
        return False
    supplied = (candidate or "").strip()
    return bool(supplied) and secrets.compare_digest(supplied, expected)


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return None
    return value.strip()


def require_http_bff_auth(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    x_bff_auth: Annotated[str | None, Header(alias="X-BFF-Auth")] = None,
) -> None:
    """Protect browser-facing HTTP endpoints when BFF auth is configured.

    Auth is intentionally opt-in so localhost development keeps working without
    extra setup. Production/LAN deployments can set WEB_AUTH_TOKEN (or enforce
    WEB_REQUIRE_AUTH=true) and clients must then send either:

    - Authorization: Bearer <token>
    - X-BFF-Auth: <token>
    """
    if not bff_auth_enabled(settings):
        return
    if settings.web_require_auth and not _configured_token(settings):
        raise HTTPException(status_code=503, detail=MISCONFIGURED_DETAIL)
    if _token_matches(_bearer_token(authorization), settings) or _token_matches(
        x_bff_auth, settings
    ):
        return
    raise HTTPException(status_code=401, detail=UNAUTHORIZED_DETAIL)


async def require_websocket_bff_auth(websocket: WebSocket, settings: Settings) -> bool:
    """Return True when a browser WebSocket is allowed to reach upstream.

    Browsers cannot set arbitrary headers on WebSocket connections, so in
    addition to Authorization/X-BFF-Auth headers this accepts a query token:
    /ws/chat?auth_token=<token>
    """
    if not bff_auth_enabled(settings):
        return True
    if settings.web_require_auth and not _configured_token(settings):
        await websocket.close(code=1011, reason="bff auth misconfigured")
        return False

    authorization = websocket.headers.get("authorization")
    header_token = websocket.headers.get("x-bff-auth")
    query_token = websocket.query_params.get("auth_token") or websocket.query_params.get(
        "token"
    )
    if (
        _token_matches(_bearer_token(authorization), settings)
        or _token_matches(header_token, settings)
        or _token_matches(query_token, settings)
    ):
        return True
    await websocket.close(code=4401, reason="unauthorized")
    return False
