import { useMemo } from "react";
import type { ChatSession } from "../../types/events";
import { IconChevronRight } from "./icons";

interface SessionGroupListProps {
  sessions: ChatSession[];
  activeChatId: string;
  onSelect: (chatId: string) => void;
}

interface Group {
  key: string;
  label: string;
  items: ChatSession[];
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupSessions(sessions: ChatSession[]): Group[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - 24 * 3600_000;
  const weekAgo = today - 7 * 24 * 3600_000;

  const buckets: Record<string, ChatSession[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const session of sessions) {
    const ts = Date.parse(session.updatedAt || session.createdAt);
    const day = Number.isFinite(ts) ? startOfDay(new Date(ts)) : today;
    if (day >= today) buckets.today.push(session);
    else if (day >= yesterday) buckets.yesterday.push(session);
    else if (day >= weekAgo) buckets.week.push(session);
    else buckets.older.push(session);
  }

  // Sort within bucket newest first.
  const order: Array<[string, string]> = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["week", "This week"],
    ["older", "Older"],
  ];

  return order
    .map(([key, label]) => ({
      key,
      label,
      items: buckets[key].slice().sort((a, b) =>
        (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

function displayLabel(session: ChatSession): string {
  if (session.label && session.label.trim().length > 0) return session.label;
  const id = session.chatId;
  return id.includes(":") ? id.split(":").pop() ?? id : id;
}

export function SessionGroupList({
  sessions,
  activeChatId,
  onSelect,
}: SessionGroupListProps) {
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  if (groups.length === 0) {
    return (
      <div className="rail-empty t-meta">No conversations yet</div>
    );
  }

  return (
    <div className="rail-sessions" role="list" aria-label="Conversations">
      {groups.map((group) => (
        <div key={group.key} className="rail-session-group">
          <div className="t-label rail-group-label">{group.label}</div>
          <ul className="rail-session-list">
            {group.items.map((session) => {
              const active = session.chatId === activeChatId;
              return (
                <li key={session.chatId}>
                  <button
                    type="button"
                    className={`rail-session${active ? " rail-session-active" : ""}`}
                    onClick={() => onSelect(session.chatId)}
                    title={session.chatId}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className="rail-session-label truncate">
                      {displayLabel(session)}
                    </span>
                    {session.typing ? (
                      <span className="rail-session-typing" aria-label="assistant typing">
                        <span className="dot-pulse" />
                      </span>
                    ) : session.unread ? (
                      <span className="rail-session-unread" aria-label="unread" />
                    ) : (
                      <IconChevronRight size={12} className="rail-session-chev" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
