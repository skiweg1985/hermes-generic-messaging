#!/usr/bin/env bash
# Upgrade gateway/run.py session_meta patch (v2): session_id source lookup +
# robust adapter resolution for background auto-title delivery.
set -euo pipefail

RUN_PY="${1:-$HOME/.hermes/hermes-agent/gateway/run.py}"

if [[ ! -f "$RUN_PY" ]]; then
  echo "gateway run.py not found: $RUN_PY" >&2
  exit 1
fi

if grep -q "_resolve_custom_chat_source_for_session_id" "$RUN_PY"; then
  echo "already upgraded: $RUN_PY"
  exit 0
fi

if ! grep -q "_notify_custom_chat_session_title" "$RUN_PY"; then
  echo "base session_meta patch missing; run apply-hermes-session-meta-patch.sh first" >&2
  exit 1
fi

python3 - "$RUN_PY" <<'PY'
from __future__ import annotations

import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()

HELPERS = '''
    def _resolve_custom_chat_source_for_session_id(self, session_id: str):
        """Find the custom_chat SessionSource for a Hermes session id."""
        if not session_id:
            return None
        store = getattr(self, "session_store", None)
        entries = getattr(store, "_entries", None) if store is not None else None
        if not isinstance(entries, dict):
            return None
        for entry in entries.values():
            if str(getattr(entry, "session_id", "") or "") != str(session_id):
                continue
            origin = getattr(entry, "origin", None)
            if origin is not None and self._is_custom_chat_lane(origin):
                return origin
        return None

    def _get_custom_chat_adapter(self, source):
        adapters = getattr(self, "adapters", None)
        if not adapters:
            return None
        adapter = adapters.get(getattr(source, "platform", None))
        if adapter is not None:
            return adapter
        plat = getattr(getattr(source, "platform", None), "value", getattr(source, "platform", None))
        for platform, candidate in adapters.items():
            if getattr(platform, "value", platform) == plat:
                return candidate
        return None

    def _schedule_custom_chat_session_title_notify_by_session_id(
        self,
        session_id: str,
        title: str,
    ) -> None:
        """Schedule session_meta using session_store lookup (auto-title safe)."""
        source = self._resolve_custom_chat_source_for_session_id(session_id)
        if source is None:
            return
        self._schedule_custom_chat_session_title_notify(source, session_id, title)

'''

anchor = "    def _is_custom_chat_lane(self, source: SessionSource) -> bool:"
if anchor not in text:
    print("custom_chat lane anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(anchor, HELPERS + anchor, 1)

old_notify = """        adapter = self.adapters.get(source.platform) if getattr(self, "adapters", None) else None
        if adapter is None:
            return
        send_meta = getattr(adapter, "send_session_meta", None)"""
new_notify = """        adapter = self._get_custom_chat_adapter(source)
        if adapter is None:
            return
        send_meta = getattr(adapter, "send_session_meta", None)"""
if old_notify not in text:
    print("notify adapter lookup anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_notify, new_notify, 1)

old_manual = """                    self._schedule_custom_chat_session_title_notify(
                        source, session_id, sanitized
                    )"""
new_manual = """                    self._schedule_custom_chat_session_title_notify_by_session_id(
                        session_id, sanitized
                    )"""
if old_manual not in text:
    print("manual title notify anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_manual, new_manual, 1)

old_new = """                    self._schedule_custom_chat_session_title_notify(
                        source, new_entry.session_id, sanitized
                    )"""
new_new = """                    self._schedule_custom_chat_session_title_notify_by_session_id(
                        new_entry.session_id, sanitized
                    )"""
if old_new not in text:
    print("/new title notify anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_new, new_new, 1)

old_auto = """                    elif self._is_custom_chat_lane(source):
                        maybe_auto_title_kwargs["title_callback"] = lambda title: self._schedule_custom_chat_session_title_notify(
                            source,
                            effective_session_id,
                            title,
                        )"""
new_auto = """                    elif self._is_custom_chat_lane(source):
                        maybe_auto_title_kwargs["title_callback"] = lambda title, sid=effective_session_id: self._schedule_custom_chat_session_title_notify_by_session_id(
                            sid,
                            title,
                        )"""
if old_auto not in text:
    print("auto-title callback anchor not found", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_auto, new_auto, 1)

path.write_text(text)
print(f"upgraded {path}")
PY

echo "done"
