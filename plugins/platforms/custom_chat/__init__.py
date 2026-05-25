"""Hermes custom_chat platform plugin."""

import sys
from pathlib import Path

_PACKAGES_DIR = Path(__file__).resolve().parents[3] / "packages"
if _PACKAGES_DIR.is_dir() and str(_PACKAGES_DIR) not in sys.path:
    sys.path.insert(0, str(_PACKAGES_DIR))

from .adapter import register

__all__ = ["register"]
