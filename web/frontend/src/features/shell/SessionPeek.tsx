import { useEffect } from "react";
import type { ChatSession, ConnectionStatus } from "../../types/events";
import { IconClose } from "./icons";

interface SessionPeekProps {
  open: boolean;
  onClose: () => void;
  session: ChatSession;
  connection: ConnectionStatus;
  userId: string;
}

function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortId(value: string): string {
  return value.includes(":") ? value.split(":").pop() ?? value : value;
}

export function SessionPeek({
  open,
  onClose,
  session,
  connection,
  userId,
}: SessionPeekProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="peek-backdrop motion-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside
        className="peek motion-rise-in"
        role="dialog"
        aria-modal="false"
        aria-label="Session details"
      >
        <header className="peek-header">
          <div>
            <div className="t-label">Session</div>
            <div className="t-title peek-title">{session.label || shortId(session.chatId)}</div>
          </div>
          <button
            type="button"
            className="peek-close"
            onClick={onClose}
            aria-label="Close session details"
          >
            <IconClose size={14} />
          </button>
        </header>

        <section className="peek-section">
          <div className="t-label peek-section-label">Metadata</div>
          <dl className="peek-list">
            <div className="peek-row">
              <dt className="t-meta">ID</dt>
              <dd className="t-mono-sm">{shortId(session.chatId)}</dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">User</dt>
              <dd className="t-body-sm">{userId}</dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Created</dt>
              <dd className="t-body-sm">{formatTime(session.createdAt)}</dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Updated</dt>
              <dd className="t-body-sm">{formatTime(session.updatedAt)}</dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Messages</dt>
              <dd className="t-body-sm">{session.lines.length}</dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Transport</dt>
              <dd className="t-body-sm">WebSocket</dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Status</dt>
              <dd className="t-body-sm">{connection}</dd>
            </div>
          </dl>
        </section>

        <section className="peek-section">
          <div className="t-label peek-section-label">Shortcuts</div>
          <dl className="peek-list">
            <div className="peek-row">
              <dt className="t-meta">New chat</dt>
              <dd><kbd>⌘N</kbd></dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Command palette</dt>
              <dd><kbd>⌘K</kbd></dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Slash menu</dt>
              <dd><kbd>⌘/</kbd></dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Switch chat</dt>
              <dd><kbd>⌘1</kbd>…<kbd>9</kbd></dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Focus composer</dt>
              <dd><kbd>⌘L</kbd></dd>
            </div>
            <div className="peek-row">
              <dt className="t-meta">Stop generation</dt>
              <dd><kbd>⌘.</kbd></dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
