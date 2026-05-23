"""custom_chat Hermes platform adapter — Event Schema v1 over WebSocket."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .config import (
    CustomChatSettings,
    build_outbound_event,
)
from .events.mapping import inbound_to_message_event
from .events.schema import (
    InboundEventError,
    parse_inbound,
)
from .media import (
    synthesize_audio_url,
    transcribe_audio,
    validate_audio_payload,
)
from .state import AdapterState
from .streaming import StreamManager
from .transport.ws_server import WebSocketHub

logger = logging.getLogger(__name__)

try:
    from gateway.config import Platform, PlatformConfig
    from gateway.platforms.base import BasePlatformAdapter, SendResult
except ImportError:

    class Platform:  # type: ignore[no-redef]
        def __init__(self, name: str) -> None:
            self.value = name

    class PlatformConfig:  # type: ignore[no-redef]
        def __init__(self, extra: Optional[dict] = None) -> None:
            self.extra = extra or {}

    class SendResult:  # type: ignore[no-redef]
        def __init__(
            self,
            success: bool = True,
            message_id: Optional[str] = None,
            error: Optional[str] = None,
            raw_response: Any = None,
            retryable: bool = False,
            continuation_message_ids: tuple = (),
        ) -> None:
            self.success = success
            self.message_id = message_id
            self.error = error
            self.raw_response = raw_response
            self.retryable = retryable
            self.continuation_message_ids = continuation_message_ids

    class BasePlatformAdapter:  # type: ignore[no-redef]
        def __init__(self, config: PlatformConfig, platform: Platform) -> None:
            self.config = config
            self.platform = platform
            self._running = False
            self._connected = False

        def _mark_connected(self) -> None:
            self._connected = True
            self._running = True

        def _mark_disconnected(self) -> None:
            self._connected = False
            self._running = False

        async def handle_message(self, event: Any) -> None:
            handler = getattr(self, "_message_handler", None)
            if handler:
                await handler(event)

        def build_source(
            self,
            chat_id: str,
            chat_name: Optional[str] = None,
            chat_type: str = "dm",
            user_id: Optional[str] = None,
            user_name: Optional[str] = None,
            thread_id: Optional[str] = None,
            message_id: Optional[str] = None,
        ) -> Any:
            from dataclasses import dataclass

            @dataclass
            class _SessionSource:
                platform: Any
                chat_id: str
                chat_name: Optional[str] = None
                chat_type: str = "dm"
                user_id: Optional[str] = None
                user_name: Optional[str] = None
                thread_id: Optional[str] = None
                message_id: Optional[str] = None

            return _SessionSource(
                platform=self.platform,
                chat_id=str(chat_id),
                chat_name=chat_name,
                chat_type=chat_type,
                user_id=str(user_id) if user_id else None,
                user_name=user_name,
                thread_id=str(thread_id) if thread_id else None,
                message_id=str(message_id) if message_id else None,
            )


class CustomChatAdapter(BasePlatformAdapter):
  def __init__(self, config: PlatformConfig):
    super().__init__(config, Platform("custom_chat"))
    extra = getattr(config, "extra", None) or {}
    self.settings = CustomChatSettings.from_env_and_extra(extra)
    self.state = AdapterState(
      dedupe_ttl_seconds=self.settings.dedupe_ttl_seconds,
      rate_limit_per_minute=self.settings.rate_limit_per_minute,
    )
    self.streams = StreamManager()
    self._hub: Optional[WebSocketHub] = None
    self._reply_routes: Dict[str, Dict[str, str]] = {}
    self._ws_by_chat: Dict[str, Any] = {}
    self._use_streaming = True
    # confirm_id -> session_key mapping for interactive slash confirmations
    self._slash_confirm_state: Dict[str, str] = {}
    # approval_id -> session_key mapping for tool/skill extra approvals
    self._approval_state: Dict[str, str] = {}
    # Optional callback the gateway runner sets; falls back to no-op in tests.
    self._gateway_runner: Any = None

  def _now_iso(self) -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

  def _new_event_id(self) -> str:
    return str(uuid.uuid4())

  async def connect(self) -> bool:
    if not self.settings.enabled:
      logger.info("custom_chat disabled in config")
      return False

    self._hub = WebSocketHub(
      self.settings.ws_host,
      self.settings.ws_port,
      on_message=self._on_ws_message,
      authenticate=self._authenticate_ws,
    )
    await self._hub.start()
    self._mark_connected()
    return True

  async def disconnect(self) -> None:
    if self._hub:
      await self._hub.stop()
      self._hub = None
    self._mark_disconnected()

  def _authenticate_ws(self, ws: Any) -> bool:
    if not self.settings.bearer_token:
      return True
    headers = getattr(ws, "request_headers", None) or getattr(ws, "request", None)
    auth = ""
    if headers is not None:
      if hasattr(headers, "get"):
        auth = headers.get("Authorization", "") or headers.get("authorization", "")
      elif hasattr(headers, "headers"):
        auth = headers.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
      token = auth[7:].strip()
      return token == self.settings.bearer_token
    return False

  async def _emit_outbound(
    self,
    *,
    chat_id: str,
    user_id: str,
    event_type: str,
    payload: dict[str, Any],
    thread_id: Optional[str] = None,
    session_id: Optional[str] = None,
    ws: Any = None,
  ) -> dict[str, Any]:
    event = build_outbound_event(
      event_id=self._new_event_id(),
      timestamp=self._now_iso(),
      chat_id=chat_id,
      user_id=user_id,
      event_type=event_type,
      payload=payload,
      thread_id=thread_id,
      session_id=session_id,
    )
    if self._hub:
      target = ws or self._ws_by_chat.get(chat_id)
      if target is not None:
        await self._hub.send_to(target, event)
      else:
        await self._hub.broadcast(event, chat_id=chat_id)
    return event

  async def _emit_error(
    self,
    *,
    chat_id: str,
    user_id: str,
    message_id: str,
    code: str,
    message: str,
    ws: Any = None,
  ) -> None:
    await self._emit_outbound(
      chat_id=chat_id,
      user_id=user_id,
      event_type="assistant_error",
      payload={"message_id": message_id, "code": code, "message": message},
      ws=ws,
    )

  async def _on_ws_message(self, ws: Any, data: dict[str, Any]) -> None:
    if data.get("__parse_error__"):
      await self._emit_error(
        chat_id="unknown",
        user_id="unknown",
        message_id="",
        code="BAD_REQUEST",
        message="invalid JSON",
        ws=ws,
      )
      return

    try:
      envelope, payload_model = parse_inbound(data)
    except InboundEventError as exc:
      await self._emit_error(
        chat_id=data.get("chat_id", "unknown"),
        user_id=data.get("user_id", "unknown"),
        message_id=data.get("payload", {}).get("message_id", ""),
        code=exc.code,
        message=exc.message,
        ws=ws,
      )
      return

    chat_id = envelope.chat_id
    user_id = envelope.user_id
    self._ws_by_chat[chat_id] = ws
    if self._hub:
      self._hub.set_client_context(ws, chat_id=chat_id, user_id=user_id)

    rate_key = f"{chat_id}:{user_id}"
    if not self.state.check_rate_limit(rate_key):
      await self._emit_error(
        chat_id=chat_id,
        user_id=user_id,
        message_id=envelope.payload.get("message_id", ""),
        code="RATE_LIMITED",
        message="rate limit exceeded",
        ws=ws,
      )
      return

    if self.state.is_duplicate(envelope.event_id):
      logger.debug("duplicate event_id %s ignored", envelope.event_id)
      return

    if envelope.type == "message.cancel":
      cancelled = self.state.cancel_stream(payload_model.target_message_id)
      if not cancelled:
        logger.debug("no active stream for %s", payload_model.target_message_id)
      return

    if envelope.type == "button.click":
      await self._handle_button_click(payload_model, chat_id=chat_id, user_id=user_id, ws=ws)
      return

    try:
      source = self.build_source(
        chat_id=envelope.chat_id,
        chat_name=envelope.chat_id,
        chat_type="dm",
        user_id=envelope.user_id,
        user_name=envelope.user_id,
        thread_id=envelope.thread_id or None,
        message_id=getattr(payload_model, "message_id", None),
      )

      if envelope.type == "audio.uploaded":
        validate_audio_payload(payload_model, self.settings)
        transcribed = transcribe_audio(payload_model)
        msg_event = inbound_to_message_event(
          envelope, payload_model, source, transcribed_text=transcribed
        )
      else:
        msg_event = inbound_to_message_event(envelope, payload_model, source)

      reply_id = self._new_event_id()
      self._reply_routes[reply_id] = {
        "chat_id": chat_id,
        "user_id": user_id,
        "thread_id": envelope.thread_id or "",
        "session_id": envelope.session_id or "",
        "inbound_message_id": getattr(payload_model, "message_id", reply_id),
      }
      self.state.register_stream(reply_id)

      if not self._use_streaming:
        await self._emit_outbound(
          chat_id=chat_id,
          user_id=user_id,
          event_type="assistant_start",
          payload={"message_id": reply_id},
          thread_id=envelope.thread_id,
          session_id=envelope.session_id,
          ws=ws,
        )

      setattr(msg_event, "_custom_chat_reply_id", reply_id)
      await self.handle_message(msg_event)

    except InboundEventError as exc:
      await self._emit_error(
        chat_id=chat_id,
        user_id=user_id,
        message_id=envelope.payload.get("message_id", ""),
        code=exc.code,
        message=exc.message,
        ws=ws,
      )
    except Exception as exc:
      logger.exception("custom_chat inbound failed")
      await self._emit_error(
        chat_id=chat_id,
        user_id=user_id,
        message_id=envelope.payload.get("message_id", ""),
        code="INTERNAL_ERROR",
        message=str(exc),
        ws=ws,
      )

  def _route_for_send(self, chat_id: str, metadata: Optional[dict]) -> Dict[str, str]:
    if metadata and metadata.get("reply_id"):
      route = self._reply_routes.get(metadata["reply_id"])
      if route:
        return route
    for rid, route in self._reply_routes.items():
      if route.get("chat_id") == chat_id:
        return route
    return {"chat_id": chat_id, "user_id": "assistant", "thread_id": "", "session_id": ""}

  def supports_draft_streaming(
    self,
    chat_type: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> bool:
    return self._use_streaming

  async def send_draft(
    self,
    chat_id: str,
    draft_id: int,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    _ = draft_id
    meta = metadata or {}
    reply_id = meta.get("reply_id") or meta.get("message_id") or str(draft_id)
    route = self._route_for_send(chat_id, meta)
    if not reply_id:
      reply_id = self._new_event_id()

    session = self.streams.get_or_create(
      reply_id,
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )

    handle = self.state.get_stream(reply_id)
    if handle and handle.cancelled:
      return SendResult(success=False, message_id=reply_id)

    if self.streams.mark_started(reply_id):
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_start",
        payload={"message_id": reply_id},
        thread_id=session.thread_id,
        session_id=session.session_id,
      )

    seq = self.streams.next_sequence(reply_id)
    session.accumulated = content
    await self._emit_outbound(
      chat_id=session.chat_id,
      user_id=session.user_id,
      event_type="assistant_delta",
      payload={"message_id": reply_id, "sequence": seq, "delta": content},
      thread_id=session.thread_id,
      session_id=session.session_id,
    )
    return SendResult(success=True, message_id=reply_id)

  async def send(
    self,
    chat_id: str,
    content: str,
    reply_to: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    _ = reply_to
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    reply_id = meta.get("reply_id") or self._new_event_id()

    handle = self.state.get_stream(reply_id)
    if handle and handle.cancelled:
      self.state.end_stream(reply_id)
      return SendResult(success=False, message_id=reply_id, error="cancelled")

    session = self.streams.get_or_create(
      reply_id,
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
    )

    if not session.started:
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_start",
        payload={"message_id": reply_id},
      )

    if meta.get("audio_response"):
      audio = synthesize_audio_url(content)
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_audio",
        payload={
          "message_id": reply_id,
          "mime_type": audio["mime_type"],
          "url": audio["url"],
        },
      )
    else:
      final = content or session.accumulated
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_done",
        payload={"message_id": reply_id, "final_text": final},
      )

    self.streams.mark_done(reply_id)
    self.streams.remove(reply_id)
    self.state.end_stream(reply_id)
    self._reply_routes.pop(reply_id, None)
    return SendResult(success=True, message_id=reply_id)

  async def send_typing(self, chat_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Emit a typing indicator. Frontend should auto-stop after a short timeout."""
    route = self._route_for_send(chat_id, metadata)
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="typing",
      payload={"state": "start"},
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )

  async def stop_typing(self, chat_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    route = self._route_for_send(chat_id, metadata)
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="typing",
      payload={"state": "stop"},
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )

  async def send_image(
    self,
    chat_id: str,
    image_url: str,
    caption: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Emit an assistant_image event with the given URL and optional caption."""
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    reply_id = meta.get("reply_id") or self._new_event_id()
    payload: dict[str, Any] = {
      "message_id": reply_id,
      "url": image_url,
    }
    if caption:
      payload["caption"] = caption
    mime_type = meta.get("mime_type")
    if mime_type:
      payload["mime_type"] = mime_type
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_image",
      payload=payload,
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )
    return SendResult(success=True, message_id=reply_id)

  async def send_private_notice(
    self,
    chat_id: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Emit an out-of-band notice (system/info bubble, not part of streaming reply)."""
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    notice_id = meta.get("notice_id") or self._new_event_id()
    payload: dict[str, Any] = {
      "message_id": notice_id,
      "text": content,
      "kind": meta.get("kind", "info"),
    }
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_notice",
      payload=payload,
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )
    return SendResult(success=True, message_id=notice_id)

  async def send_slash_confirm(
    self,
    chat_id: str,
    title: str,
    message: str,
    session_key: str,
    confirm_id: str,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Render a three-button slash-command confirmation prompt.

    Mirrors the Telegram adapter contract; button clicks come back as a
    `button.click` inbound event with confirm_id + choice, which is routed
    to GatewayRunner._resolve_slash_confirm.
    """
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    payload = {
      "message_id": confirm_id,
      "confirm_id": confirm_id,
      "title": title,
      "body": message,
      "kind": "slash_confirm",
      "buttons": [
        {"id": "once", "label": "Approve Once", "style": "primary"},
        {"id": "always", "label": "Always Approve", "style": "primary"},
        {"id": "cancel", "label": "Cancel", "style": "danger"},
      ],
    }
    try:
      await self._emit_outbound(
        chat_id=route.get("chat_id", chat_id),
        user_id=route.get("user_id", "assistant"),
        event_type="assistant_buttons",
        payload=payload,
        thread_id=route.get("thread_id") or None,
        session_id=route.get("session_id") or None,
      )
    except Exception as exc:
      logger.warning("send_slash_confirm failed: %s", exc)
      return SendResult(success=False, message_id=confirm_id, error=str(exc))

    self._slash_confirm_state[confirm_id] = session_key
    return SendResult(success=True, message_id=confirm_id)

  async def _handle_button_click(
    self,
    payload_model: Any,
    *,
    chat_id: str,
    user_id: str,
    ws: Any,
  ) -> None:
    """Route an inbound button.click to the gateway runner."""
    confirm_id = getattr(payload_model, "confirm_id", None) or getattr(
      payload_model, "message_id", ""
    )
    choice = getattr(payload_model, "choice", None) or getattr(
      payload_model, "button_id", ""
    )
    if not confirm_id or not choice:
      await self._emit_error(
        chat_id=chat_id,
        user_id=user_id,
        message_id=getattr(payload_model, "message_id", ""),
        code="BAD_REQUEST",
        message="button.click requires confirm_id and choice",
        ws=ws,
      )
      return

    runner = self._resolve_runner()
    if confirm_id in self._slash_confirm_state:
      session_key = self._slash_confirm_state.pop(confirm_id, None)
      resolver = getattr(runner, "_resolve_slash_confirm", None) if runner else None
      if resolver is not None:
        try:
          result = resolver(confirm_id, choice)
          if asyncio.iscoroutine(result):
            await result
        except Exception:
          logger.exception("slash_confirm resolver failed")
      else:
        logger.debug(
          "no gateway runner attached; dropping slash_confirm %s (session=%s)",
          confirm_id,
          session_key,
        )
      return

    if confirm_id in self._approval_state:
      session_key = self._approval_state.pop(confirm_id, None)
      if runner is not None and session_key:
        try:
          from tools.approval import resolve_gateway_approval  # type: ignore
          resolve_gateway_approval(session_key, choice)
        except Exception:
          logger.exception("approval resolver failed")
      return

    logger.debug("button.click for unknown confirm_id %s", confirm_id)

  def _resolve_runner(self) -> Any:
    """Look up the gateway runner via the message handler closure (Telegram pattern)."""
    if self._gateway_runner is not None:
      return self._gateway_runner
    handler = getattr(self, "_message_handler", None)
    return getattr(handler, "__self__", None)

  async def interrupt_session_activity(self, chat_id: str) -> None:
    """Cancel any active streams for this chat and emit assistant_done(interrupted=True)."""
    affected: list[str] = []
    for reply_id, route in list(self._reply_routes.items()):
      if route.get("chat_id") != chat_id:
        continue
      self.state.cancel_stream(reply_id)
      affected.append(reply_id)

    for reply_id in affected:
      route = self._reply_routes.get(reply_id, {})
      try:
        await self._emit_outbound(
          chat_id=route.get("chat_id", chat_id),
          user_id=route.get("user_id", "assistant"),
          event_type="assistant_done",
          payload={"message_id": reply_id, "final_text": "", "interrupted": True},
          thread_id=route.get("thread_id") or None,
          session_id=route.get("session_id") or None,
        )
      except Exception:
        logger.exception("interrupt emit failed for %s", reply_id)
      self.streams.remove(reply_id)
      self.state.end_stream(reply_id)
      self._reply_routes.pop(reply_id, None)

  async def get_chat_info(self, chat_id: str) -> dict:
    return {"name": chat_id, "type": "dm"}


def check_requirements() -> bool:
  token = os.getenv("CUSTOM_CHAT_BEARER_TOKEN", "").strip()
  return bool(token)


def validate_config(config: Any) -> bool:
  extra = getattr(config, "extra", {}) or {}
  if extra.get("enabled"):
    return bool(os.getenv("CUSTOM_CHAT_BEARER_TOKEN") or extra.get("bearer_token"))
  return True


def _env_enablement() -> dict | None:
  token = os.getenv("CUSTOM_CHAT_BEARER_TOKEN", "").strip()
  if not token:
    return None
  seed: dict[str, Any] = {
    "bearer_token": token,
    "enabled": True,
  }
  host = os.getenv("CUSTOM_CHAT_WS_HOST", "").strip()
  if host:
    seed["ws_host"] = host
  port = os.getenv("CUSTOM_CHAT_WS_PORT", "").strip()
  if port:
    seed["ws_port"] = int(port)
  home = os.getenv("CUSTOM_CHAT_HOME_CHANNEL", "").strip()
  if home:
    seed["home_channel"] = {
      "chat_id": home,
      "name": os.getenv("CUSTOM_CHAT_HOME_CHANNEL_NAME", "Home"),
    }
  return seed


def _apply_yaml_config(yaml_cfg: dict, platform_cfg: dict) -> dict | None:
  """Translate config.yaml `custom_chat:` keys into env vars."""
  if "ws_host" in platform_cfg and not os.getenv("CUSTOM_CHAT_WS_HOST"):
    os.environ["CUSTOM_CHAT_WS_HOST"] = str(platform_cfg["ws_host"])
  if "ws_port" in platform_cfg and not os.getenv("CUSTOM_CHAT_WS_PORT"):
    os.environ["CUSTOM_CHAT_WS_PORT"] = str(platform_cfg["ws_port"])
  allowed = platform_cfg.get("allowed_users")
  if allowed is not None and not os.getenv("CUSTOM_CHAT_ALLOWED_USERS"):
    if isinstance(allowed, list):
      allowed = ",".join(str(v) for v in allowed)
    os.environ["CUSTOM_CHAT_ALLOWED_USERS"] = str(allowed)
  if "allow_all_users" in platform_cfg and not os.getenv("CUSTOM_CHAT_ALLOW_ALL_USERS"):
    os.environ["CUSTOM_CHAT_ALLOW_ALL_USERS"] = str(
      platform_cfg["allow_all_users"]
    ).lower()
  if "home_channel" in platform_cfg and not os.getenv("CUSTOM_CHAT_HOME_CHANNEL"):
    os.environ["CUSTOM_CHAT_HOME_CHANNEL"] = str(platform_cfg["home_channel"])
  return None


def register(ctx: Any) -> None:
  kwargs: dict[str, Any] = {
    "name": "custom_chat",
    "label": "Custom Chat",
    "adapter_factory": lambda cfg: CustomChatAdapter(cfg),
    "check_fn": check_requirements,
    "validate_config": validate_config,
    "env_enablement_fn": _env_enablement,
    "apply_yaml_config_fn": _apply_yaml_config,
    "cron_deliver_env_var": "CUSTOM_CHAT_HOME_CHANNEL",
    "allowed_users_env": "CUSTOM_CHAT_ALLOWED_USERS",
    "allow_all_env": "CUSTOM_CHAT_ALLOW_ALL_USERS",
    "max_message_length": 0,
    "platform_hint": (
      "You are chatting via a custom WebSocket client (Event Schema v1). "
      "Supports streaming deltas, slash commands, interactive button "
      "confirmations, and audio uploads."
    ),
    "emoji": "💬",
  }
  # Older Hermes versions reject kwargs they don't know. Retry-with-trim
  # so the plugin still loads on those installs without changing semantics
  # for newer ones.
  while True:
    try:
      ctx.register_platform(**kwargs)
      return
    except TypeError as exc:
      msg = str(exc)
      dropped = False
      for key in list(kwargs.keys()):
        if key in {"name", "label", "adapter_factory", "check_fn"}:
          continue
        if f"'{key}'" in msg:
          kwargs.pop(key)
          logger.warning("register_platform: dropping unsupported kwarg %s", key)
          dropped = True
          break
      if not dropped:
        raise
