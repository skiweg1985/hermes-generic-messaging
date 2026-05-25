import { useEffect } from "react";

export interface Shortcut {
  /** Combo string like "mod+k", "mod+shift+k", "mod+1", "escape". */
  combo: string;
  handler: (event: KeyboardEvent) => void;
  /** If true, runs even when focus is inside input/textarea. */
  whenTyping?: boolean;
  /** Prevent default when matched. */
  preventDefault?: boolean;
}

function parseCombo(combo: string) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  return {
    key,
    mod: parts.includes("mod") || parts.includes("cmd") || parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("opt"),
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function matches(event: KeyboardEvent, spec: ReturnType<typeof parseCombo>): boolean {
  const wantsMod = spec.mod;
  const hasMod = event.metaKey || event.ctrlKey;
  if (wantsMod && !hasMod) return false;
  if (!wantsMod && hasMod && spec.key !== "escape") return false;
  if (spec.shift !== event.shiftKey) return false;
  if (spec.alt !== event.altKey) return false;
  const k = event.key.toLowerCase();
  // Number keys: mod+1..9
  if (spec.key.length === 1 && /[0-9a-z/.]/.test(spec.key)) {
    return k === spec.key;
  }
  if (spec.key === "escape") return k === "escape";
  if (spec.key === "enter") return k === "enter";
  return k === spec.key;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      for (const sc of shortcuts) {
        const spec = parseCombo(sc.combo);
        if (typing && !sc.whenTyping) continue;
        if (!matches(event, spec)) continue;
        if (sc.preventDefault !== false) event.preventDefault();
        sc.handler(event);
        break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
