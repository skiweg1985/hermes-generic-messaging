import { useCallback, useMemo, useState } from "react";
import type { AssistantButton, TranscriptLine } from "../../types/events";
import { useScrollFollow } from "../../hooks/useScrollFollow";
import { groupTurns } from "./turnGrouping";
import { TurnGroup } from "./TurnGroup";
import { TypingIndicator } from "./messages/TypingIndicator";
import { IconArrowUp } from "../shell/icons";
import { MediaProvider, type MediaImage } from "../media/MediaProvider";
import { Lightbox } from "../media/Lightbox";

interface TranscriptProps {
  lines: TranscriptLine[];
  typing?: boolean;
  onButtonClick: (line: TranscriptLine, button: AssistantButton) => void;
}

export function Transcript({ lines, typing = false, onButtonClick }: TranscriptProps) {
  const turns = useMemo(() => groupTurns(lines), [lines]);
  const trigger = useMemo(() => {
    const last = lines[lines.length - 1];
    return `${lines.length}:${last?.text.length ?? 0}:${typing ? 1 : 0}`;
  }, [lines, typing]);

  const { scrollerRef, isPinned, hasNew, scrollToBottom } = useScrollFollow(trigger);

  const [lightboxImages, setLightboxImages] = useState<MediaImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = useCallback((images: MediaImage[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const isEmpty = turns.length === 0 && !typing;

  return (
    <MediaProvider onOpenLightbox={openLightbox}>
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
                  onButtonClick={onButtonClick}
                />
              ))}
            </div>
          )}
        </div>

        {typing ? (
          <div className="transcript-typing-float" aria-live="polite">
            <div className="transcript-typing-float-inner">
              <TypingIndicator />
            </div>
          </div>
        ) : null}

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
      </div>

      <Lightbox
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIndex}
        onClose={closeLightbox}
        onIndexChange={setLightboxIndex}
      />
    </MediaProvider>
  );
}

function EmptyState() {
  return (
    <div className="transcript-empty">
      <div className="transcript-empty-title t-title">What can I help with?</div>
      <p className="t-secondary transcript-empty-hint">
        Type a message, paste a file, or press <kbd>⌘K</kbd> to run a command.
      </p>
    </div>
  );
}
