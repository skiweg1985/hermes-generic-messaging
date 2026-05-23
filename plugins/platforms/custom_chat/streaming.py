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

    def remove(self, message_id: str) -> Optional[StreamSession]:
        return self._sessions.pop(message_id, None)
