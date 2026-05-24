import type { ConnectionStatus } from "../../types/events";
import { IconMore, IconPanel } from "./icons";

interface TopBarProps {
  title: string;
  connection: ConnectionStatus;
  streaming: boolean;
  modelLabel?: string;
  onOpenPeek: () => void;
  onReconnect: () => void;
}

function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "error":
      return "Disconnected";
  }
}

export function TopBar({
  title,
  connection,
  streaming,
  modelLabel,
  onOpenPeek,
  onReconnect,
}: TopBarProps) {
  return (
    <header className="topbar" aria-label="Session header">
      <div className="topbar-left">
        <div
          className={`topbar-dot topbar-dot-${connection}${streaming ? " topbar-dot-streaming" : ""}`}
          title={connectionLabel(connection)}
          aria-label={connectionLabel(connection)}
        />
        <h1 className="topbar-title t-title truncate" title={title}>
          {title}
        </h1>
        {streaming ? (
          <span className="topbar-stream-tag t-meta">Streaming</span>
        ) : null}
      </div>

      <div className="topbar-right">
        {connection === "error" ? (
          <button
            type="button"
            className="topbar-link"
            onClick={onReconnect}
            aria-label="Reconnect"
          >
            Reconnect
          </button>
        ) : null}
        <button type="button" className="topbar-chip" disabled title="Model picker">
          <span className="t-body-sm truncate">{modelLabel ?? "Auto"}</span>
        </button>
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={onOpenPeek}
          aria-label="Session details (⌘I)"
          title="Session details (⌘I)"
        >
          <IconPanel size={16} />
        </button>
        <button
          type="button"
          className="topbar-icon-btn"
          aria-label="More options"
          title="More options"
          disabled
        >
          <IconMore size={16} />
        </button>
      </div>
    </header>
  );
}
