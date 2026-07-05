import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptLine } from "../../types/events";
import { IconCheck, IconAlert, IconChevronDown } from "../shell/icons";
import { parseStructuredActivityTimeline, type ParsedActivity } from "./toolRegistry";

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

function useVanishOnCompletion(state: ParsedActivity["state"], resetKey: string) {
  const wasRunningRef = useRef(state === "running");
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">(() =>
    state === "success" || state === "idle" ? "gone" : "visible",
  );

  useEffect(() => {
    wasRunningRef.current = state === "running";
    setPhase(state === "success" || state === "idle" ? "gone" : "visible");
  }, [resetKey]);

  useEffect(() => {
    if (state === "running") {
      wasRunningRef.current = true;
      setPhase("visible");
      return;
    }
    if (state === "error") {
      setPhase("visible");
      return;
    }
    if (state !== "success" && state !== "idle") return;
    if (!wasRunningRef.current) {
      setPhase("gone");
      return;
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const settleDelay = reducedMotion ? 600 : 1500;
    const animationMs = reducedMotion ? 0 : 420;
    const leaveId = window.setTimeout(() => setPhase("leaving"), settleDelay);
    const goneId = window.setTimeout(() => setPhase("gone"), settleDelay + animationMs);
    return () => {
      window.clearTimeout(leaveId);
      window.clearTimeout(goneId);
    };
  }, [state]);

  return phase;
}

function stateLabel(state: ParsedActivity["state"]): string {
  if (state === "running") return "running";
  if (state === "success") return "done";
  if (state === "error") return "error";
  return "idle";
}

function statusGlyph(state: ParsedActivity["state"], Icon: ParsedActivity["meta"]["icon"]) {
  if (state === "running") return <span className="activity-card-spinner" />;
  if (state === "success") return <IconCheck size={14} />;
  if (state === "error") return <IconAlert size={14} />;
  return <Icon size={14} />;
}

function TimelineEntry({ entry, active }: { entry: ParsedActivity; active: boolean }) {
  const Icon = entry.meta.icon;
  return (
    <li className={`activity-timeline-entry activity-timeline-entry-${entry.state}${active ? " activity-timeline-entry-active" : ""}`}>
      <span className="activity-timeline-rail" aria-hidden>
        <span className="activity-timeline-dot">{statusGlyph(entry.state, Icon)}</span>
      </span>
      <span className="activity-timeline-copy">
        <span className="activity-timeline-title t-body-sm">
          {entry.meta.label}
          <span className="activity-timeline-tool t-meta"> · {entry.rawName}</span>
        </span>
        {entry.summary ? (
          <span className="activity-timeline-summary t-mono-sm" title={entry.summary}>{entry.summary}</span>
        ) : null}
      </span>
      <span className="activity-timeline-state t-mono-sm">{stateLabel(entry.state)}</span>
    </li>
  );
}

export function ActivityCard({ line }: ActivityCardProps) {
  const parsedTimeline = useMemo(() => parseStructuredActivityTimeline(line), [line]);
  const parsed = parsedTimeline.primary;
  const entries = parsedTimeline.entries;
  const [open, setOpen] = useState(false);

  const running = parsed.state === "running";
  const elapsedMs = useElapsed(running, line.id);
  const visibleDurationMs = running ? elapsedMs : line.toolDurationMs;

  const stateClass = `activity-card-state-${parsed.state}`;
  const Icon = parsed.meta.icon;
  const label = stateLabel(parsed.state);
  const vanishPhase = useVanishOnCompletion(parsed.state, line.id);

  const hasTimeline = entries.length > 1;
  const hasDetail = parsed.detail.length > 0 || hasTimeline;
  const runningEntryIndex = entries.findIndex((entry) => entry.state === "running");
  const activeTimelineIndex = runningEntryIndex >= 0 ? runningEntryIndex : entries.length - 1;

  if (vanishPhase === "gone") return null;

  return (
    <section
      className={`activity-card ${stateClass}${open ? " activity-card-open" : ""}${hasTimeline ? " activity-card-has-timeline" : ""}${vanishPhase === "leaving" ? " activity-card-leaving" : ""}`}
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
          {statusGlyph(parsed.state, Icon)}
        </span>

        <span className="activity-card-titles">
          <span className="activity-card-title t-body-sm">
            {parsed.title}
          </span>
          {parsed.summary ? (
            <span className="activity-card-summary t-mono-sm" title={parsed.summary}>
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

      {hasTimeline && !open ? (
        <ol className="activity-timeline activity-timeline-compact" aria-label="Tool activity timeline">
          {entries.map((entry, index) => (
            <TimelineEntry
              key={`${entry.rawName}-${index}-${entry.summary}`}
              entry={entry}
              active={index === activeTimelineIndex}
            />
          ))}
        </ol>
      ) : null}

      {open && hasDetail ? (
        <div className="activity-card-body">
          {hasTimeline ? (
            <ol className="activity-timeline" aria-label="Tool activity timeline details">
              {entries.map((entry, index) => (
                <TimelineEntry
                  key={`${entry.rawName}-${index}-${entry.summary}`}
                  entry={entry}
                  active={index === activeTimelineIndex}
                />
              ))}
            </ol>
          ) : null}
          {parsed.detail ? <pre className="activity-card-detail t-mono-sm">{parsed.detail}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}
