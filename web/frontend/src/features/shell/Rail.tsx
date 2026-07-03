import { useEffect } from "react";
import type { ChatSession } from "../../types/events";
import { SessionGroupList } from "./SessionGroupList";
import { IconPlus, IconSearch, IconClose } from "./icons";

interface RailProps {
  userId: string;
  workspaceName: string;
  sessions: ChatSession[];
  activeChatId: string;
  drawerOpen: boolean;
  onSelectSession: (chatId: string) => void;
  onCreateChat: () => void;
  onOpenPalette: () => void;
  onCloseDrawer: () => void;
}

function initials(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, " ").trim();
  if (!cleaned) return "·";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function Rail({
  userId,
  workspaceName,
  sessions,
  activeChatId,
  drawerOpen,
  onSelectSession,
  onCreateChat,
  onOpenPalette,
  onCloseDrawer,
}: RailProps) {
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseDrawer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen, onCloseDrawer]);

  return (
    <>
      {drawerOpen ? (
        <div
          className="rail-backdrop"
          onClick={onCloseDrawer}
          aria-hidden
        />
      ) : null}
      <aside
        className={`rail${drawerOpen ? " rail-drawer-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="rail-workspace">
          <div className="rail-workspace-mark" aria-hidden>
            <span>{initials(workspaceName)}</span>
          </div>
          <div className="rail-workspace-body">
            <div className="t-body-sm rail-workspace-title truncate">
              {workspaceName}
            </div>
            <div className="t-meta rail-workspace-subtitle truncate">Web chats</div>
          </div>
          <button
            type="button"
            className="rail-drawer-close"
            onClick={onCloseDrawer}
            aria-label="Close navigation"
          >
            <IconClose size={16} />
          </button>
        </div>

        <button
          type="button"
          className="rail-primary"
          onClick={onCreateChat}
          aria-label="Start a new chat"
        >
          <IconPlus size={14} />
          <span>New chat</span>
          <kbd>⌘N</kbd>
        </button>

        <div className="rail-quick">
          <button
            type="button"
            className="rail-quick-item"
            onClick={onOpenPalette}
            aria-label="Open command palette"
          >
            <IconSearch size={14} />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
        </div>

        <SessionGroupList
          sessions={sessions}
          activeChatId={activeChatId}
          onSelect={onSelectSession}
        />

        <div className="rail-footer">
          <div className="rail-avatar" aria-hidden>{initials(userId)}</div>
          <div className="rail-footer-body">
            <div className="t-body-sm truncate">{userId}</div>
            <div className="t-meta truncate">Synced</div>
          </div>
        </div>
      </aside>
    </>
  );
}
