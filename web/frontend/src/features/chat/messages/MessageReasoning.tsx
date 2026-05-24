import { useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "../../../types/events";
import { IconBrain, IconChevronDown } from "../../shell/icons";
import { MarkdownText } from "../MarkdownText";
import { normalizeReasoningDisplay, stripReasoningPrefix } from "../reasoningSplit";

interface MessageReasoningProps {
  /** Reasoning text (may stream). */
  text: string;
  /** True while the assistant turn is still active. */
  active: boolean;
  /** Source line (for accessibility ids). */
  line?: TranscriptLine;
}

const COLLAPSE_DELAY_MS = 600;

function formatDurationMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 100) / 10);
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export function MessageReasoning({ text, active, line }: MessageReasoningProps) {
  const stripped = normalizeReasoningDisplay(stripReasoningPrefix(text));
  const startedAtRef = useRef<number>(Date.now());
  /** Frozen duration once the turn ends — avoids counting up on expand/collapse re-renders. */
  const finishedElapsedMsRef = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [userOverride, setUserOverride] = useState<null | boolean>(null);
  const [tick, setTick] = useState(0);
  const wasActiveRef = useRef(active);

  // Auto-collapse shortly after the turn becomes inactive.
  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      finishedElapsedMsRef.current = null;
      return;
    }
    if (finishedElapsedMsRef.current === null) {
      finishedElapsedMsRef.current = Math.max(0, Date.now() - startedAtRef.current);
    }
    if (wasActiveRef.current && userOverride === null) {
      const id = window.setTimeout(() => {
        setUserOverride(false); // collapse
      }, COLLAPSE_DELAY_MS);
      wasActiveRef.current = false;
      return () => window.clearTimeout(id);
    }
  }, [active, userOverride]);

  // Update elapsed display while streaming.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((v) => (v + 1) % 1_000_000), 250);
    return () => window.clearInterval(id);
  }, [active]);
  void tick;

  // Auto-scroll within reasoning body to the last paragraph while streaming.
  useEffect(() => {
    if (!active) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active, text]);

  if (!stripped) return null;

  // Resolved open state:
  // - while active and no explicit override → open
  // - after done → collapsed unless user opened
  const open =
    userOverride !== null ? userOverride : active;

  const elapsedMs = active
    ? Date.now() - startedAtRef.current
    : (finishedElapsedMsRef.current ?? Date.now() - startedAtRef.current);
  const headerLabel = active
    ? `Thinking · ${formatDurationMs(elapsedMs)}`
    : `Thought for ${formatDurationMs(elapsedMs)}`;

  return (
    <section
      className={`reasoning${open ? " reasoning-open" : " reasoning-collapsed"}${active ? " reasoning-active" : ""}`}
      aria-label="Assistant reasoning"
      data-line-id={line?.id}
    >
      <button
        type="button"
        className="reasoning-header"
        onClick={() => setUserOverride((v) => !(v ?? active))}
        aria-expanded={open}
      >
        <span className="reasoning-glyph" aria-hidden>
          {active ? (
            <span className="reasoning-pulse" />
          ) : (
            <IconBrain size={12} />
          )}
        </span>
        <span className="t-meta reasoning-header-label">{headerLabel}</span>
        <IconChevronDown
          size={12}
          className={`reasoning-chev${open ? " reasoning-chev-open" : ""}`}
        />
      </button>

      {open ? (
        <div
          ref={bodyRef}
          className={`reasoning-body${active ? " reasoning-body-active" : ""}`}
        >
          <MarkdownText text={stripped} />
        </div>
      ) : null}
    </section>
  );
}
