import { useCallback, useEffect, useRef, useState } from "react";

interface UseScrollFollowResult {
  scrollerRef: React.RefObject<HTMLDivElement>;
  isPinned: boolean;
  hasNew: boolean;
  scrollToBottom: (smooth?: boolean) => void;
}

/**
 * Auto-follow scroll for streaming chat content.
 * - Sticks to bottom while the user is within `threshold` px of it.
 * - When the user scrolls up, content stops following and `hasNew` flags new
 *   content that arrived while detached.
 */
export function useScrollFollow(
  trigger: unknown,
  threshold = 120,
  sessionKey?: string,
): UseScrollFollowResult {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const pinnedRef = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    pinnedRef.current = true;
    setIsPinned(true);
    setHasNew(false);
  }, []);

  // Observe scroll position to track "near bottom" state.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    const handler = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const pinned = distance <= threshold;
        pinnedRef.current = pinned;
        setIsPinned(pinned);
        if (pinned) setHasNew(false);
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);

  // Jump to latest when switching chat sessions.
  useEffect(() => {
    if (sessionKey === undefined) return;
    pinnedRef.current = true;
    setIsPinned(true);
    setHasNew(false);
    requestAnimationFrame(() => scrollToBottom(false));
  }, [sessionKey, scrollToBottom]);

  // React to new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (pinnedRef.current) {
      // Smooth follow when pinned.
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    } else {
      setHasNew(true);
    }
  }, [trigger]);

  return { scrollerRef, isPinned, hasNew, scrollToBottom };
}
