import { useEffect, useState } from "react";
import { useViewportMetricsState } from "../../hooks/useVisualViewport";
import { useKeyboardOpen } from "../../hooks/useKeyboardInset";
import "./viewport-debug-overlay.css";

const STORAGE_KEY = "vdebug";

function shouldEnable(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const flag = params.get(STORAGE_KEY);
  if (flag === "1" || flag === "true") {
    window.localStorage.setItem(STORAGE_KEY, "1");
    return true;
  }
  if (flag === "0" || flag === "false") {
    window.localStorage.removeItem(STORAGE_KEY);
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function readCssVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || "-";
}

function measureComposerHeight(): number {
  const el = document.querySelector<HTMLElement>(".composer-region");
  return el ? Math.round(el.getBoundingClientRect().height) : 0;
}

function measureShellTop(): string {
  const el = document.querySelector<HTMLElement>(".shell-root");
  return el ? `${Math.round(el.getBoundingClientRect().top)}px` : "-";
}

/**
 * Development-only overlay that surfaces live viewport/keyboard metrics.
 * Toggle with `?vdebug=1` (persisted) or `?vdebug=0` to clear.
 */
export function ViewportDebugOverlay() {
  const [enabled] = useState(shouldEnable);
  const metrics = useViewportMetricsState();
  const keyboardOpen = useKeyboardOpen();
  const [derived, setDerived] = useState({
    clearance: "-",
    viewportHeight: "-",
    composerHeight: 0,
    shellTop: "-",
    scrollY: 0,
    safeAreaTop: "-",
    safeAreaBottom: "-",
    zoomScale: "-",
  });

  useEffect(() => {
    if (!enabled) return;
    setDerived({
      clearance: readCssVar("--composer-clearance"),
      viewportHeight: readCssVar("--app-viewport-height"),
      composerHeight: measureComposerHeight(),
      shellTop: measureShellTop(),
      scrollY: Math.round(window.scrollY),
      safeAreaTop: readCssVar("--vdebug-safe-area-top"),
      safeAreaBottom: readCssVar("--vdebug-safe-area-bottom"),
      zoomScale: window.visualViewport ? window.visualViewport.scale.toFixed(3) : "-",
    });
  }, [enabled, metrics]);

  if (!enabled) return null;

  const rows: Array<[string, string | number]> = [
    ["innerHeight", metrics.innerHeight],
    ["visualHeight", Math.round(metrics.visualHeight)],
    ["offsetTop", Math.round(metrics.offsetTop)],
    ["scrollY", derived.scrollY],
    ["shellTop", derived.shellTop],
    ["safeAreaTop", derived.safeAreaTop],
    ["safeAreaBottom", derived.safeAreaBottom],
    ["zoomScale", derived.zoomScale],
    ["keyboardInset", Math.max(0, metrics.innerHeight - Math.round(metrics.visualHeight))],
    ["viewportHeight var", derived.viewportHeight],
    ["composer-clearance", derived.clearance],
    ["composerHeight", derived.composerHeight],
    ["mobileDock", String(metrics.isMobileDock)],
    ["appleTouch", String(metrics.isAppleTouchDevice)],
    ["editableFocused", String(metrics.editableFocused)],
    ["keyboardOpen", String(keyboardOpen)],
  ];

  return (
    <div className="viewport-debug-overlay" role="status" aria-live="off">
      <div className="viewport-debug-overlay-title">viewport</div>
      {rows.map(([label, value]) => (
        <div className="viewport-debug-overlay-row" key={label}>
          <span className="viewport-debug-overlay-key">{label}</span>
          <span className="viewport-debug-overlay-val">{value}</span>
        </div>
      ))}
    </div>
  );
}
