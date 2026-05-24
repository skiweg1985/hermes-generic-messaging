#!/usr/bin/env bash
# Patch Hermes gateway/run.py so custom_chat receives session titles via
# adapter.send_session_meta (manual /title and auto-title).
set -euo pipefail

RUN_PY="${1:-$HOME/.hermes/hermes-agent/gateway/run.py}"

if [[ ! -f "$RUN_PY" ]]; then
  echo "gateway run.py not found: $RUN_PY" >&2
  exit 1
fi

if grep -q "_resolve_custom_chat_source_for_session_id" "$RUN_PY"; then
  echo "already patched (v2): $RUN_PY"
  exit 0
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APPLY_V1=true
if grep -q "_notify_custom_chat_session_title" "$RUN_PY"; then
  echo "base patch present, applying v2 upgrade..."
  APPLY_V1=false
fi

if [[ "$APPLY_V1" == "true" ]]; then

python3 - "$RUN_PY" <<'PY'
from __future__ import annotations

import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()

HELPERS = '''
    def _is_custom_chat_lane(self, source: SessionSource) -> bool:
        """True when the inbound message came from the custom_chat WebSocket client."""
        plat = getattr(source.platform, "value", source.platform)
        return str(plat or "") == "custom_chat"

    async def _notify_custom_chat_session_title(
        self,
        source: SessionSource,
        session_id: str,
        title: str,
    ) -> None:
        """Push Hermes session title to the custom_chat web client."""
        if not self._is_custom_chat_lane(source) or not source.chat_id or not title:
            return
        adapter = self.adapters.get(source.platform) if getattr(self, "adapters", None) else None
        if adapter is None:
            return
        send_meta = getattr(adapter, "send_session_meta", None)
        if send_meta is None:
            return
        try:
            await send_meta(
                chat_id=str(source.chat_id),
                title=str(title),
                session_id=str(session_id) if session_id else None,
                thread_id=str(source.thread_id) if source.thread_id else None,
            )
        except Exception:
            logger.debug("Failed to notify custom_chat session title", exc_info=True)

    def _schedule_custom_chat_session_title_notify(
        self,
        source: SessionSource,
        session_id: str,
        title: str,
    ) -> None:
        """Schedule session_meta from the auto-title background thread."""
        if not title or not self._is_custom_chat_lane(source):
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = getattr(self, "_gateway_loop", None)
        if loop is None or loop.is_closed():
            return
        try:
            copied_source = dataclasses.replace(source)
        except Exception:
            copied_source = source
        future = asyncio.run_coroutine_threadsafe(
            self._notify_custom_chat_session_title(copied_source, session_id, title),
            loop,
        )

        def _log_notify_failure(fut) -> None:
            try:
                fut.result()
            except Exception:
                logger.debug("custom_chat session title notify failed", exc_info=True)

        future.add_done_callback(_log_notify_failure)

'''

anchor = "    def _sanitize_telegram_topic_title(self, title: str) -> str:"
if anchor not in text:
    print(f"anchor not found in {path}", file=sys.stderr)
    sys.exit(1)
text = text.replace(anchor, HELPERS + anchor, 1)

# Manual /title
old_title_set = """                if self._session_db.set_session_title(session_id, sanitized):
                    return t("gateway.title.set_to", title=sanitized)"""
new_title_set = """                if self._session_db.set_session_title(session_id, sanitized):
                    self._schedule_custom_chat_session_title_notify(
                        source, session_id, sanitized
                    )
                    return t("gateway.title.set_to", title=sanitized)"""
if old_title_set not in text:
    print("_handle_title_command anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_title_set, new_title_set, 1)

# /new with title
old_new_title = """                    self._session_db.set_session_title(new_entry.session_id, sanitized)
                    header = t("gateway.reset.header_titled", title=sanitized)"""
new_new_title = """                    self._session_db.set_session_title(new_entry.session_id, sanitized)
                    self._schedule_custom_chat_session_title_notify(
                        source, new_entry.session_id, sanitized
                    )
                    header = t("gateway.reset.header_titled", title=sanitized)"""
if old_new_title not in text:
    print("/new title anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_new_title, new_new_title, 1)

# Auto-title title_callback (add custom_chat branch next to telegram)
old_auto = """                    if self._is_telegram_topic_lane(source):
                        maybe_auto_title_kwargs["title_callback"] = lambda title: self._schedule_telegram_topic_title_rename(
                            source,
                            effective_session_id,
                            title,
                        )"""
new_auto = """                    if self._is_telegram_topic_lane(source):
                        maybe_auto_title_kwargs["title_callback"] = lambda title: self._schedule_telegram_topic_title_rename(
                            source,
                            effective_session_id,
                            title,
                        )
                    elif self._is_custom_chat_lane(source):
                        maybe_auto_title_kwargs["title_callback"] = lambda title: self._schedule_custom_chat_session_title_notify(
                            source,
                            effective_session_id,
                            title,
                        )"""
if old_auto not in text:
    print("maybe_auto_title anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_auto, new_auto, 1)

path.write_text(text)
print(f"patched {path}")
PY

fi

exec "$SCRIPT_DIR/upgrade-hermes-session-meta-patch.sh" "$RUN_PY"
