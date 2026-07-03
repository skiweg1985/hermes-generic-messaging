import { useRef, type ReactNode, type PointerEvent, type MouseEvent } from "react";
import type { TranscriptLine } from "../../types/events";
import type { MessageActionTarget } from "./messageActions";

const LONG_PRESS_MS = 520;
const MOVE_TOLERANCE = 12;

interface MessageActionSurfaceProps {
  line: TranscriptLine;
  children: ReactNode;
  onOpen: (target: MessageActionTarget) => void;
}

interface PressState {
  pointerId: number;
  x: number;
  y: number;
  timer: number;
}

export function MessageActionSurface({
  line,
  children,
  onOpen,
}: MessageActionSurfaceProps) {
  const pressRef = useRef<PressState | null>(null);

  const clearPress = () => {
    const state = pressRef.current;
    if (state) window.clearTimeout(state.timer);
    pressRef.current = null;
  };

  const openAt = (x: number, y: number) => {
    clearPress();
    onOpen({ line, x, y });
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openAt(event.clientX, event.clientY);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    clearPress();
    const x = event.clientX;
    const y = event.clientY;
    const pointerId = event.pointerId;
    pressRef.current = {
      pointerId,
      x,
      y,
      timer: window.setTimeout(() => openAt(x, y), LONG_PRESS_MS),
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = pressRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - state.x);
    const dy = Math.abs(event.clientY - state.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearPress();
  };

  return (
    <div
      className="message-action-surface"
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
    >
      {children}
    </div>
  );
}
