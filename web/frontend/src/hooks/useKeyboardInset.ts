import { useEffect, useState } from "react";
import { useViewportMetrics, type ViewportMetrics } from "./useVisualViewport";

/** CSS custom properties written to `document.documentElement`. */
export type ViewportVarName =
  | "--app-viewport-height"
  | "--app-visual-viewport-height"
  | "--app-visual-viewport-offset-top"
  | "--app-visual-viewport-bottom"
  | "--app-viewport-offset-top"
  | "--app-keyboard-inset";

export interface DerivedViewport {
  vars: Record<ViewportVarName, string>;
  /** Re-pin the document to (0,0). Only when the keyboard is closed. */
  resetScroll: boolean;
  /** Virtual keyboard is currently displacing the visual viewport. */
  keyboardOpen: boolean;
}

const MOBILE_MIN_HEIGHT = 140;
const DESKTOP_MIN_HEIGHT = 320;
const KEYBOARD_OPEN_THRESHOLD = 100;

const VAR_NAMES: ViewportVarName[] = [
  "--app-viewport-height",
  "--app-visual-viewport-height",
  "--app-visual-viewport-offset-top",
  "--app-visual-viewport-bottom",
  "--app-viewport-offset-top",
  "--app-keyboard-inset",
];

/**
 * Pure derivation of layout CSS variables from raw viewport metrics.
 *
 * iOS behaviour encoded here:
 * - On mobile the shell is cut to the visual viewport height.
 * - `--app-viewport-offset-top` follows `visualViewport.offsetTop` on mobile.
 *   When the keyboard opens, iOS scrolls the layout viewport to reveal the
 *   focused field; a fixed shell pinned to top:0 would then be pushed out of
 *   view. Tracking `offsetTop` keeps the shell glued to the visible viewport so
 *   the composer stays in place. The scroll reset (below) is only applied on
 *   keyboard close, so there is no scroll/offset feedback loop that could
 *   flicker.
 * - `--app-keyboard-inset` stays 0: the shrunk shell already absorbs the
 *   keyboard, so no bottom inset is applied to composer/transcript.
 * - The scroll reset only fires when no input is focused.
 */
export function deriveViewport(metrics: ViewportMetrics): DerivedViewport {
  const { innerHeight, visualHeight, offsetTop, isMobileDock, isAppleTouchDevice, editableFocused } =
    metrics;

  const keyboardFocused = isAppleTouchDevice && editableFocused;
  const height = isMobileDock
    ? visualHeight
    : keyboardFocused
      ? visualHeight
      : Math.min(innerHeight, visualHeight);

  // Landscape + keyboard can shrink the visual viewport well below 320px; a
  // lower floor on mobile keeps the composer above the keyboard instead of an
  // oversized shell that pushes it back out of view.
  const minHeight = isMobileDock ? MOBILE_MIN_HEIGHT : DESKTOP_MIN_HEIGHT;
  const keyboardOpen =
    isMobileDock && editableFocused && innerHeight - visualHeight > KEYBOARD_OPEN_THRESHOLD;

  return {
    vars: {
      "--app-viewport-height": `${Math.max(minHeight, Math.round(height))}px`,
      "--app-visual-viewport-height": `${Math.max(320, Math.round(visualHeight))}px`,
      "--app-visual-viewport-offset-top": `${
        isMobileDock ? Math.max(0, Math.round(offsetTop)) : 0
      }px`,
      "--app-visual-viewport-bottom": `${Math.max(320, Math.round(offsetTop + visualHeight))}px`,
      "--app-viewport-offset-top": `${isMobileDock ? Math.max(0, Math.round(offsetTop)) : 0}px`,
      "--app-keyboard-inset": "0px",
    },
    resetScroll: !isMobileDock || !editableFocused,
    keyboardOpen,
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

/**
 * Applies the derived viewport CSS variables and manages iOS scroll pinning.
 * Owns the `virtualKeyboard.overlaysContent` setup so the browser shrinks the
 * viewport (instead of overlaying) when the keyboard opens.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const virtualKeyboard = navigator.virtualKeyboard;
    const previousOverlay = virtualKeyboard?.overlaysContent;
    const mobileDock = window.matchMedia("(max-width: 720px)").matches;
    if (virtualKeyboard && mobileDock) {
      virtualKeyboard.overlaysContent = false;
    }
    return () => {
      if (virtualKeyboard && previousOverlay !== undefined) {
        virtualKeyboard.overlaysContent = previousOverlay;
      }
      const rootStyle = document.documentElement.style;
      VAR_NAMES.forEach((name) => rootStyle.removeProperty(name));
      setKeyboardOpen(false);
    };
  }, []);

  useViewportMetrics((metrics) => {
    const { vars, resetScroll, keyboardOpen } = deriveViewport(metrics);
    const rootStyle = document.documentElement.style;
    (Object.keys(vars) as ViewportVarName[]).forEach((name) => {
      rootStyle.setProperty(name, vars[name]);
    });
    if (resetScroll && (window.scrollX !== 0 || window.scrollY !== 0)) {
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
