"""Dedupe, rate limiting, and stream cancellation state."""

from __future__ import annotations

import time
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import Optional

# Bound on remembered cancelled reply ids (tombstones). Reply ids are unique per
# turn and never reused, so this only needs to outlive any in-flight gateway
# coroutine that might still emit for a just-cancelled turn.
_MAX_CANCELLED_TOMBSTONES = 1024


@dataclass
class StreamHandle:
    message_id: str
    cancelled: bool = False


class AdapterState:
    def __init__(
        self,
        *,
        dedupe_ttl_seconds: int = 300,
        rate_limit_per_minute: int = 60,
    ) -> None:
        self.dedupe_ttl_seconds = dedupe_ttl_seconds
        self.rate_limit_per_minute = rate_limit_per_minute
        self._seen_events: dict[str, float] = {}
        self._rate_buckets: dict[str, list[float]] = defaultdict(list)
        self._active_streams: dict[str, StreamHandle] = {}
        # Reply ids that were cancelled/interrupted. Survives end_stream() so a
        # still-running gateway task cannot resurrect the stream via get_or_create
        # and keep emitting after the interrupted assistant_done.
        self._cancelled: "OrderedDict[str, None]" = OrderedDict()

    def _prune_dedupe(self, now: float) -> None:
        expired = [
            eid
            for eid, ts in self._seen_events.items()
            if now - ts > self.dedupe_ttl_seconds
        ]
        for eid in expired:
            del self._seen_events[eid]

    def is_duplicate(self, event_id: str) -> bool:
        now = time.time()
        self._prune_dedupe(now)
        if event_id in self._seen_events:
            return True
        self._seen_events[event_id] = now
        return False

    def check_rate_limit(self, key: str) -> bool:
        """Return True if allowed, False if rate limited."""
        now = time.time()
        window_start = now - 60.0
        bucket = self._rate_buckets[key]
        self._rate_buckets[key] = [t for t in bucket if t > window_start]
        if len(self._rate_buckets[key]) >= self.rate_limit_per_minute:
            return False
        self._rate_buckets[key].append(now)
        return True

    def register_stream(self, message_id: str) -> StreamHandle:
        handle = StreamHandle(message_id=message_id)
        self._active_streams[message_id] = handle
        return handle

    def cancel_stream(self, target_message_id: str) -> bool:
        self.mark_cancelled(target_message_id)
        handle = self._active_streams.get(target_message_id)
        if handle is None:
            return False
        handle.cancelled = True
        return True

    def mark_cancelled(self, message_id: str) -> None:
        """Record a cancelled reply id as a tombstone (bounded LRU)."""
        self._cancelled[message_id] = None
        self._cancelled.move_to_end(message_id)
        while len(self._cancelled) > _MAX_CANCELLED_TOMBSTONES:
            self._cancelled.popitem(last=False)

    def is_cancelled(self, message_id: str) -> bool:
        return message_id in self._cancelled

    def get_stream(self, message_id: str) -> Optional[StreamHandle]:
        return self._active_streams.get(message_id)

    def end_stream(self, message_id: str) -> None:
        self._active_streams.pop(message_id, None)
