"""custom_chat Hermes platform adapter — Event Schema v1 over WebSocket."""

from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse

import yaml

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
    cleanup_synthesized_audio,
    extract_local_paths,
    guess_mime_type,
    is_local_reference,
    publish_local_file,
    resolve_local_path,
    strip_local_paths,
    synthesize_audio_url,
    transcribe_attachment,
    transcribe_audio,
    validate_audio_payload,
    validate_file_payload,
    validate_message_attachment,
)
from .state import AdapterState
from .streaming import StreamManager
from .transport.ws_server import WebSocketHub

logger = logging.getLogger(__name__)

REASONING_PREFIX = "💭 Reasoning:"
# When Hermes streams thinking before the final reply, the tail after the last blank
# line is treated as the user-facing answer if it is clearly shorter than the head.
_REASONING_ANSWER_SPLIT_MAX_TAIL_CHARS = 2000
_REASONING_ANSWER_SPLIT_MAX_TAIL_RATIO = 0.45
# Hermes tool-progress lines: ``{emoji} {tool_name}: "preview"`` or ``{emoji} {tool_name}...``
_TOOL_PROGRESS_LINE_RE = re.compile(
  r"^[\s]*[^\w\s]{1,4}\s+[\w.-]+(?::\s[\"'].+[\"']|\.\.\.|\([^)]*\))?(?:\s*\(×\d+\))?$"
)

def _normalize_tool_status(value: Any) -> Optional[str]:
  status = str(value or "").strip().lower()
  if status in {"running", "pending", "started", "starting"}:
    return "running"
  if status in {"success", "done", "completed", "complete", "ok"}:
    return "success"
  if status in {"error", "failed", "failure", "timeout"}:
    return "error"
  if status in {"idle", "stale"}:
    return "idle"
  return None


def _apply_tool_notice_metadata(payload: Dict[str, Any], meta: Dict[str, Any]) -> None:
  if meta.get("tool_name"):
    payload["tool_name"] = str(meta["tool_name"])
  status = _normalize_tool_status(meta.get("status"))
  if status:
    payload["status"] = status
  elif meta.get("error") is not None:
    payload["status"] = "error"
  elif meta.get("result") is not None:
    payload["status"] = "success"
  if meta.get("args") is not None:
    payload["args"] = meta["args"] if isinstance(meta["args"], str) else str(meta["args"])
  if meta.get("result") is not None:
    payload["result"] = meta["result"] if isinstance(meta["result"], str) else str(meta["result"])
  if meta.get("duration_ms") is not None:
    payload["duration_ms"] = int(meta["duration_ms"])
  if meta.get("error") is not None:
    payload["error"] = str(meta["error"])

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
    # chat_id -> interactive /model picker state (Telegram parity)
    self._model_picker_state: Dict[str, dict[str, Any]] = {}
    self._MODEL_PAGE_SIZE = 8
    # Optional callback the gateway runner sets; falls back to no-op in tests.
    self._gateway_runner: Any = None
    # The gateway's generic typing loop may tick once or more after the final
    # reply was already emitted. custom_chat typing is explicit state, so late
    # starts must be ignored until a new inbound turn opens the chat again.
    self._typing_closed_chats: set[str] = set()
    # message_ids of in-flight tool-progress notice bubbles (editable)
    self._tool_progress_ids: set[str] = set()
    # Latest web BFF media base URL from client.register (overrides env when set).
    self._registered_media_base_url: str = ""
    # Temp dirs for inbound attachments materialized from the BFF media API.
    self._temp_media_dirs: set[Path] = set()
    self._show_reasoning_cache: tuple[Path, float, bool] | None = None

  def _effective_media_base_url(self) -> str | None:
    registered = self._registered_media_base_url.strip().rstrip("/")
    if registered:
      return registered
    configured = self.settings.media_public_base_url.strip().rstrip("/")
    return configured or None

  async def _handle_client_register(self, ws: Any, data: dict[str, Any]) -> None:
    from custom_chat_schema.schema import ClientRegisterPayload

    try:
      payload = ClientRegisterPayload.model_validate(data.get("payload") or {})
    except Exception as exc:
      logger.warning("client.register rejected: %s", exc)
      await self._emit_error(
        chat_id=data.get("chat_id", "unknown"),
        user_id=data.get("user_id", "unknown"),
        message_id="",
        code="BAD_REQUEST",
        message="invalid client.register payload",
        ws=ws,
      )
      return
    self._registered_media_base_url = payload.public_media_base_url
    logger.info(
      "client.register: media base %s (kind=%s)",
      payload.public_media_base_url,
      payload.client_kind,
    )

  def _now_iso(self) -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

  def _new_event_id(self) -> str:
    return str(uuid.uuid4())

  def _open_typing_for_chat(self, chat_id: str) -> None:
    self._typing_closed_chats.discard(chat_id)

  def _close_typing_for_chat(self, chat_id: str) -> None:
    self._typing_closed_chats.add(chat_id)

  def _bind_ws_for_chat(self, ws: Any, chat_id: str, user_id: str) -> None:
    """Track the active socket for a chat.

    The web BFF multiplexes every chat over one upstream WebSocket. Rebind
    all known chats to the current socket when only one client is connected
    so background events (e.g. auto-title ``session_meta``) still reach the UI.
    """
    self._ws_by_chat[chat_id] = ws
    if self._hub and len(self._hub.clients) <= 1:
      for cid in list(self._ws_by_chat.keys()):
        self._ws_by_chat[cid] = ws
    if self._hub:
      self._hub.set_client_context(ws, chat_id=chat_id, user_id=user_id)

  async def _resolve_outbound_media_url(
    self,
    media_url: str,
    *,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> tuple[str, Dict[str, Any]]:
    meta = dict(metadata or {})
    if not is_local_reference(media_url):
      return media_url, meta
    path = resolve_local_path(media_url)
    base_url = self._effective_media_base_url()
    published = await publish_local_file(
      path, self.settings, media_base_url=base_url
    )
    meta.setdefault("mime_type", published.get("mime_type"))
    if published.get("size_bytes") is not None:
      meta.setdefault("size_bytes", int(published["size_bytes"]))
    return str(published["url"]), meta

  async def _emit_embedded_attachments(
    self,
    *,
    chat_id: str,
    user_id: str,
    content: str,
    meta: Dict[str, Any],
    thread_id: Optional[str],
    session_id: Optional[str],
  ) -> str:
    """Publish local paths embedded in *content*; return text without those paths."""
    paths = extract_local_paths(content)
    if not paths:
      return content
    for path in paths:
      path_ref = str(path)
      file_meta = dict(meta)
      try:
        url, file_meta = await self._resolve_outbound_media_url(
          path_ref, metadata=file_meta
        )
      except InboundEventError as exc:
        logger.warning("embedded attachment %s: %s", path_ref, exc.message)
        continue
      kind_mime = guess_mime_type(path)
      payload_mime = str(file_meta.get("mime_type") or kind_mime)
      attachment_id = self._new_event_id()
      if kind_mime.startswith("image/"):
        payload: dict[str, Any] = {
          "message_id": attachment_id,
          "url": url,
          "mime_type": payload_mime,
        }
        event_type = "assistant_image"
      else:
        payload = {
          "message_id": attachment_id,
          "filename": path.name,
          "url": url,
          "mime_type": payload_mime,
        }
        if file_meta.get("size_bytes") is not None:
          payload["size_bytes"] = int(file_meta["size_bytes"])
        event_type = "assistant_file"
      await self._emit_outbound(
        chat_id=chat_id,
        user_id=user_id,
        event_type=event_type,
        payload=payload,
        thread_id=thread_id,
        session_id=session_id,
      )
    return strip_local_paths(content, paths)

  async def connect(self, is_reconnect: bool = False) -> bool:
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
    for tmp_dir in list(self._temp_media_dirs):
      shutil.rmtree(tmp_dir, ignore_errors=True)
      self._temp_media_dirs.discard(tmp_dir)
    self._mark_disconnected()

  @staticmethod
  def _attachment_ref(attachment: Any) -> str:
    return str(getattr(attachment, "file_ref", None) or getattr(attachment, "url", "") or "").strip()

  def _attachment_download_url(self, ref: str) -> str:
    stripped = ref.strip()
    if not stripped:
      raise InboundEventError("BAD_REQUEST", "attachment reference is empty")
    if stripped.startswith("/api/v1/media/"):
      base_url = self._effective_media_base_url()
      if base_url:
        return urljoin(f"{base_url.rstrip('/')}/", stripped.lstrip("/"))
      return stripped
    parsed = urlparse(stripped)
    if parsed.scheme in {"http", "https"}:
      if parsed.path.startswith("/api/v1/media/"):
        base_url = self._effective_media_base_url()
        if base_url:
          return urljoin(
            f"{base_url.rstrip('/')}/",
            f"{parsed.path.lstrip('/')}{f'?{parsed.query}' if parsed.query else ''}",
          )
      return stripped
    raise InboundEventError(
      "BAD_REQUEST",
      f"unsupported attachment reference: {stripped}",
    )

  @staticmethod
  def _attachment_download_name(attachment: Any, ref: str) -> str:
    filename = Path(str(getattr(attachment, "filename", "") or "")).name
    if filename:
      return filename
    parsed = urlparse(ref)
    from_ref = Path(parsed.path).name
    if from_ref:
      return from_ref
    mime_type = str(getattr(attachment, "mime_type", "") or "").split(";", 1)[0]
    suffix = mimetypes.guess_extension(mime_type) or ""
    attachment_id = str(getattr(attachment, "attachment_id", "attachment") or "attachment")
    return f"{attachment_id}{suffix}"

  def _materialize_message_attachment(self, attachment: Any) -> None:
    ref = self._attachment_ref(attachment)
    if not ref:
      return
    if is_local_reference(ref):
      local_path = str(resolve_local_path(ref))
      attachment.file_ref = local_path
      attachment.url = local_path
      return

    download_url = self._attachment_download_url(ref)
    tmp_dir = Path(tempfile.mkdtemp(prefix="custom_chat_inbound_"))
    target = tmp_dir / self._attachment_download_name(attachment, download_url)
    req = urllib_request.Request(download_url)
    try:
      with urllib_request.urlopen(req, timeout=30) as resp:
        target.write_bytes(resp.read())
    except (HTTPError, URLError, OSError, TimeoutError) as exc:
      shutil.rmtree(tmp_dir, ignore_errors=True)
      raise InboundEventError(
        "BAD_REQUEST",
        f"could not download attachment: {exc}",
      ) from exc

    self._temp_media_dirs.add(tmp_dir)
    local_path = str(target)
    attachment.file_ref = local_path
    attachment.url = local_path

  def _normalize_message_create_attachments(self, attachments: list[Any]) -> None:
    for attachment in attachments:
      validate_message_attachment(attachment, self.settings)
      mime_type = str(getattr(attachment, "mime_type", "") or "")
      if not mime_type.startswith("image/"):
        continue
      ref = self._attachment_ref(attachment)
      if not ref:
        continue
      try:
        self._materialize_message_attachment(attachment)
      except InboundEventError as exc:
        logger.warning(
          "message.create attachment %s not materialized: %s",
          getattr(attachment, "attachment_id", "<unknown>"),
          exc.message,
        )

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
      if event_type == "session_meta":
        # The web BFF uses one upstream socket for all chats; the client
        # routes by envelope chat_id. Never filter session_meta by the
        # per-socket client_context chat_id (stale after chat switches).
        await self._hub.broadcast(event, all_clients=True)
      else:
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

    if data.get("type") == "client.register":
      await self._handle_client_register(ws, data)
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
    self._open_typing_for_chat(chat_id)
    self._bind_ws_for_chat(ws, chat_id, user_id)

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
      reply_id = self._resolve_cancel_reply_id(payload_model.target_message_id)
      self._close_typing_for_chat(chat_id)
      await self.stop_typing(chat_id)
      if reply_id is None:
        logger.debug(
          "no active stream for %s", payload_model.target_message_id
        )
        return
      await self._cancel_reply_streams(
        [reply_id],
        chat_id=chat_id,
        ws=ws,
      )
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

      if envelope.type in {"audio.uploaded", "file.uploaded"}:
        validate_file_payload(payload_model, self.settings)
        transcribed: Optional[str] = None
        if envelope.type == "audio.uploaded":
          validate_audio_payload(payload_model, self.settings)
          transcribed = transcribe_audio(payload_model)
        elif payload_model.mime_type.startswith("audio/"):
          transcribed = transcribe_audio(payload_model)
        msg_event = inbound_to_message_event(
          envelope, payload_model, source, transcribed_text=transcribed
        )
      elif envelope.type == "message.create" and getattr(
        payload_model, "attachments", None
      ):
        attachments = payload_model.attachments
        self._normalize_message_create_attachments(attachments)
        transcribed = None
        if not payload_model.text.strip() and len(attachments) == 1:
          transcribed = transcribe_attachment(attachments[0])
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

  @staticmethod
  def _looks_like_tool_progress(content: str) -> bool:
    text = (content or "").strip()
    if not text:
      return False
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
      return False
    # Verbose progress may append a JSON args line after the tool header.
    if _TOOL_PROGRESS_LINE_RE.match(lines[0]):
      if len(lines) == 1:
        return True
      rest = lines[1:]
      return all(
        line.startswith("{")
        or line.startswith("[")
        or _TOOL_PROGRESS_LINE_RE.match(line)
        for line in rest
      )
    return all(_TOOL_PROGRESS_LINE_RE.match(line) for line in lines)

  def _active_reply_id_for_chat(self, chat_id: str) -> Optional[str]:
    for reply_id, route in self._reply_routes.items():
      if route.get("chat_id") != chat_id:
        continue
      session = self.streams._sessions.get(reply_id)
      if session and not session.done:
        return reply_id
    for reply_id, route in self._reply_routes.items():
      if route.get("chat_id") == chat_id:
        return reply_id
    return None

  @staticmethod
  def _compute_incremental_delta(previous: str, content: str) -> tuple[str, str]:
    if content.startswith(previous):
      return content[len(previous) :], content
    return content, previous + content

  @staticmethod
  def _split_reasoning_answer(reasoning_meta: str, answer: str) -> tuple[str, str]:
    """Merge metadata reasoning with streamed thinking; isolate the final reply."""
    meta = reasoning_meta.strip()
    body = (answer or "").strip()
    if not meta:
      return "", body
    if not body:
      return meta, ""
    if "\n\n" not in body:
      return meta, body
    head, tail = body.rsplit("\n\n", 1)
    tail = tail.strip()
    head = head.strip()
    if not tail:
      return meta, body
    if len(tail) > _REASONING_ANSWER_SPLIT_MAX_TAIL_CHARS:
      return meta, body
    if len(tail) > max(len(head), 1) * _REASONING_ANSWER_SPLIT_MAX_TAIL_RATIO:
      return meta, body
    combined = f"{meta}\n\n{head}".strip() if head else meta
    return combined, tail

  @staticmethod
  def _prepend_reasoning(final: str, meta: Dict[str, Any]) -> str:
    reasoning = meta.get("reasoning")
    if not reasoning or not str(reasoning).strip():
      return final
    text = final or ""
    if REASONING_PREFIX in text:
      return text
    block = f"{REASONING_PREFIX}\n{str(reasoning).strip()}\n\n"
    return f"{block}{text}" if text else block.rstrip()

  @staticmethod
  def _env_bool(name: str) -> Optional[bool]:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
      return None
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}

  @staticmethod
  def _hermes_config_path() -> Path:
    explicit_path = os.getenv("HERMES_CONFIG_PATH")
    if explicit_path and explicit_path.strip():
      return Path(explicit_path).expanduser()
    hermes_home = os.getenv("HERMES_HOME") or "~/.hermes"
    return Path(hermes_home).expanduser() / "config.yaml"

  def _show_reasoning_enabled(self) -> bool:
    forced = self._env_bool("CUSTOM_CHAT_SHOW_REASONING")
    if forced is not None:
      return forced

    cfg_path = self._hermes_config_path()
    try:
      mtime = cfg_path.stat().st_mtime
    except OSError:
      self._show_reasoning_cache = (cfg_path, -1.0, False)
      return False

    cached = self._show_reasoning_cache
    if cached and cached[0] == cfg_path and cached[1] == mtime:
      return cached[2]

    try:
      cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    except Exception:
      self._show_reasoning_cache = (cfg_path, mtime, False)
      return False

    try:
      from gateway.display_config import resolve_display_setting

      enabled = bool(resolve_display_setting(cfg, "custom_chat", "show_reasoning", False))
    except Exception:
      display = cfg.get("display") if isinstance(cfg, dict) else {}
      if not isinstance(display, dict):
        self._show_reasoning_cache = (cfg_path, mtime, False)
        return False
      value = display.get("show_reasoning")
      if isinstance(value, str):
        enabled = value.strip().lower() in {"1", "true", "yes", "on"}
      else:
        enabled = bool(value)
    self._show_reasoning_cache = (cfg_path, mtime, enabled)
    return enabled

  def _visible_draft_text(self, text: str, meta: Dict[str, Any]) -> str:
    """Hide streamed reasoning text until a final answer is separable."""
    if self._show_reasoning_enabled():
      return text
    if REASONING_PREFIX not in text and not meta.get("reasoning"):
      return text
    split_source = text
    if REASONING_PREFIX in split_source:
      split_source = split_source.split(REASONING_PREFIX, 1)[1].strip()
    reasoning_meta = str(meta.get("reasoning") or "").strip()
    if reasoning_meta and "\n\n" in split_source:
      _head, tail = split_source.rsplit("\n\n", 1)
      if tail.strip():
        return tail.strip()
    reasoning_text, answer_text = self._split_reasoning_answer(
      reasoning_meta,
      split_source,
    )
    if not answer_text:
      return ""
    if answer_text == split_source:
      return "" if REASONING_PREFIX in text or reasoning_meta else text
    return answer_text

  @staticmethod
  def _segment_label(meta: Dict[str, Any]) -> Optional[str]:
    label = meta.get("label") or meta.get("segment_label")
    if label:
      return str(label)
    tool_name = meta.get("tool_name")
    if tool_name:
      return f"🔧 {tool_name}"
    return None

  async def _emit_segment_boundary(
    self,
    *,
    session: Any,
    reply_id: str,
    new_line_id: str,
    label: Optional[str],
  ) -> None:
    payload: dict[str, Any] = {
      "message_id": reply_id,
      "segment_message_id": new_line_id,
    }
    if label:
      payload["label"] = label
    await self._emit_outbound(
      chat_id=session.chat_id,
      user_id=session.user_id,
      event_type="assistant_segment",
      payload=payload,
      thread_id=session.thread_id,
      session_id=session.session_id,
    )
    await self._emit_outbound(
      chat_id=session.chat_id,
      user_id=session.user_id,
      event_type="assistant_start",
      payload={"message_id": new_line_id, "turn_message_id": reply_id},
      thread_id=session.thread_id,
      session_id=session.session_id,
    )

  async def send_draft(
    self,
    chat_id: str,
    draft_id: int,
    content: Optional[str],
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

    text = "" if content is None else str(content)
    if text:
      text = self._visible_draft_text(text, meta)
    is_segment_boundary = (
      meta.get("new_segment")
      or content is None
      or (text == "" and session.started)
    )

    if is_segment_boundary:
      if not session.started:
        return SendResult(success=True, message_id=reply_id)
      _, new_line_id = self.streams.begin_segment(reply_id)
      await self._emit_segment_boundary(
        session=session,
        reply_id=reply_id,
        new_line_id=new_line_id,
        label=self._segment_label(meta),
      )
      return SendResult(success=True, message_id=new_line_id)

    if not text:
      return SendResult(success=True, message_id=session.active_line_id or reply_id)

    line_id = session.active_line_id or reply_id

    if self.streams.mark_started(reply_id):
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_start",
        payload={"message_id": line_id, "turn_message_id": reply_id},
        thread_id=session.thread_id,
        session_id=session.session_id,
      )

    delta, accumulated = self._compute_incremental_delta(session.accumulated, text)
    session.accumulated = accumulated
    if not delta:
      return SendResult(success=True, message_id=line_id)

    seq = self.streams.next_sequence(reply_id)
    await self._emit_outbound(
      chat_id=session.chat_id,
      user_id=session.user_id,
      event_type="assistant_delta",
      payload={"message_id": line_id, "sequence": seq, "delta": delta},
      thread_id=session.thread_id,
      session_id=session.session_id,
    )
    return SendResult(success=True, message_id=line_id)

  async def _send_tool_progress(
    self,
    chat_id: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
    *,
    message_id: Optional[str] = None,
  ) -> SendResult:
    """Tool-progress bubble from gateway ``send_progress_messages`` (editable in-place)."""
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    notice_id = message_id or meta.get("notice_id") or self._new_event_id()
    payload: dict[str, Any] = {
      "message_id": notice_id,
      "text": content,
      "kind": "tool",
    }
    _apply_tool_notice_metadata(payload, meta)
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_notice",
      payload=payload,
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )
    self._tool_progress_ids.add(notice_id)
    return SendResult(success=True, message_id=notice_id)

  async def send(
    self,
    chat_id: str,
    content: str,
    reply_to: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    _ = reply_to
    meta = metadata or {}
    notice_kind = meta.get("kind")
    if notice_kind == "reasoning" and not self._show_reasoning_enabled():
      return SendResult(success=True, message_id=str(meta.get("notice_id") or self._new_event_id()))
    if notice_kind in {"tool", "reasoning"} or meta.get("is_tool_status"):
      return await self.send_private_notice(
        chat_id,
        content,
        metadata={**meta, "kind": notice_kind or "tool"},
      )

    reply_id = meta.get("reply_id")
    if reply_id is None:
      if self._looks_like_tool_progress(content):
        return await self._send_tool_progress(chat_id, content, metadata=meta)
      route = self._route_for_send(chat_id, meta)
      reply_id = self._active_reply_id_for_chat(route.get("chat_id", chat_id))
      if reply_id is None:
        reply_id = self._new_event_id()
      meta = {**meta, "reply_id": reply_id}

    route = self._route_for_send(chat_id, meta)
    reply_id = str(meta.get("reply_id") or reply_id)

    handle = self.state.get_stream(reply_id)
    if handle and handle.cancelled:
      self.state.end_stream(reply_id)
      return SendResult(success=False, message_id=reply_id, error="cancelled")

    session = self.streams.get_or_create(
      reply_id,
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
    )
    line_id = session.active_line_id or reply_id
    audio_response = bool(meta.get("audio_response"))

    if not audio_response and not session.started:
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_start",
        payload={"message_id": line_id, "turn_message_id": reply_id},
      )

    if audio_response:
      audio: dict[str, Any] = {}
      try:
        audio = await asyncio.to_thread(synthesize_audio_url, content, self.settings)
        audio_url, audio_meta = await self._resolve_outbound_media_url(
          str(audio["url"]), metadata=audio
        )
      except InboundEventError as exc:
        logger.warning("audio_response publish failed: %s", exc.message)
        await self._cleanup_reply_state(session, reply_id)
        return SendResult(success=False, message_id=reply_id, error=exc.message)
      except Exception as exc:
        logger.warning("audio_response TTS failed: %s", exc)
        await self._cleanup_reply_state(session, reply_id)
        return SendResult(success=False, message_id=reply_id, error=str(exc))
      finally:
        cleanup_synthesized_audio(audio)
      payload: dict[str, Any] = {
        "message_id": reply_id,
        "mime_type": str(audio_meta.get("mime_type") or audio["mime_type"]),
        "url": audio_url,
      }
      if audio_meta.get("size_bytes") is not None:
        payload["size_bytes"] = int(audio_meta["size_bytes"])
      if audio_meta.get("filename"):
        payload["filename"] = str(audio_meta["filename"])
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_audio",
        payload=payload,
      )
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_done",
        payload={
          "message_id": reply_id,
          "final_text": "",
          "turn_message_id": reply_id,
        },
      )
    else:
      answer = (content or session.accumulated or "").strip()
      reasoning_raw = meta.get("reasoning")
      reasoning_meta = str(reasoning_raw).strip() if reasoning_raw else ""
      show_reasoning = self._show_reasoning_enabled()
      reasoning_text: Optional[str] = None
      answer_text = answer
      if reasoning_meta:
        split_source = answer
        if REASONING_PREFIX in split_source:
          split_source = split_source.split(REASONING_PREFIX, 1)[1].strip()
        reasoning_text, answer_text = self._split_reasoning_answer(
          reasoning_meta, split_source
        )
        final = answer_text or answer
      else:
        final = answer
      stripped = (final or "").strip()
      if stripped and is_local_reference(stripped):
        path = resolve_local_path(stripped)
        if path.is_file():
          self._close_typing_for_chat(session.chat_id)
          await self.stop_typing(session.chat_id)
          self.streams.mark_done(reply_id)
          self.streams.remove(reply_id)
          self.state.end_stream(reply_id)
          self._reply_routes.pop(reply_id, None)
          mime = guess_mime_type(path)
          attachment_meta = {**meta, "reply_id": reply_id}
          if mime.startswith("image/"):
            return await self.send_image(
              chat_id, stripped, metadata=attachment_meta
            )
          return await self.send_file(
            chat_id, stripped, path.name, metadata=attachment_meta
          )
      final = await self._emit_embedded_attachments(
        chat_id=session.chat_id,
        user_id=session.user_id,
        content=final or "",
        meta=meta,
        thread_id=route.get("thread_id") or None,
        session_id=route.get("session_id") or None,
      )
      done_payload: dict[str, Any] = {
        "message_id": line_id,
        "final_text": final,
        "turn_message_id": reply_id,
      }
      if show_reasoning and reasoning_text:
        done_payload["reasoning_text"] = reasoning_text
      if session.segment_index > 0:
        done_payload["segments"] = session.segment_index + 1
      await self._emit_outbound(
        chat_id=session.chat_id,
        user_id=session.user_id,
        event_type="assistant_done",
        payload=done_payload,
      )

    await self._cleanup_reply_state(session, reply_id)
    return SendResult(success=True, message_id=reply_id)

  async def _cleanup_reply_state(self, session: Any, reply_id: str) -> None:
    self._close_typing_for_chat(session.chat_id)
    await self.stop_typing(session.chat_id)
    self.streams.mark_done(reply_id)
    self.streams.remove(reply_id)
    self.state.end_stream(reply_id)
    self._reply_routes.pop(reply_id, None)

  async def send_typing(self, chat_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Emit a typing indicator. Frontend should auto-stop after a short timeout."""
    route = self._route_for_send(chat_id, metadata)
    routed_chat_id = route.get("chat_id", chat_id)
    if routed_chat_id in self._typing_closed_chats:
      return
    await self._emit_outbound(
      chat_id=routed_chat_id,
      user_id=route.get("user_id", "assistant"),
      event_type="typing",
      payload={"state": "start"},
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )

  async def stop_typing(self, chat_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    route = self._route_for_send(chat_id, metadata)
    routed_chat_id = route.get("chat_id", chat_id)
    await self._emit_outbound(
      chat_id=routed_chat_id,
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
    try:
      image_url, meta = await self._resolve_outbound_media_url(image_url, metadata=meta)
    except InboundEventError as exc:
      logger.warning("send_image: %s", exc.message)
      return SendResult(success=False, message_id=reply_id, error=exc.message)
    payload: dict[str, Any] = {
      "message_id": reply_id,
      "url": image_url,
    }
    if caption:
      payload["caption"] = caption
    mime_type = meta.get("mime_type")
    if not mime_type:
      guessed = guess_mime_type(Path(urlparse(image_url).path))
      mime_type = guessed if str(guessed).startswith("image/") else "image/png"
    payload["mime_type"] = str(mime_type)
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_image",
      payload=payload,
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )
    return SendResult(success=True, message_id=reply_id)

  async def send_file(
    self,
    chat_id: str,
    file_url: str,
    filename: str,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Emit an assistant_file event for generic file attachments."""
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    reply_id = meta.get("reply_id") or self._new_event_id()
    try:
      file_url, meta = await self._resolve_outbound_media_url(file_url, metadata=meta)
    except InboundEventError as exc:
      logger.warning("send_file: %s", exc.message)
      return SendResult(success=False, message_id=reply_id, error=exc.message)
    payload: dict[str, Any] = {
      "message_id": reply_id,
      "filename": filename,
      "url": file_url,
      "mime_type": str(meta.get("mime_type") or "application/octet-stream"),
    }
    if meta.get("size_bytes") is not None:
      payload["size_bytes"] = int(meta["size_bytes"])
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_file",
      payload=payload,
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )
    return SendResult(success=True, message_id=reply_id)

  async def send_voice(
    self,
    chat_id: str,
    audio_path: str,
    caption: Optional[str] = None,
    reply_to: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
  ) -> SendResult:
    """Emit a native assistant_audio event for gateway-generated voice replies."""
    _ = reply_to, kwargs
    meta = dict(metadata or {})
    route = self._route_for_send(chat_id, meta)
    routed_chat_id = route.get("chat_id", chat_id)
    reply_id = str(
      meta.get("reply_id")
      or self._active_reply_id_for_chat(routed_chat_id)
      or self._new_event_id()
    )

    if not audio_path or not str(audio_path).strip():
      return SendResult(success=False, message_id=reply_id, error="Audio file not found")
    if is_local_reference(audio_path):
      path = resolve_local_path(audio_path)
      if not path.is_file():
        return SendResult(success=False, message_id=reply_id, error=f"Audio file not found: {path}")

    try:
      audio_url, audio_meta = await self._resolve_outbound_media_url(
        audio_path,
        metadata=meta,
      )
    except InboundEventError as exc:
      logger.warning("send_voice publish failed: %s", exc.message)
      return SendResult(success=False, message_id=reply_id, error=exc.message)

    guessed_mime = guess_mime_type(Path(urlparse(audio_path).path))
    mime_type = str(audio_meta.get("mime_type") or guessed_mime or "audio/mpeg")
    if not mime_type.startswith("audio/"):
      mime_type = "audio/mpeg"
    payload: dict[str, Any] = {
      "message_id": reply_id,
      "url": audio_url,
      "mime_type": mime_type,
    }
    if caption:
      payload["caption"] = caption
    if audio_meta.get("size_bytes") is not None:
      try:
        payload["size_bytes"] = int(audio_meta["size_bytes"])
      except (TypeError, ValueError):
        logger.debug("send_voice ignored invalid size_bytes: %r", audio_meta.get("size_bytes"))

    try:
      await self._emit_outbound(
        chat_id=route.get("chat_id", chat_id),
        user_id=route.get("user_id", "assistant"),
        event_type="assistant_audio",
        payload=payload,
        thread_id=route.get("thread_id") or None,
        session_id=route.get("session_id") or None,
      )
    except Exception as exc:
      logger.warning("send_voice emit failed: %s", exc)
      return SendResult(success=False, message_id=reply_id, error=str(exc))
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
    notice_kind = str(meta.get("kind", "info"))
    if notice_kind == "reasoning" and not self._show_reasoning_enabled():
      return SendResult(success=True, message_id=str(meta.get("notice_id") or self._new_event_id()))
    notice_id = meta.get("notice_id") or self._new_event_id()
    payload: dict[str, Any] = {
      "message_id": notice_id,
      "text": content,
      "kind": notice_kind,
    }
    if notice_kind == "tool" or meta.get("is_tool_status"):
      _apply_tool_notice_metadata(payload, meta)
    await self._emit_outbound(
      chat_id=route.get("chat_id", chat_id),
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_notice",
      payload=payload,
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )
    return SendResult(success=True, message_id=notice_id)

  async def edit_message(
    self,
    chat_id: str,
    message_id: str,
    content: str,
    *,
    finalize: bool = False,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Update an in-flight tool-progress notice (Telegram ``editMessageText`` parity)."""
    _ = finalize
    msg_id = str(message_id)
    if msg_id not in self._tool_progress_ids and not self._looks_like_tool_progress(content):
      return SendResult(success=False, error="Not supported")
    result = await self._send_tool_progress(
      chat_id,
      content,
      metadata=metadata,
      message_id=msg_id,
    )
    self._tool_progress_ids.add(msg_id)
    return result

  async def send_exec_approval(
    self,
    chat_id: str,
    command: str,
    session_key: str,
    description: str = "dangerous command",
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Render dangerous-command approval buttons (Telegram parity)."""
    approval_id = f"ap-{uuid.uuid4().hex[:12]}"
    preview = str(command or "")
    if len(preview) > 1500:
      preview = preview[:1500] + "..."
    body = (
      "⚠️ Dangerous command requires approval\n\n"
      f"```\n{preview}\n```\n"
      f"Reason: {description}"
    )

    meta = dict(metadata or {})
    meta["gateway_approval"] = True
    route = self._route_for_send(chat_id, meta)
    payload = {
      "message_id": approval_id,
      "confirm_id": approval_id,
      "title": "Command Approval Required",
      "body": body,
      "kind": "slash_confirm",
      "buttons": [
        {"id": "once", "label": "Allow Once", "style": "primary"},
        {"id": "session", "label": "Approve Session", "style": "secondary"},
        {"id": "deny", "label": "Deny", "style": "danger"},
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
      logger.warning("send_exec_approval failed: %s", exc)
      return SendResult(success=False, message_id=approval_id, error=str(exc))

    self._approval_state[approval_id] = session_key
    return SendResult(success=True, message_id=approval_id)

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

    if meta.get("gateway_approval") or meta.get("approval"):
      self._approval_state[confirm_id] = session_key
    else:
      self._slash_confirm_state[confirm_id] = session_key
    return SendResult(success=True, message_id=confirm_id)

  async def send_slash_options(
    self,
    chat_id: str,
    command: str,
    title: str,
    message: str,
    options: list[dict[str, Any]],
    pick_id: str,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Render a pick-one menu for slash-command arguments (e.g. /model).

    Mirrors Telegram inline-keyboard option lists. The web client sends the
    full slash command on button click (``command.create``); no ``button.click``
    is required for ``slash_pick`` prompts.
    """
    if not command.startswith("/"):
      return SendResult(success=False, message_id=pick_id, error="command must start with /")
    if not options:
      return SendResult(success=False, message_id=pick_id, error="options required")

    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    buttons: list[dict[str, Any]] = []
    for opt in options:
      btn_id = str(opt.get("id") or opt.get("value") or "")
      label = str(opt.get("label") or btn_id)
      if not btn_id:
        continue
      style = opt.get("style", "secondary")
      if style not in ("primary", "secondary", "danger"):
        style = "secondary"
      buttons.append({"id": btn_id, "label": label, "style": style})

    if not buttons:
      return SendResult(success=False, message_id=pick_id, error="no valid options")

    payload = {
      "message_id": pick_id,
      "pick_id": pick_id,
      "command": command,
      "title": title,
      "body": message,
      "kind": "slash_pick",
      "buttons": buttons,
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
      logger.warning("send_slash_options failed: %s", exc)
      return SendResult(success=False, message_id=pick_id, error=str(exc))

    return SendResult(success=True, message_id=pick_id)

  async def send_session_meta(
    self,
    chat_id: str,
    *,
    title: Optional[str] = None,
    session_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Notify the client about session metadata (e.g. Hermes-generated title).

    Hermes calls this when a session title is assigned or updated (manual
    ``/title <name>`` or auto-title). The web client routes the event by
    ``chat_id``/``session_id`` and updates the chat header accordingly.
    """
    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    payload: Dict[str, Any] = {}
    if title is not None:
      payload["title"] = title
    if extra:
      payload["extra"] = dict(extra)
    event_id = self._new_event_id()
    try:
      await self._emit_outbound(
        chat_id=route.get("chat_id", chat_id),
        user_id=route.get("user_id", "assistant"),
        event_type="session_meta",
        payload=payload,
        thread_id=thread_id or route.get("thread_id") or None,
        session_id=session_id or route.get("session_id") or None,
      )
    except Exception as exc:
      logger.warning("send_session_meta failed: %s", exc)
      return SendResult(success=False, message_id=event_id, error=str(exc))
    return SendResult(success=True, message_id=event_id)

  async def send_model_picker(
    self,
    chat_id: str,
    providers: list,
    current_model: str,
    current_provider: str,
    session_key: str,
    on_model_selected: Any,
    metadata: Optional[Dict[str, Any]] = None,
  ) -> SendResult:
    """Send a two-step provider → model picker (Telegram / Discord parity).

    Button clicks arrive as ``button.click`` with Telegram-style callback ids
    (``mp:``, ``mm:``, ``mb``, ``mx``, ``mg:``). The adapter updates the same
    picker card in-place and invokes ``on_model_selected`` when a model is chosen.
    """
    if not providers:
      return SendResult(success=False, error="no providers available")

    meta = metadata or {}
    route = self._route_for_send(chat_id, meta)
    pick_id = self._new_event_id()
    route_chat = route.get("chat_id", chat_id)

    try:
      from hermes_cli.providers import get_label  # type: ignore
    except ImportError:
      def get_label(slug: str) -> str:
        return slug

    provider_label = get_label(current_provider)
    body = (
      f"Current model: `{current_model or 'unknown'}`\n"
      f"Provider: {provider_label}\n\n"
      f"Select a provider:"
    )
    buttons = self._build_provider_picker_buttons(providers)

    self._model_picker_state[str(route_chat)] = {
      "pick_id": pick_id,
      "providers": providers,
      "session_key": session_key,
      "on_model_selected": on_model_selected,
      "current_model": current_model,
      "current_provider": current_provider,
      "route": route,
    }

    try:
      await self._emit_model_picker_card(
        route=route,
        chat_id=route_chat,
        pick_id=pick_id,
        title="Model Configuration",
        body=body,
        buttons=buttons,
      )
    except Exception as exc:
      self._model_picker_state.pop(str(route_chat), None)
      logger.warning("send_model_picker failed: %s", exc)
      return SendResult(success=False, message_id=pick_id, error=str(exc))

    return SendResult(success=True, message_id=pick_id)

  def _build_provider_picker_buttons(self, providers: list) -> list[dict[str, Any]]:
    buttons: list[dict[str, Any]] = []
    for provider in providers:
      slug = str(provider.get("slug") or "")
      if not slug:
        continue
      count = provider.get("total_models", len(provider.get("models", [])))
      label = f"{provider.get('name', slug)} ({count})"
      if provider.get("is_current"):
        label = f"✓ {label}"
      style = "primary" if provider.get("is_current") else "secondary"
      buttons.append({"id": f"mp:{slug}", "label": label, "style": style})
    buttons.append({"id": "mx", "label": "Cancel", "style": "danger"})
    return buttons

  def _build_model_picker_buttons(self, models: list, page: int) -> tuple[list[dict[str, Any]], str]:
    page_size = self._MODEL_PAGE_SIZE
    total = len(models)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(0, min(page, total_pages - 1))
    start = page * page_size
    end = min(start + page_size, total)
    page_models = models[start:end]

    buttons: list[dict[str, Any]] = []
    for index, model_id in enumerate(page_models):
      abs_idx = start + index
      short = model_id.split("/")[-1] if "/" in model_id else model_id
      if len(short) > 38:
        short = short[:35] + "..."
      buttons.append({"id": f"mm:{abs_idx}", "label": short, "style": "secondary"})

    if total_pages > 1:
      if page > 0:
        buttons.append({"id": f"mg:{page - 1}", "label": "◀ Prev", "style": "secondary"})
      buttons.append({"id": "mx:noop", "label": f"{page + 1}/{total_pages}", "style": "secondary"})
      if page < total_pages - 1:
        buttons.append({"id": f"mg:{page + 1}", "label": "Next ▶", "style": "secondary"})

    buttons.append({"id": "mb", "label": "◀ Back", "style": "secondary"})
    buttons.append({"id": "mx", "label": "Cancel", "style": "danger"})

    page_info = f" ({start + 1}–{end} of {total})" if total_pages > 1 else ""
    return buttons, page_info

  async def _emit_model_picker_card(
    self,
    *,
    route: dict[str, Any],
    chat_id: str,
    pick_id: str,
    title: str,
    body: str,
    buttons: list[dict[str, Any]],
  ) -> None:
    await self._emit_outbound(
      chat_id=chat_id,
      user_id=route.get("user_id", "assistant"),
      event_type="assistant_buttons",
      payload={
        "message_id": pick_id,
        "confirm_id": pick_id,
        "pick_id": pick_id,
        "title": title,
        "body": body,
        "kind": "model_picker",
        "buttons": buttons,
      },
      thread_id=route.get("thread_id") or None,
      session_id=route.get("session_id") or None,
    )

  async def _handle_model_picker_callback(
    self,
    choice: str,
    *,
    chat_id: str,
    user_id: str,
    ws: Any,
  ) -> None:
    state = self._model_picker_state.get(chat_id)
    if not state:
      await self._emit_error(
        chat_id=chat_id,
        user_id=user_id,
        message_id=self._new_event_id(),
        code="BAD_REQUEST",
        message="Picker expired — use /model again.",
        ws=ws,
      )
      return

    if choice in ("mx:noop",):
      return

    route = state.get("route") or {"chat_id": chat_id, "user_id": "assistant"}
    pick_id = str(state.get("pick_id") or self._new_event_id())

    try:
      from hermes_cli.providers import get_label  # type: ignore
    except ImportError:
      def get_label(slug: str) -> str:
        return slug

    if choice.startswith("mp:"):
      provider_slug = choice[3:]
      provider = next(
        (item for item in state.get("providers", []) if item.get("slug") == provider_slug),
        None,
      )
      if not provider:
        await self._emit_error(
          chat_id=chat_id,
          user_id=user_id,
          message_id=pick_id,
          code="BAD_REQUEST",
          message="Provider not found.",
          ws=ws,
        )
        return

      models = list(provider.get("models") or [])
      state["selected_provider"] = provider_slug
      state["selected_provider_name"] = provider.get("name", provider_slug)
      state["model_list"] = models
      state["model_page"] = 0

      buttons, page_info = self._build_model_picker_buttons(models, 0)
      pname = provider.get("name", provider_slug)
      total = provider.get("total_models", len(models))
      shown = len(models)
      extra = (
        f"\n_{total - shown} more available — type `/model <name>` directly_"
        if total > shown
        else ""
      )
      body = f"Provider: **{pname}**{page_info}\n\nSelect a model:{extra}"
      await self._emit_model_picker_card(
        route=route,
        chat_id=chat_id,
        pick_id=pick_id,
        title="Model Configuration",
        body=body,
        buttons=buttons,
      )
      return

    if choice.startswith("mg:"):
      try:
        page = int(choice[3:])
      except ValueError:
        await self._emit_error(
          chat_id=chat_id,
          user_id=user_id,
          message_id=pick_id,
          code="BAD_REQUEST",
          message="Invalid page.",
          ws=ws,
        )
        return

      models = list(state.get("model_list") or [])
      state["model_page"] = page
      buttons, page_info = self._build_model_picker_buttons(models, page)
      pname = state.get("selected_provider_name", "")
      provider_slug = state.get("selected_provider", "")
      provider = next(
        (item for item in state.get("providers", []) if item.get("slug") == provider_slug),
        None,
      )
      total = provider.get("total_models", len(models)) if provider else len(models)
      shown = len(models)
      extra = (
        f"\n_{total - shown} more available — type `/model <name>` directly_"
        if total > shown
        else ""
      )
      body = f"Provider: **{pname}**{page_info}\n\nSelect a model:{extra}"
      await self._emit_model_picker_card(
        route=route,
        chat_id=chat_id,
        pick_id=pick_id,
        title="Model Configuration",
        body=body,
        buttons=buttons,
      )
      return

    if choice.startswith("mm:"):
      try:
        idx = int(choice[3:])
      except ValueError:
        await self._emit_error(
          chat_id=chat_id,
          user_id=user_id,
          message_id=pick_id,
          code="BAD_REQUEST",
          message="Invalid selection.",
          ws=ws,
        )
        return

      model_list = list(state.get("model_list") or [])
      if idx < 0 or idx >= len(model_list):
        await self._emit_error(
          chat_id=chat_id,
          user_id=user_id,
          message_id=pick_id,
          code="BAD_REQUEST",
          message="Invalid model index.",
          ws=ws,
        )
        return

      model_id = model_list[idx]
      provider_slug = str(state.get("selected_provider") or "")
      callback = state.get("on_model_selected")
      if not callback:
        self._model_picker_state.pop(chat_id, None)
        await self._emit_error(
          chat_id=chat_id,
          user_id=user_id,
          message_id=pick_id,
          code="BAD_REQUEST",
          message="Picker expired.",
          ws=ws,
        )
        return

      try:
        result = callback(chat_id, model_id, provider_slug)
        if asyncio.iscoroutine(result):
          result_text = await result
        else:
          result_text = result
      except Exception as exc:
        logger.exception("model picker switch failed")
        result_text = f"Error switching model: {exc}"

      self._model_picker_state.pop(chat_id, None)
      await self._emit_model_picker_card(
        route=route,
        chat_id=chat_id,
        pick_id=pick_id,
        title="Model switched",
        body=str(result_text or "Model updated."),
        buttons=[],
      )
      return

    if choice == "mb":
      providers = list(state.get("providers") or [])
      buttons = self._build_provider_picker_buttons(providers)
      provider_label = get_label(str(state.get("current_provider") or ""))
      body = (
        f"Current model: `{state.get('current_model') or 'unknown'}`\n"
        f"Provider: {provider_label}\n\n"
        f"Select a provider:"
      )
      state.pop("selected_provider", None)
      state.pop("selected_provider_name", None)
      state.pop("model_list", None)
      state.pop("model_page", None)
      await self._emit_model_picker_card(
        route=route,
        chat_id=chat_id,
        pick_id=pick_id,
        title="Model Configuration",
        body=body,
        buttons=buttons,
      )
      return

    if choice == "mx":
      self._model_picker_state.pop(chat_id, None)
      await self._emit_model_picker_card(
        route=route,
        chat_id=chat_id,
        pick_id=pick_id,
        title="Model Configuration",
        body="Model selection cancelled.",
        buttons=[],
      )
      return

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

    if chat_id in self._model_picker_state or str(choice).startswith(("mp:", "mm:", "mg:")) or choice in ("mb", "mx", "mx:noop"):
      await self._handle_model_picker_callback(
        str(choice),
        chat_id=chat_id,
        user_id=user_id,
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

  def _resolve_cancel_reply_id(self, target_message_id: str) -> Optional[str]:
    """Resolve client line/segment ids to the internal stream reply id."""
    target = str(target_message_id).strip()
    if not target:
      return None
    if self.state.get_stream(target) is not None:
      return target
    resolved = self.streams.resolve_reply_id(target)
    if resolved:
      return resolved
    for reply_id, route in self._reply_routes.items():
      if route.get("inbound_message_id") == target:
        return reply_id
    return None

  async def _cancel_reply_streams(
    self,
    reply_ids: list[str],
    *,
    chat_id: str,
    ws: Any = None,
  ) -> None:
    """Cancel streams and notify the client with assistant_done(interrupted=True)."""
    for reply_id in reply_ids:
      self.state.cancel_stream(reply_id)

    for reply_id in reply_ids:
      route = self._reply_routes.get(reply_id, {})
      session = self.streams.get(reply_id)
      line_id = session.active_line_id if session else reply_id
      try:
        await self._emit_outbound(
          chat_id=route.get("chat_id", chat_id),
          user_id=route.get("user_id", "assistant"),
          event_type="assistant_done",
          payload={
            "message_id": line_id,
            "final_text": "",
            "turn_message_id": reply_id,
            "interrupted": True,
          },
          thread_id=route.get("thread_id") or None,
          session_id=route.get("session_id") or None,
          ws=ws,
        )
      except Exception:
        logger.exception("cancel emit failed for %s", reply_id)
      self.streams.remove(reply_id)
      self.state.end_stream(reply_id)
      self._reply_routes.pop(reply_id, None)

  async def interrupt_session_activity(self, session_key: str, chat_id: str) -> None:
    """Cancel any active streams for this chat and emit assistant_done(interrupted=True)."""
    _ = session_key  # gateway passes session_key; routes are keyed by chat_id today
    affected: list[str] = []
    for reply_id, route in list(self._reply_routes.items()):
      if route.get("chat_id") != chat_id:
        continue
      affected.append(reply_id)

    if affected:
      await self._cancel_reply_streams(affected, chat_id=chat_id)

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
  if "tts_response_format" in platform_cfg and not os.getenv("CUSTOM_CHAT_TTS_RESPONSE_FORMAT"):
    os.environ["CUSTOM_CHAT_TTS_RESPONSE_FORMAT"] = str(
      platform_cfg["tts_response_format"]
    ).strip().lower()
  media_base = platform_cfg.get("media_public_base_url")
  if media_base and not os.getenv("CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL"):
    os.environ["CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL"] = str(media_base).rstrip("/")
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
      "confirmations, audio uploads, tool/reasoning text in the stream, "
      "and segment boundaries after tool calls. Use send_file/send_image "
      "for attachments; local paths are published to the web media API when "
      "CUSTOM_CHAT_MEDIA_PUBLIC_BASE_URL is set."
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
