import { useEffect, useRef, useState } from "react";
import { useViewportMetrics, type ViewportMetrics } from "./useVisualViewport";

/** CSS custom properties written to `document.documentElement`. */
export type ViewportVarName =
  | "--app-viewport-height"
  | "--app-visual-viewport-height"
  | "--app-visual-viewport-offset-top"
  | "--app-visual-viewport-bottom"
  | "--app-viewport-offset-top"
  | "--app-shell-bottom"
  | "--app-keyboard-inset";

export interface DerivedViewport {
  vars: Record<ViewportVarName, string>;
  /** Re-pin the document to (0,0). Only when the keyboard is closed. */
  resetScroll: boolean;
  /** Virtual keyboard is currently displacing the visual viewport. */
  keyboardOpen: boolean;
  /** Shell is glued to the visual viewport bottom (above the keyboard). */
  bottomAnchored: boolean;
  /** Pin layout scroll while the keyboard is open on mobile. */
  pinDocumentScroll: boolean;
}

interface StableClosedViewport {
  innerHeight: number;
  visualHeight: number;
}

const MOBILE_MIN_HEIGHT = 140;
const DESKTOP_MIN_HEIGHT = 320;
const KEYBOARD_OPEN_THRESHOLD = 100;
const CLOSED_VIEWPORT_ROTATION_THRESHOLD = 120;

const VAR_NAMES: ViewportVarName[] = [
  "--app-viewport-height",
  "--app-visual-viewport-height",
  "--app-visual-viewport-offset-top",
  "--app-visual-viewport-bottom",
  "--app-viewport-offset-top",
  "--app-shell-bottom",
  "--app-keyboard-inset",
];

/**
 * Pure derivation of layout CSS variables from raw viewport metrics.
 *
 * iOS behaviour encoded here:
 * - On mobile the shell is cut to the visual viewport height. This keeps the
 *   app aligned with Safari's visible area and avoids hiding the header behind
 *   browser chrome.
 * - While the keyboard is open the shell is bottom-anchored above the keyboard
 *   instead of top-anchored on offsetTop. iOS can drop offsetTop when the user
 *   rubber-bands the page; top anchoring then lifts the composer away from the
 *   keyboard, bottom anchoring keeps the dock glued to the visual viewport.
 * - `--app-visual-viewport-offset-top` always mirrors the raw offset for
 *   diagnostics; it does not drive shell layout when bottom-anchored.
 * - `--app-keyboard-inset` stays 0: the shrunk shell already absorbs the
 *   keyboard, so no bottom inset is applied to composer/transcript.
 * - The scroll reset only fires when no input is focused.
 */
export function deriveViewport(metrics: ViewportMetrics): DerivedViewport {
  const { innerHeight, visualHeight, offsetTop, isMobileDock, isAppleTouchDevice, editableFocused } =
    metrics;

  const keyboardFocused = editableFocused && (isMobileDock || isAppleTouchDevice);
  const height = isMobileDock
    ? visualHeight
    : keyboardFocused
      ? visualHeight
      : Math.min(innerHeight, visualHeight);

  const minHeight = isMobileDock ? MOBILE_MIN_HEIGHT : DESKTOP_MIN_HEIGHT;
  const keyboardOpen =
    isMobileDock && editableFocused && innerHeight - visualHeight > KEYBOARD_OPEN_THRESHOLD;

  const bottomAnchored = isMobileDock && editableFocused && keyboardOpen;
  const rawOffsetTop = isMobileDock ? Math.max(0, Math.round(offsetTop)) : 0;
  const shellBottom = bottomAnchored
    ? Math.max(0, Math.round(innerHeight - offsetTop - visualHeight))
    : 0;
  const shellOffsetTop = bottomAnchored || !editableFocused ? 0 : rawOffsetTop;

  return {
    vars: {
      "--app-viewport-height": `${Math.max(minHeight, Math.round(height))}px`,
      "--app-visual-viewport-height": `${Math.max(320, Math.round(visualHeight))}px`,
      "--app-visual-viewport-offset-top": `${rawOffsetTop}px`,
      "--app-visual-viewport-bottom": `${Math.max(320, Math.round(rawOffsetTop + visualHeight))}px`,
      "--app-viewport-offset-top": `${shellOffsetTop}px`,
      "--app-shell-bottom": `${shellBottom}px`,
      "--app-keyboard-inset": "0px",
    },
    resetScroll: !isMobileDock || !editableFocused,
    keyboardOpen,
    bottomAnchored,
    pinDocumentScroll: isMobileDock && keyboardOpen,
  };
}

function stabilizeClosedViewport(
  metrics: ViewportMetrics,
  stableClosed: StableClosedViewport | null,
): { metrics: ViewportMetrics; stableClosed: StableClosedViewport | null } {
  if (!metrics.isMobileDock) {
    return { metrics, stableClosed: null };
  }

  if (metrics.editableFocused) {
    return { metrics, stableClosed };
  }

  const roundedInnerHeight = Math.round(metrics.innerHeight);
  const roundedVisualHeight = Math.round(metrics.visualHeight);
  const shouldRefreshStableClosed =
    !stableClosed ||
    Math.abs(roundedInnerHeight - stableClosed.innerHeight) > CLOSED_VIEWPORT_ROTATION_THRESHOLD;

  const nextStableClosed = shouldRefreshStableClosed
    ? { innerHeight: roundedInnerHeight, visualHeight: roundedVisualHeight }
    : stableClosed;

  return {
    metrics: {
      ...metrics,
      // When the keyboard is closed, iOS can still emit tiny visualViewport
      // resize/scroll changes during rubber-band and browser-bar gestures. The
      // app shell should not follow those; it should stay aligned to the last
      // stable closed viewport until a real orientation/height change occurs.
      visualHeight: nextStableClosed.visualHeight,
      offsetTop: 0,
    },
    stableClosed: nextStableClosed,
  };
}

type KeyboardListener = (open: boolean) => void;

const keyboardListeners = new Set<KeyboardListener>();
let keyboardOpenState = false;

function setKeyboardOpen(open: boolean) {
  if (open === keyboardOpenState) return;
  keyboardOpenState = open;
  keyboardListeners.forEach((listener) => listener(open));
}

let lastTouchX = 0;
let lastTouchY = 0;

function findScrollableTarget(
  target: EventTarget | null,
  axis: "x" | "y",
): HTMLElement | HTMLTextAreaElement | null {
  if (!(target instanceof Element)) return null;
  if (axis === "x") {
    // Wide code blocks / tables inside the transcript scroll horizontally in
    // their own overflow-x container. Walk up to (and including) the transcript
    // to find such a container so horizontal panning of it is not blocked.
    const boundary = target.closest(".transcript")?.parentElement ?? null;
    let el: Element | null = target;
    while (el && el !== boundary) {
      if (el instanceof HTMLElement) {
        const overflowX = window.getComputedStyle(el).overflowX;
        if (
          (overflowX === "auto" || overflowX === "scroll") &&
          el.scrollWidth > el.clientWidth + 1
        ) {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }
  const transcript = target.closest(".transcript");
  if (transcript instanceof HTMLElement) return transcript;
  const textarea = target.closest("textarea");
  if (textarea instanceof HTMLTextAreaElement && textarea.scrollHeight > textarea.clientHeight + 1) {
    return textarea;
  }
  return null;
}

function shouldAllowTouchScroll(target: EventTarget | null, currentX: number, currentY: number): boolean {
  const deltaX = currentX - lastTouchX;
  const deltaY = currentY - lastTouchY;
  lastTouchX = currentX;
  lastTouchY = currentY;

  // Predominantly-horizontal drag: allow it only if it lands on a horizontally
  // scrollable container (code block / table) that can still scroll that way.
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    const scrollable = findScrollableTarget(target, "x");
    if (!scrollable) return false;
    const atLeft = scrollable.scrollLeft <= 0;
    const atRight = scrollable.scrollLeft + scrollable.clientWidth >= scrollable.scrollWidth - 1;
    return !((atLeft && deltaX > 0) || (atRight && deltaX < 0));
  }

  const scrollable = findScrollableTarget(target, "y");
  if (!scrollable) return false;
  if (deltaY === 0) return true;

  const { scrollTop, scrollHeight, clientHeight } = scrollable;
  const canScroll = scrollHeight > clientHeight + 1;
  if (!canScroll) return false;

  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  const pullingDown = deltaY > 0;
  const pullingUp = deltaY < 0;

  return !((atTop && pullingDown) || (atBottom && pullingUp));
}

/**
 * Applies the derived viewport CSS variables and manages iOS scroll pinning.
 * Owns the `virtualKeyboard.overlaysContent` setup so the browser shrinks the
 * viewport (instead of overlaying) when the keyboard opens.
 */
export function useKeyboardInset(): void {
  const stableClosedViewportRef = useRef<StableClosedViewport | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const virtualKeyboard = navigator.virtualKeyboard;
    const previousOverlay = virtualKeyboard?.overlaysContent;
    const mobileDock = window.matchMedia("(max-width: 720px)").matches;
    if (virtualKeyboard && mobileDock) {
      virtualKeyboard.overlaysContent = false;
    }

    const onTouchStart = (event: TouchEvent) => {
      lastTouchX = event.touches[0]?.clientX ?? 0;
      lastTouchY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      // Only intercept touch scrolling while the on-screen keyboard is open —
      // that is the only situation where iOS pans the whole page/viewport. With
      // the keyboard closed, native scrolling must work everywhere (drawers,
      // command palette, popovers, code blocks), so do nothing.
      if (!mobileDock || !keyboardOpenState) return;
      const currentX = event.touches[0]?.clientX ?? lastTouchX;
      const currentY = event.touches[0]?.clientY ?? lastTouchY;
      if (shouldAllowTouchScroll(event.target, currentX, currentY)) return;
      event.preventDefault();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      if (virtualKeyboard && previousOverlay !== undefined) {
        virtualKeyboard.overlaysContent = previousOverlay;
      }
      const rootStyle = document.documentElement.style;
      VAR_NAMES.forEach((name) => rootStyle.removeProperty(name));
      document.documentElement.classList.remove("keyboard-open", "shell-bottom-anchored");
      setKeyboardOpen(false);
    };
  }, []);

  useViewportMetrics((metrics) => {
    const stabilized = stabilizeClosedViewport(metrics, stableClosedViewportRef.current);
    stableClosedViewportRef.current = stabilized.stableClosed;
    const { vars, resetScroll, keyboardOpen, bottomAnchored, pinDocumentScroll } =
      deriveViewport(stabilized.metrics);
    const rootStyle = document.documentElement.style;
    (Object.keys(vars) as ViewportVarName[]).forEach((name) => {
      rootStyle.setProperty(name, vars[name]);
    });
    document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
    document.documentElement.classList.toggle("shell-bottom-anchored", bottomAnchored);
    if (
      (resetScroll || pinDocumentScroll) &&
      (window.scrollX !== 0 || window.scrollY !== 0)
    ) {
      window.scrollTo(0, 0);
    }
    setKeyboardOpen(keyboardOpen);
  });
}

/** Reactive keyboard-open signal shared across components. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(keyboardOpenState);
  useEffect(() => {
    setOpen(keyboardOpenState);
    keyboardListeners.add(setOpen);
    return () => {
      keyboardListeners.delete(setOpen);
    };
  }, []);
  return open;
}
