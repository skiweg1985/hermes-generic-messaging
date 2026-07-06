"""Outbound streaming sequence state per reply message_id."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class StreamSession:
    message_id: str
    chat_id: str
    user_id: str
    thread_id: Optional[str] = None
    session_id: Optional[str] = None
    sequence: int = 0
    started: bool = False
    done: bool = False
    accumulated: str = ""
    segment_index: int = 0
    active_line_id: str = ""

    def __post_init__(self) -> None:
        if not self.active_line_id:
            self.active_line_id = self.message_id


class StreamManager:
    def __init__(self) -> None:
        self._sessions: dict[str, StreamSession] = {}

    def get_or_create(
        self,
        message_id: str,
        *,
        chat_id: str,
        user_id: str,
        thread_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> StreamSession:
        if message_id not in self._sessions:
            self._sessions[message_id] = StreamSession(
                message_id=message_id,
                chat_id=chat_id,
                user_id=user_id,
                thread_id=thread_id,
                session_id=session_id,
            )
        return self._sessions[message_id]

    def next_sequence(self, message_id: str) -> int:
        session = self._sessions[message_id]
        session.sequence += 1
        return session.sequence

    def mark_started(self, message_id: str) -> bool:
        session = self._sessions[message_id]
        if session.started:
            return False
        session.started = True
        return True

    def mark_done(self, message_id: str) -> None:
        if message_id in self._sessions:
            self._sessions[message_id].done = True

    def get(self, message_id: str) -> Optional[StreamSession]:
        return self._sessions.get(message_id)

    def resolve_reply_id(self, target: str) -> Optional[str]:
        """Map a line, segment, or turn id to the active stream reply id."""
        if target in self._sessions:
            return target
        for reply_id, session in self._sessions.items():
            if session.active_line_id == target:
                return reply_id
            if target.startswith(f"{reply_id}-s"):
                return reply_id
        return None

    def remove(self, message_id: str) -> Optional[StreamSession]:
        return self._sessions.pop(message_id, None)

    def begin_segment(self, message_id: str) -> tuple[str, str]:
        """Advance to the next transcript segment; returns (turn_id, new_line_id)."""
        session = self._sessions[message_id]
        session.segment_index += 1
        new_line_id = f"{message_id}-s{session.segment_index}"
        session.active_line_id = new_line_id
        session.accumulated = ""
        # Deltas are addressed to the per-segment line id, and the frontend gates
        # sequences per line starting at 0. Reset the counter so the new line's
        # first delta is seq 1 — otherwise every post-segment delta lands in the
        # reorder buffer and never renders.
        session.sequence = 0
        return message_id, new_line_id
