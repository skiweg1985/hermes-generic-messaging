import { useEffect, useRef, useState } from "react";

/**
 * Raw viewport measurements collected from `window` / `visualViewport`.
 * This is the single source of truth for viewport/keyboard state; derived
 * layout values live in `useKeyboardInset`.
 */
export interface ViewportMetrics {
  innerHeight: number;
  visualHeight: number;
  offsetTop: number;
  isMobileDock: boolean;
  isAppleTouchDevice: boolean;
  editableFocused: boolean;
}

const MOBILE_DOCK_QUERY = "(max-width: 720px)";

let appleTouchDeviceCache: boolean | null = null;

function detectAppleTouchDevice(): boolean {
  if (appleTouchDeviceCache !== null) return appleTouchDeviceCache;
  if (typeof navigator === "undefined") {
    appleTouchDeviceCache = false;
    return appleTouchDeviceCache;
  }
  appleTouchDeviceCache =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return appleTouchDeviceCache;
}

function hasEditableFocus(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === "textarea" || tag === "input" || active.hasAttribute("contenteditable");
}

/** Read a fresh viewport snapshot from the DOM. */
export function readViewportMetrics(): ViewportMetrics {
  const viewport = typeof window !== "undefined" ? window.visualViewport : undefined;
  const innerHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const visualHeight = viewport?.height ?? innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const isMobileDock =
    typeof window !== "undefined" && window.matchMedia(MOBILE_DOCK_QUERY).matches;
  return {
    innerHeight,
    visualHeight,
    offsetTop,
    isMobileDock,
    isAppleTouchDevice: detectAppleTouchDevice(),
    editableFocused: hasEditableFocus(),
  };
}

/**
 * Subscribe to viewport changes without triggering React re-renders.
 * The callback runs on a rAF plus follow-up timers to settle iOS keyboard
 * animations. Returns nothing; consumers read `ViewportMetrics` per call.
 */
export function useViewportMetrics(onMetrics: (metrics: ViewportMetrics) => void): void {
  const callbackRef = useRef(onMetrics);
  callbackRef.current = onMetrics;

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    const timers: number[] = [];
    const mobileDockQuery = window.matchMedia(MOBILE_DOCK_QUERY);
    const virtualKeyboard = navigator.virtualKeyboard;

    const emit = () => callbackRef.current(readViewportMetrics());

    const schedule = () => {
      cancelAnimationFrame(frame);
      while (timers.length > 0) {
        const timer = timers.pop();
        if (timer != null) window.clearTimeout(timer);
      }
      frame = requestAnimationFrame(emit);
      // iOS settles the keyboard/viewport over several frames; re-sample so the
      // final geometry wins even if intermediate events report stale values.
      timers.push(window.setTimeout(emit, 80));
      timers.push(window.setTimeout(emit, 260));
      timers.push(window.setTimeout(emit, 520));
    };

    schedule();
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
    virtualKeyboard?.addEventListener("geometrychange", schedule);
    mobileDockQuery.addEventListener("change", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("focusin", schedule);
    window.addEventListener("focusout", schedule);

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      virtualKeyboard?.removeEventListener("geometrychange", schedule);
      mobileDockQuery.removeEventListener("change", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("focusin", schedule);
      window.removeEventListener("focusout", schedule);
    };
  }, []);
}

/**
 * Reactive variant that exposes `ViewportMetrics` as React state.
 * Intended for diagnostics (e.g. the dev overlay); prefer `useViewportMetrics`
 * for imperative work to avoid re-render churn on every keyboard frame.
 */
export function useViewportMetricsState(): ViewportMetrics {
  const [metrics, setMetrics] = useState<ViewportMetrics>(() => readViewportMetrics());
  useViewportMetrics(setMetrics);
  return metrics;
}
