import type { ConnectionStatus } from "../../types/events";
import { TypingIndicator } from "../chat/messages/TypingIndicator";
import { IconPanel, IconSidebarToggle } from "./icons";

interface TopBarProps {
  title: string;
  connection: ConnectionStatus;
  streaming: boolean;
  typing?: boolean;
  modelLabel?: string;
  onOpenPeek: () => void;
  onToggleRail: () => void;
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
  typing = false,
  modelLabel,
  onOpenPeek,
  onToggleRail,
}: TopBarProps) {
  return (
    <header className="topbar" aria-label="Session header">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-icon-btn topbar-rail-toggle"
          onClick={onToggleRail}
          aria-label="Toggle navigation"
          title="Toggle navigation"
        >
          <IconSidebarToggle size={19} />
        </button>
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
        {typing ? (
          <span className="topbar-typing">
            <TypingIndicator />
          </span>
        ) : null}
      </div>

      <div className="topbar-right">
        {modelLabel ? (
          <span className="topbar-chip" title="Model">
            <span className="t-body-sm truncate">{modelLabel}</span>
          </span>
        ) : null}
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={onOpenPeek}
          aria-label="Session details (⌘I)"
          title="Session details (⌘I)"
        >
          <IconPanel size={16} />
        </button>
      </div>
    </header>
  );
}
