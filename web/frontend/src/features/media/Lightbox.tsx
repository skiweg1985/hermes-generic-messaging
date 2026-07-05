import { useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { downloadMedia } from "../../lib/downloadMedia";
import type { MediaImage } from "./MediaProvider";
import { IconClose, IconArrowUp, IconDownload } from "../shell/icons";
import { usePinchZoom } from "./usePinchZoom";

interface LightboxProps {
  open: boolean;
  images: MediaImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function Lightbox({ open, images, index, onClose, onIndexChange }: LightboxProps) {
  const current = images[index];
  const zoom = usePinchZoom(open ? current?.id ?? "open" : "closed");

  const next = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((index + 1) % images.length);
  }, [images.length, index, onIndexChange]);

  const prev = useCallback(() => {
    if (images.length <= 1) return;
    onIndexChange((index - 1 + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, next, prev, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const counter = useMemo(
    () => (images.length > 1 ? `${index + 1} / ${images.length}` : ""),
    [images.length, index],
  );

  if (!open || !current) return null;

  const content = (
    <div
      className="lightbox-backdrop motion-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="lightbox-toolbar">
        <span className="t-meta lightbox-counter">{counter}</span>
        <div className="lightbox-toolbar-actions">
          {current.downloadUrl ? (
            <a
              href={current.downloadUrl}
              className="lightbox-icon-btn"
              aria-label="Download image"
              title="Download"
              onClick={(e) => {
                e.preventDefault();
                void downloadMedia(current.downloadUrl!, current.alt ?? "image");
              }}
            >
              <IconDownload size={16} />
            </a>
          ) : null}
          <button
            type="button"
            className="lightbox-icon-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close (esc)"
          >
            <IconClose size={16} />
          </button>
        </div>
      </header>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            className="lightbox-nav lightbox-nav-prev"
            onClick={prev}
            aria-label="Previous image"
          >
            <IconArrowUp size={20} style={{ transform: "rotate(-90deg)" }} />
          </button>
          <button
            type="button"
            className="lightbox-nav lightbox-nav-next"
            onClick={next}
            aria-label="Next image"
          >
            <IconArrowUp size={20} style={{ transform: "rotate(90deg)" }} />
          </button>
        </>
      ) : null}

      <div
        ref={zoom.stageRef}
        className={`lightbox-stage${zoom.zoomed ? " lightbox-stage-zoomed" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        {...zoom.eventHandlers}
      >
        <div
          ref={zoom.contentRef}
          className="lightbox-zoom-content"
          style={zoom.transformStyle}
        >
          <img
            key={current.id}
            src={current.url}
            alt={current.alt ?? current.caption ?? "image"}
            className="lightbox-image motion-scale-in"
            draggable={false}
          />
        </div>
        {current.caption ? (
          <div className="lightbox-caption t-body-sm">{current.caption}</div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
