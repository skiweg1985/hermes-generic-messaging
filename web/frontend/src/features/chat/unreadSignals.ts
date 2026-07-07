import type { ChatSession } from "../../types/events";

/** Sum of unread messages across all sessions (feeds tab-title/favicon badges). */
export function totalUnread(
  sessions: Array<Pick<ChatSession, "unread" | "unreadCount">>,
): number {
  return sessions.reduce((n, s) => n + (s.unread ? s.unreadCount ?? 0 : 0), 0);
}

/** "(3) Hermes" while unread, plain base title otherwise. Caps at 99+. */
export function formatUnreadTitle(base: string, count: number): string {
  if (count <= 0) return base;
  return `(${count > 99 ? "99+" : count}) ${base}`;
}
