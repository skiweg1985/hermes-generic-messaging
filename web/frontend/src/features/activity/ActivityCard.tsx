import { useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "../../types/events";
import { IconCheck, IconAlert, IconChevronDown } from "../shell/icons";
import { parseActivity } from "./toolRegistry";

interface ActivityCardProps {
  line: TranscriptLine;
  /** True while the assistant turn this activity belongs to is still active. */
  turnActive: boolean;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function useElapsed(running: boolean): number {
  const startRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setTick((v) => (v + 1) % 1_000_000);
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);
  // Touch tick so React subscribes — return current elapsed.
  void tick;
  return Date.now() - startRef.current;
}

export function ActivityCard({ line, turnActive }: ActivityCardProps) {
  const parsed = parseActivity(line.text);
  const [open, setOpen] = useState(false);

  // The reducer never marks notice lines as "streaming"; the running state
  // is inferred from the parent turn and the parsed state.
  const running = turnActive && parsed.state === "running";
  const elapsedMs = useElapsed(running);

  const stateClass = `activity-card-state-${parsed.state}`;
  const Icon = parsed.meta.icon;

  const hasDetail = parsed.detail.length > 0;

  return (
    <section
      className={`activity-card ${stateClass}${open ? " activity-card-open" : ""}`}
      data-tool={parsed.meta.kind}
      aria-label={parsed.title}
    >
      <button
        type="button"
        className="activity-card-head"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!hasDetail}
      >
        <span className="activity-card-glyph" aria-hidden>
          {running ? (
            <span className="activity-card-spinner" />
          ) : parsed.state === "success" ? (
            <IconCheck size={14} />
          ) : parsed.state === "error" ? (
            <IconAlert size={14} />
          ) : (
            <Icon size={14} />
          )}
        </span>

        <span className="activity-card-titles">
          <span className="activity-card-title t-body-sm truncate">
            {parsed.title}
          </span>
          {parsed.summary ? (
            <span className="activity-card-summary t-meta truncate">
              {parsed.summary}
            </span>
          ) : null}
        </span>

        <span className="activity-card-meta">
          <span className="t-mono-sm activity-card-state-label">
            {parsed.state === "running"
              ? "running"
              : parsed.state === "success"
                ? "done"
                : parsed.state === "error"
                  ? "error"
                  : "idle"}
          </span>
          {running ? (
            <span className="t-mono-sm activity-card-elapsed">
              {formatElapsed(elapsedMs)}
            </span>
          ) : null}
          {hasDetail ? (
            <IconChevronDown
              size={12}
              className={`activity-card-chev${open ? " activity-card-chev-open" : ""}`}
            />
          ) : null}
        </span>
      </button>

      {running ? <span className="activity-card-shimmer" aria-hidden /> : null}

      {open && hasDetail ? (
        <div className="activity-card-body">
          <pre className="activity-card-detail t-mono-sm">{parsed.detail}</pre>
        </div>
      ) : null}
    </section>
  );
}
