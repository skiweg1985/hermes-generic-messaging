import type { ChatSession } from "../../types/events";
import { SessionGroupList } from "./SessionGroupList";
import { IconPlus, IconSearch, IconAgents, IconLibrary } from "./icons";

interface RailProps {
  userId: string;
  workspaceName: string;
  sessions: ChatSession[];
  activeChatId: string;
  onSelectSession: (chatId: string) => void;
  onCreateChat: () => void;
  onOpenPalette: () => void;
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
  onSelectSession,
  onCreateChat,
  onOpenPalette,
}: RailProps) {
  return (
    <aside className="rail" aria-label="Workspace navigation">
      <div className="rail-workspace">
        <div className="rail-workspace-mark" aria-hidden>
          <span>{initials(workspaceName)}</span>
        </div>
        <div className="rail-workspace-body">
          <div className="t-body-sm rail-workspace-title truncate">
            {workspaceName}
          </div>
          <div className="t-meta truncate">Personal</div>
        </div>
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
        <button type="button" className="rail-quick-item" disabled title="Coming soon">
          <IconAgents size={14} />
          <span>Agents</span>
        </button>
        <button type="button" className="rail-quick-item" disabled title="Coming soon">
          <IconLibrary size={14} />
          <span>Library</span>
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
          <div className="t-meta truncate">Online</div>
        </div>
      </div>
    </aside>
  );
}
