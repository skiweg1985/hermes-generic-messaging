import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssistantButton, TranscriptLine } from "../../types/events";
import { useScrollFollow } from "../../hooks/useScrollFollow";
import { groupTurnsFromLines } from "./model/groupMessages";
import type { MessageTurn } from "./model/messageTypes";
import { TurnGroup } from "./TurnGroup";
import { IconArrowUp } from "../shell/icons";
import { MediaProvider, type MediaImage } from "../media/MediaProvider";
import { Lightbox } from "../media/Lightbox";
import { MessageActionSheet } from "./MessageActionSheet";
import { TypingIndicator } from "./messages/TypingIndicator";
import {
  downloadableUrlForLine,
  transcriptLineCopyText,
  type MessageActionId,
  type MessageActionTarget,
} from "./messageActions";
import { downloadMedia } from "../../lib/downloadMedia";

interface TranscriptProps {
  chatId: string;
  lines: TranscriptLine[];
  typing?: boolean;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
  onReplyLine: (line: TranscriptLine) => void;
  onRetryLine: (line: TranscriptLine) => void;
  onDeleteLine: (lineId: string) => void;
}

export function Transcript({
  chatId,
  lines,
  typing = false,
  onButtonClick,
  onReplyLine,
  onRetryLine,
  onDeleteLine,
}: TranscriptProps) {
  const turns = useMemo(() => groupTurnsFromLines(lines), [lines]);
  const turnActive = useMemo(() => lines.some((l) => l.streaming), [lines]);
  const trigger = useMemo(() => {
    const last = lines[lines.length - 1];
    return `${lines.length}:${last?.text.length ?? 0}:${typing ? 1 : 0}`;
  }, [lines, typing]);

  const { scrollerRef, isPinned, hasNew, scrollToBottom } = useScrollFollow(trigger, 120, chatId);

  // Day separators: label a turn with the day of its earliest stamped line.
  // Older transcripts predate line timestamps — those turns simply get no pill.
  const dayLabelByTurnId = useMemo(() => {
    const atById = new Map(lines.map((line) => [line.id, line.at]));
    const labels = new Map<string, string>();
    let previousDayKey: string | null = null;
    for (const turn of turns) {
      const at = turnTimestamp(turn, atById);
      if (!at) continue;
      const day = new Date(at);
      if (Number.isNaN(day.getTime())) continue;
      const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      if (dayKey !== previousDayKey) {
        labels.set(turn.id, dayLabel(day));
        previousDayKey = dayKey;
      }
    }
    return labels;
  }, [lines, turns]);

  // Only a turn the user just appended should play the send animation. We key
  // this off the *shape* of the change, not wall-clock time: a genuine send adds
  // a single turn at the tail, whereas a bulk hydration/replay brings in many
  // turns at once (or replaces the set) and must never animate. Time-based
  // grace windows misfire when hydration/replay resolves late.
  const knownTurnsRef = useRef<{ chatId: string; ids: Set<string> } | null>(null);
  const freshIdsRef = useRef<Set<string>>(new Set());
  const currentIds = turns.map((turn) => turn.id);
  if (knownTurnsRef.current?.chatId !== chatId) {
    // Opening a session: everything present is history.
    knownTurnsRef.current = { chatId, ids: new Set(currentIds) };
    freshIdsRef.current = new Set();
  } else {
    const prev = knownTurnsRef.current;
    const appeared = currentIds.filter((id) => !prev.ids.has(id));
    // A single tail append is a send; larger deltas are hydration/replay.
    if (appeared.length > 0 && appeared.length <= 2) {
      const lastId = currentIds[currentIds.length - 1];
      for (const id of appeared) {
        if (id === lastId) freshIdsRef.current.add(id);
      }
    }
    // Idempotent under StrictMode's double render: the second pass sees prev.ids
    // already equal to currentIds, so `appeared` is empty and nothing changes.
    knownTurnsRef.current = { chatId, ids: new Set(currentIds) };
  }
  const isFreshTurn = (turnId: string): boolean => freshIdsRef.current.has(turnId);

  const [lightboxImages, setLightboxImages] = useState<MediaImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<MessageActionTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const openLightbox = useCallback((images: MediaImage[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const closeActions = useCallback(() => setActionTarget(null), []);
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 1600);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  const handleAction = useCallback(
    (action: MessageActionId, target: MessageActionTarget) => {
      const { line } = target;
      if (action === "copy") {
        void copyText(transcriptLineCopyText(line))
          .then(() => showToast("Copied"))
          .catch(() => showToast("Copy failed"));
      } else if (action === "reply") {
        onReplyLine(line);
        showToast("Reply selected");
      } else if (action === "retry") {
        onRetryLine(line);
      } else if (action === "delete") {
        onDeleteLine(line.id);
        showToast("Removed locally");
      } else if (action === "download") {
        const url = downloadableUrlForLine(line);
        if (url) void downloadMedia(url, line.fileName);
      }
      closeActions();
    },
    [closeActions, onDeleteLine, onReplyLine, onRetryLine, showToast],
  );

  const isEmpty = turns.length === 0 && !typing;

  return (
    <MediaProvider registryKey={chatId} onOpenLightbox={openLightbox}>
      <div className="transcript-wrap">
        <div
          ref={scrollerRef}
          className="transcript"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {isEmpty ? (
            <EmptyState />
          ) : (
            <div className="transcript-content">
              {turns.map((turn) => {
                const sepLabel = dayLabelByTurnId.get(turn.id);
                return (
                  <Fragment key={turn.id}>
                    {sepLabel ? (
                      <div className="day-sep" aria-hidden>
                        <span className="day-sep-pill t-meta">{sepLabel}</span>
                      </div>
                    ) : null}
                    <TurnGroup
                      turn={turn}
                      freshUser={isFreshTurn(turn.id)}
                      turnActive={turnActive}
                      onButtonClick={onButtonClick}
                      onMessageAction={setActionTarget}
                      onReplyLine={onReplyLine}
                    />
                  </Fragment>
                );
              })}
              {typing ? (
                <div className="turn turn-typing motion-rise-in-soft">
                  <div className="turn-outputs">
                    <div className="turn-outputs-list">
                      <TypingIndicator />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {!isPinned && hasNew ? (
          <button
            type="button"
            className="transcript-jump motion-rise-in"
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to latest"
          >
            <IconArrowUp size={12} style={{ transform: "rotate(180deg)" }} />
            <span>New messages</span>
          </button>
        ) : null}
        {toast ? (
          <div className="transcript-toast motion-rise-in" role="status" aria-live="polite">
            {toast}
          </div>
        ) : null}
      </div>

      <Lightbox
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIndex}
        onClose={closeLightbox}
        onIndexChange={setLightboxIndex}
      />
      <MessageActionSheet
        target={actionTarget}
        onClose={closeActions}
        onAction={handleAction}
      />
    </MediaProvider>
  );
}

function turnTimestamp(
  turn: MessageTurn,
  atById: Map<string, string | undefined>,
): string | undefined {
  const messages = turn.user ? [turn.user, ...turn.outputs] : turn.outputs;
  for (const message of messages) {
    for (const lineId of message.metadata.lineIds) {
      const at = atById.get(lineId);
      if (at) return at;
    }
  }
  return undefined;
}

function dayLabel(day: Date): string {
  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const today = startOfDay(new Date());
  const target = startOfDay(day);
  if (target >= today) return "Today";
  if (target >= today - 24 * 3600_000) return "Yesterday";
  return day.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for embedded browsers and stricter mobile permission states.
    }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "true");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  el.remove();
}

function EmptyState() {
  return (
    <div className="transcript-empty">
      <div className="transcript-empty-orb" aria-hidden />
      <div className="transcript-empty-title t-title">Start a conversation</div>
      <p className="t-secondary transcript-empty-hint">Hermes is ready.</p>
      <div className="transcript-empty-shortcuts">
        <span className="transcript-empty-chip">
          <kbd>⌘K</kbd> Commands
        </span>
        <span className="transcript-empty-chip">
          <kbd>⌘/</kbd> Slash menu
        </span>
      </div>
    </div>
  );
}
