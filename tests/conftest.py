"""Shared test fixtures and Hermes type stubs."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from enum import Enum
from types import ModuleType
from typing import Any, Optional


class MessageType(Enum):
    TEXT = "text"
    AUDIO = "audio"


@dataclass
class MessageEvent:
    text: str
    message_type: MessageType
    source: dict[str, Any]
    message_id: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SendResult:
    success: bool = True
    message_id: Optional[str] = None
    already_sent: bool = False


class Platform:
    def __init__(self, name: str) -> None:
        self.value = name


@dataclass
class PlatformConfig:
    extra: dict[str, Any] = field(default_factory=dict)


class _BasePlatformAdapter:
    def __init__(self, config: PlatformConfig, platform: Platform) -> None:
        self.config = config
        self.platform = platform
        self._running = False
        self._connected = False
        self._message_handler = None

    def _mark_connected(self) -> None:
        self._connected = True
        self._running = True

    def _mark_disconnected(self) -> None:
        self._connected = False
        self._running = False

    async def handle_message(self, event: MessageEvent) -> None:
        if self._message_handler:
            await self._message_handler(event)


def _install_hermes_stubs() -> None:
    base_mod = ModuleType("gateway.platforms.base")
    base_mod.MessageEvent = MessageEvent  # type: ignore[attr-defined]
    base_mod.MessageType = MessageType  # type: ignore[attr-defined]
    base_mod.SendResult = SendResult  # type: ignore[attr-defined]
    base_mod.BasePlatformAdapter = _BasePlatformAdapter  # type: ignore[attr-defined]

    config_mod = ModuleType("gateway.config")
    config_mod.Platform = Platform  # type: ignore[attr-defined]
    config_mod.PlatformConfig = PlatformConfig  # type: ignore[attr-defined]

    gateway_mod = ModuleType("gateway")
    platforms_mod = ModuleType("gateway.platforms")
    sys.modules.setdefault("gateway", gateway_mod)
    sys.modules.setdefault("gateway.platforms", platforms_mod)
    sys.modules.setdefault("gateway.platforms.base", base_mod)
    sys.modules.setdefault("gateway.config", config_mod)


_install_hermes_stubs()
