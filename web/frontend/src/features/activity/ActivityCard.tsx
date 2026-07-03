import { useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "../../types/events";
import { IconCheck, IconAlert, IconChevronDown } from "../shell/icons";
import { parseActivity, parseStructuredActivity } from "./toolRegistry";

interface ActivityCardProps {
  line: TranscriptLine;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function useElapsed(running: boolean, resetKey: string): number {
  const startRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    startRef.current = Date.now();
    setTick(0);
  }, [resetKey]);
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

function stateLabel(state: ReturnType<typeof parseActivity>["state"]): string {
  if (state === "running") return "running";
  if (state === "success") return "done";
  if (state === "error") return "error";
  return "idle";
}

export function ActivityCard({ line }: ActivityCardProps) {
  const parsed =
    parseStructuredActivity(line) ?? parseActivity(line.text);
  const [open, setOpen] = useState(false);

  const running = parsed.state === "running";
  const elapsedMs = useElapsed(running, line.id);
  const visibleDurationMs = running ? elapsedMs : line.toolDurationMs;

  const stateClass = `activity-card-state-${parsed.state}`;
  const Icon = parsed.meta.icon;
  const label = stateLabel(parsed.state);

  const hasDetail = parsed.detail.length > 0;

  return (
    <section
      className={`activity-card ${stateClass}${open ? " activity-card-open" : ""}`}
      data-tool={parsed.meta.kind}
      aria-label={parsed.title}
      aria-live={running ? "polite" : undefined}
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
            {label}
          </span>
          {visibleDurationMs != null ? (
            <span className="t-mono-sm activity-card-elapsed">
              {formatElapsed(visibleDurationMs)}
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
