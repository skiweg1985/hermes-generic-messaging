"""MIME type helpers shared by BFF and custom_chat plugin."""

from __future__ import annotations


def normalize_mime_type(mime_type: str) -> str:
    """Return base MIME type without parameters (e.g. strip ;codecs=opus)."""
    return mime_type.split(";", 1)[0].strip().lower()
