import { useEffect, useRef, useState } from "react";
import type { ChatSession } from "../types/events";
import { formatUnreadTitle, totalUnread } from "../features/chat/unreadSignals";
import { setFaviconBadge } from "../lib/faviconBadge";

export function isBackgrounded(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden" || !document.hasFocus();
}

/**
 * Mirrors the unread state into the tab while the page is backgrounded:
 * "(N) Hermes" in the title plus a favicon dot. Refocusing clears both and
 * resets the active session's unread count (via onForeground →
 * SET_ACTIVE_CHAT, which already zeroes unread/unreadCount).
 */
export function useUnreadSignals(
  sessions: ChatSession[],
  activeChatId: string,
  onForeground: (chatId: string) => void,
): void {
  const [backgrounded, setBackgrounded] = useState(isBackgrounded);
  const baseTitleRef = useRef<string | null>(null);
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const onForegroundRef = useRef(onForeground);
  onForegroundRef.current = onForeground;

  useEffect(() => {
    baseTitleRef.current ??= document.title;
    const update = () => setBackgrounded(isBackgrounded());
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  // Returning to the foreground marks the active chat as read.
  useEffect(() => {
    if (!backgrounded) onForegroundRef.current(activeChatIdRef.current);
  }, [backgrounded]);

  const total = totalUnread(sessions);

  useEffect(() => {
    const count = backgrounded ? total : 0;
    document.title = formatUnreadTitle(baseTitleRef.current ?? "Hermes", count);
    void setFaviconBadge(count > 0);
  }, [backgrounded, total]);
}
