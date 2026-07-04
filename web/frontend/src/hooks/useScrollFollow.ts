import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboardOpen } from "./useKeyboardInset";

/**
 * Scroll-follow lifecycle.
 * - `pinned`: view sticks to the bottom and auto-follows new content.
 * - `userDetached`: user scrolled up; auto-follow paused, new content flagged.
 * - `keyboardAdjusting`: transient while the mobile keyboard resizes the layout.
 * - `restoring`: transient during a programmatic jump to the bottom.
 */
export type ScrollFollowState = "pinned" | "userDetached" | "keyboardAdjusting" | "restoring";

interface UseScrollFollowResult {
  scrollerRef: React.RefObject<HTMLDivElement>;
  isPinned: boolean;
  hasNew: boolean;
  state: ScrollFollowState;
  scrollToBottom: (smooth?: boolean) => void;
}

/** Programmatic scrolls emit intermediate scroll events; ignore them this long. */
const PROGRAMMATIC_GUARD_MS = 450;

function shouldSmoothScroll(smooth: boolean) {
  if (!smooth) return false;
  if (typeof window === "undefined") return smooth;
  return !window.matchMedia("(pointer: coarse)").matches;
}

export function useScrollFollow(
  trigger: unknown,
  threshold = 120,
  sessionKey?: string,
): UseScrollFollowResult {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ScrollFollowState>("pinned");
  const [hasNew, setHasNew] = useState(false);

  const stateRef = useRef<ScrollFollowState>("pinned");
  const pinnedRef = useRef(true);
  const programmaticUntilRef = useRef(0);
  const keyboardOpen = useKeyboardOpen();

  const setFollowState = useCallback((next: ScrollFollowState) => {
    stateRef.current = next;
    pinnedRef.current = next === "pinned" || next === "restoring" || next === "keyboardAdjusting";
    setState(next);
  }, []);

  const jumpToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollerRef.current;
      if (!el) return;
      programmaticUntilRef.current = Date.now() + PROGRAMMATIC_GUARD_MS;
      el.scrollTo({ top: el.scrollHeight, behavior: shouldSmoothScroll(smooth) ? "smooth" : "auto" });
    },
    [],
  );

  const scrollToBottom = useCallback(
    (smooth = true) => {
      setFollowState("restoring");
      setHasNew(false);
      jumpToBottom(smooth);
      requestAnimationFrame(() => setFollowState("pinned"));
    },
    [jumpToBottom, setFollowState],
  );

  // Track "near bottom" from user scrolling, ignoring programmatic scrolls.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    const handler = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nearBottom = distance <= threshold;
        if (nearBottom) {
          setHasNew(false);
          if (stateRef.current !== "pinned") setFollowState("pinned");
          return;
        }
        // Only a genuine user scroll (not a programmatic jump) detaches.
        if (Date.now() >= programmaticUntilRef.current && stateRef.current !== "keyboardAdjusting") {
          if (stateRef.current !== "userDetached") setFollowState("userDetached");
        }
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      cancelAnimationFrame(frame);
    };
  }, [threshold, setFollowState]);

  // Keep pinned content above the composer when rendered media changes height.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const followResize = () => {
      if (!pinnedRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => jumpToBottom(false));
    };
    const observer = new ResizeObserver(followResize);
    observer.observe(el);
    const content = el.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [jumpToBottom]);

  // Re-pin to the bottom when the mobile keyboard opens/closes while pinned, so
  // the latest message stays visible above the composer instead of being pushed
  // past the top edge.
  useEffect(() => {
    if (!pinnedRef.current) return;
    setFollowState("keyboardAdjusting");
    const timer = window.setTimeout(() => {
      jumpToBottom(false);
      requestAnimationFrame(() => setFollowState("pinned"));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [keyboardOpen, jumpToBottom, setFollowState]);

  // Jump to latest when switching chat sessions.
  useEffect(() => {
    if (sessionKey === undefined) return;
    setHasNew(false);
    setFollowState("restoring");
    requestAnimationFrame(() => {
      jumpToBottom(false);
      requestAnimationFrame(() => setFollowState("pinned"));
    });
  }, [sessionKey, jumpToBottom, setFollowState]);

  // React to new content: follow when pinned, otherwise flag new content.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (pinnedRef.current) {
      requestAnimationFrame(() => jumpToBottom(true));
    } else {
      setHasNew(true);
    }
  }, [trigger, jumpToBottom]);

  return {
    scrollerRef,
    isPinned: state === "pinned",
    hasNew,
    state,
    scrollToBottom,
  };
}
