import type { ChatState, EventEnvelope } from "../../types/events";
import { chatDisplayTitle } from "./chatReducer";

export const NOTIFICATIONS_STORAGE_KEY = "hermes.notifications";

const BODY_MAX_LENGTH = 140;

/** Event types that produce one visible message (mirrors UNREAD_COUNTED_EVENTS). */
const NOTIFIED_EVENTS = new Set([
  "assistant_done",
  "assistant_audio",
  "assistant_image",
  "assistant_file",
  "assistant_buttons",
  "assistant_error",
]);

export function isNotificationsEnabled(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationsEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
    }
  } catch {
    /* storage blocked — treated as disabled */
  }
}

export interface ShouldNotifyArgs {
  supported: boolean;
  enabled: boolean;
  permission: string;
  backgrounded: boolean;
  eventType: string;
}

export function shouldNotify(args: ShouldNotifyArgs): boolean {
  return (
    args.supported &&
    args.enabled &&
    args.permission === "granted" &&
    args.backgrounded &&
    NOTIFIED_EVENTS.has(args.eventType)
  );
}

export interface NotificationContent {
  chatId: string;
  title: string;
  body: string;
  tag: string;
}

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= BODY_MAX_LENGTH) return oneLine;
  return `${oneLine.slice(0, BODY_MAX_LENGTH - 1).trimEnd()}…`;
}

export function buildNotificationContent(
  event: EventEnvelope,
  state: ChatState,
): NotificationContent | null {
  const chatId = event.chat_id || state.activeChatId;
  const session = state.sessionsById[chatId];
  const title = session ? chatDisplayTitle(session) : "Hermes";
  const p = event.payload ?? {};

  let body: string;
  switch (event.type) {
    case "assistant_done": {
      const text = p.final_text != null ? String(p.final_text) : "";
      if (p.interrupted === true && !text.trim()) return null;
      body = snippet(text) || "Reply finished";
      break;
    }
    case "assistant_image":
      body = p.caption != null && String(p.caption).trim()
        ? snippet(`Sent an image: ${String(p.caption)}`)
        : "Sent an image";
      break;
    case "assistant_file":
      body = snippet(`Sent a file: ${String(p.filename ?? "file")}`);
      break;
    case "assistant_audio":
      body = "Sent an audio message";
      break;
    case "assistant_buttons": {
      const label = String(p.title ?? p.body ?? p.text ?? "Waiting for your input");
      body = snippet(label);
      break;
    }
    case "assistant_error":
      body = snippet(`Error: ${String(p.message ?? p.code ?? "unknown")}`);
      break;
    default:
      return null;
  }

  // Coalesce bursts per session: same tag replaces the previous notification.
  return { chatId, title, body, tag: chatId };
}

/**
 * Fires a browser notification for an inbound event when the tab is
 * backgrounded and the user opted in. Clicking focuses the window and selects
 * the originating session.
 */
export function maybeNotify(
  event: EventEnvelope,
  state: ChatState,
  backgrounded: boolean,
  onSelectChat: (chatId: string) => void,
): void {
  const supported = typeof window !== "undefined" && "Notification" in window;
  if (
    !shouldNotify({
      supported,
      enabled: isNotificationsEnabled(),
      permission: supported ? Notification.permission : "denied",
      backgrounded,
      eventType: event.type,
    })
  ) {
    return;
  }
  const content = buildNotificationContent(event, state);
  if (!content) return;
  try {
    const n = new Notification(content.title, {
      body: content.body,
      tag: content.tag,
      icon: "/favicon.svg",
    });
    n.onclick = () => {
      window.focus();
      onSelectChat(content.chatId);
      n.close();
    };
  } catch {
    // Android Chrome throws for page-context notifications (needs a service
    // worker, out of scope) — title/favicon badges still carry the signal.
  }
}
