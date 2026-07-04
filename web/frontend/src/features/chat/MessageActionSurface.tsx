import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
  type MouseEvent,
} from "react";
import type { TranscriptLine } from "../../types/events";
import { IconMore, IconReply } from "../shell/icons";
import type { MessageActionTarget } from "./messageActions";

const SWIPE_START_PX = 10;
const SWIPE_COMMIT_PX = 62;
const SWIPE_MAX_PX = 86;
const VERTICAL_CANCEL_RATIO = 1.25;

interface MessageActionSurfaceProps {
  line: TranscriptLine;
  children: ReactNode;
  onOpen: (target: MessageActionTarget) => void;
  onReply: (line: TranscriptLine) => void;
}

interface GestureState {
  pointerId: number;
  x: number;
  y: number;
  swiping: boolean;
}

function clampSwipe(delta: number): number {
  const sign = Math.sign(delta);
  const abs = Math.abs(delta);
  if (abs <= SWIPE_MAX_PX) return delta;
  return sign * (SWIPE_MAX_PX + (abs - SWIPE_MAX_PX) * 0.18);
}

export function MessageActionSurface({
  line,
  children,
  onOpen,
  onReply,
}: MessageActionSurfaceProps) {
  const gestureRef = useRef<GestureState | null>(null);
  const lastTouchRef = useRef(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const resetSwipe = () => {
    gestureRef.current = null;
    setSwiping(false);
    setSwipeX(0);
  };

  const openAt = (x: number, y: number) => {
    resetSwipe();
    onOpen({ line, x, y });
  };

  const openFromSurface = () => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    openAt(rect ? rect.right - 12 : window.innerWidth / 2, rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    // iOS/Safari may synthesize contextmenu after a touch hold. Do not open
    // actions for touch: swipe is the mobile gesture, right-click is desktop/iPad pointer.
    if (Date.now() - lastTouchRef.current < 900) return;
    openAt(event.clientX, event.clientY);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    lastTouchRef.current = Date.now();
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      swiping: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = gestureRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!state.swiping) {
      if (absY > SWIPE_START_PX && absY > absX * VERTICAL_CANCEL_RATIO) {
        resetSwipe();
        return;
      }
      if (absX < SWIPE_START_PX || absX < absY * VERTICAL_CANCEL_RATIO) return;
      state.swiping = true;
      setSwiping(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    setSwipeX(clampSwipe(dx));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = gestureRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      resetSwipe();
      return;
    }

    const dx = event.clientX - state.x;
    const shouldReply = dx >= SWIPE_COMMIT_PX;
    const shouldOpenActions = dx <= -SWIPE_COMMIT_PX;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already be released by the browser.
    }

    resetSwipe();
    if (shouldReply) onReply(line);
    else if (shouldOpenActions) openFromSurface();
  };

  const style = {
    "--message-swipe-x": `${swipeX}px`,
    "--message-swipe-progress": Math.min(1, Math.abs(swipeX) / SWIPE_COMMIT_PX).toFixed(3),
  } as CSSProperties;

  return (
    <div
      ref={surfaceRef}
      className={`message-action-surface${swiping ? " message-action-surface-swiping" : ""}${
        swipeX > 0 ? " message-action-surface-reply" : swipeX < 0 ? " message-action-surface-actions" : ""
      }`}
      style={style}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={resetSwipe}
      onPointerLeave={swiping ? undefined : resetSwipe}
    >
      <span className="message-swipe-cue message-swipe-cue-reply" aria-hidden>
        <IconReply size={19} />
      </span>
      <span className="message-swipe-cue message-swipe-cue-actions" aria-hidden>
        <IconMore size={20} />
      </span>
      <div className="message-action-surface-content">{children}</div>
    </div>
  );
}
