import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadMedia } from "../../lib/downloadMedia";
import { useMediaContext, type MediaImage } from "./MediaProvider";
import { IconClose, IconArrowUp, IconDownload } from "../shell/icons";
import { usePinchZoom } from "./usePinchZoom";

interface LightboxProps {
  open: boolean;
  images: MediaImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const FLIP_ENTER_MS = 300;
const FLIP_EXIT_MS = 260;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/* rAF mit Timeout-Fallback: in versteckten Tabs feuert requestAnimationFrame
   nicht — der FLIP-Endzustand darf davon nicht abhängen. */
function nextFrame(cb: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  requestAnimationFrame(run);
  window.setTimeout(run, 64);
}

/** Transform, der `el` deckungsgleich über `target` legt (Shared-Element-FLIP). */
function flipTransform(el: HTMLElement, target: HTMLElement): string | null {
  const from = target.getBoundingClientRect();
  const to = el.getBoundingClientRect();
  if (!from.width || !from.height || !to.width || !to.height) return null;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = from.width / to.width;
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

export function Lightbox({ open, images, index, onClose, onIndexChange }: LightboxProps) {
  const media = useMediaContext();
  const current = images[index];
  const zoom = usePinchZoom(open ? current?.id ?? "open" : "closed");

  // Die Lightbox bleibt während der Exit-Animation gemountet: `open` steuert
  // den Wunschzustand, `rendered`/`closing` das tatsächliche DOM.
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const didEnterRef = useRef(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    setClosing(true);
    const el = imgRef.current;
    const source = current ? media?.getImageElement(current.id) : null;
    let flying = false;
    if (el && source && !zoom.zoomed && !prefersReducedMotion()) {
      const transform = flipTransform(el, source);
      if (transform) {
        flying = true;
        el.style.transition = `transform ${FLIP_EXIT_MS}ms cubic-bezier(0.4, 0, 0.7, 0.2), opacity ${FLIP_EXIT_MS}ms ease`;
        el.style.transform = transform;
      }
    } else if (el && !prefersReducedMotion()) {
      el.style.transition = `opacity ${FLIP_EXIT_MS}ms ease, transform ${FLIP_EXIT_MS}ms ease`;
      el.style.opacity = "0";
      el.style.transform = "scale(0.96)";
    }
    const timer = window.setTimeout(
      () => {
        setClosing(false);
        setRendered(false);
      },
      flying || !prefersReducedMotion() ? FLIP_EXIT_MS : 0,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Enter-FLIP: das Bild fliegt vom Thumbnail an seine Fullscreen-Position.
  useLayoutEffect(() => {
    if (!rendered) {
      didEnterRef.current = false;
      return;
    }
    if (didEnterRef.current) return;
    didEnterRef.current = true;
    const el = imgRef.current;
    const source = current ? media?.getImageElement(current.id) : null;
    if (!el || !source || prefersReducedMotion()) return;

    const run = () => {
      const transform = flipTransform(el, source);
      if (!transform) return;
      el.style.transition = "none";
      el.style.transform = transform;
      // Style-Flush erzwingen, damit die Transition wirklich vom versetzten
      // Zustand aus startet (sonst koalesziert der Browser beide Writes).
      void el.getBoundingClientRect();
      nextFrame(() => {
        el.style.transition = `transform ${FLIP_ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
        el.style.transform = "";
        window.setTimeout(() => {
          el.style.transition = "";
        }, FLIP_ENTER_MS + 50);
      });
    };
    if (el.complete && el.naturalWidth > 0) run();
    else el.addEventListener("load", run, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

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

  if (!rendered || !current) return null;

  const content = (
    <div
      className={`lightbox-backdrop${closing ? " lightbox-backdrop-closing" : ""}`}
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
            ref={imgRef}
            src={current.url}
            alt={current.alt ?? current.caption ?? "image"}
            className="lightbox-image"
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
