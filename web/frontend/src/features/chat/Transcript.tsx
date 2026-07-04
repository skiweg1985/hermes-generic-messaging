import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssistantButton, TranscriptLine } from "../../types/events";
import { useScrollFollow } from "../../hooks/useScrollFollow";
import { groupTurnsFromLines } from "./model/groupMessages";
import { TurnGroup } from "./TurnGroup";
import { IconArrowUp } from "../shell/icons";
import { MediaProvider, type MediaImage } from "../media/MediaProvider";
import { Lightbox } from "../media/Lightbox";
import { MessageActionSheet } from "./MessageActionSheet";
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
              {turns.map((turn) => (
                <TurnGroup
                  key={turn.id}
                  turn={turn}
                  turnActive={turnActive}
                  onButtonClick={onButtonClick}
                  onMessageAction={setActionTarget}
                />
              ))}
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
      <div className="transcript-empty-title t-title">Start a conversation</div>
      <p className="t-secondary transcript-empty-hint">Hermes is ready.</p>
    </div>
  );
}
