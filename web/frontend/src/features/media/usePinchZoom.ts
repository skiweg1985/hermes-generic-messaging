import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_DISTANCE = 28;

interface Point {
  x: number;
  y: number;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

interface PanGesture {
  kind: "pan";
  pointerId: number;
  startPoint: Point;
  startTransform: Transform;
}

interface PinchGesture {
  kind: "pinch";
  startDistance: number;
  startMidpoint: Point;
  startTransform: Transform;
}

type Gesture = PanGesture | PinchGesture | null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function midpointRelativeToCenter(point: Point, element: HTMLElement | null): Point {
  const rect = element?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: point.x - (rect.left + rect.width / 2),
    y: point.y - (rect.top + rect.height / 2),
  };
}

function tapDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function usePinchZoom(resetKey: unknown) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture>(null);
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });

  const constrain = useCallback((next: Transform): Transform => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    if (scale <= MIN_SCALE + 0.001) return { scale: MIN_SCALE, x: 0, y: 0 };

    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return { scale, x: next.x, y: next.y };

    const baseWidth = content.offsetWidth;
    const baseHeight = content.offsetHeight;
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const maxX = Math.max(0, (baseWidth * scale - stageWidth) / 2);
    const maxY = Math.max(0, (baseHeight * scale - stageHeight) / 2);

    return {
      scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }, []);

  const reset = useCallback(() => {
    pointersRef.current.clear();
    gestureRef.current = null;
    lastTapRef.current = null;
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [reset, resetKey]);

  const beginGesture = useCallback(() => {
    const pointers = Array.from(pointersRef.current.entries());
    if (pointers.length >= 2) {
      const [, first] = pointers[0];
      const [, second] = pointers[1];
      gestureRef.current = {
        kind: "pinch",
        startDistance: Math.max(1, distance(first, second)),
        startMidpoint: midpoint(first, second),
        startTransform: transform,
      };
      return;
    }

    if (pointers.length === 1 && transform.scale > MIN_SCALE) {
      const [pointerId, point] = pointers[0];
      gestureRef.current = {
        kind: "pan",
        pointerId,
        startPoint: point,
        startTransform: transform,
      };
      return;
    }

    gestureRef.current = null;
  }, [transform]);

  const toggleDoubleTapZoom = useCallback(
    (point: Point) => {
      setTransform((current) => {
        if (current.scale > MIN_SCALE + 0.001) {
          return { scale: MIN_SCALE, x: 0, y: 0 };
        }

        const relative = midpointRelativeToCenter(point, stageRef.current);
        return constrain({
          scale: DOUBLE_TAP_SCALE,
          x: -relative.x,
          y: -relative.y,
        });
      });
    },
    [constrain],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      event.stopPropagation();
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);
      beginGesture();
    },
    [beginGesture],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const gesture = gestureRef.current;
      const pointers = Array.from(pointersRef.current.values());
      if (!gesture) {
        beginGesture();
        return;
      }

      if (gesture.kind === "pinch" && pointers.length >= 2) {
        const first = pointers[0];
        const second = pointers[1];
        const currentDistance = Math.max(1, distance(first, second));
        const currentMidpoint = midpoint(first, second);
        const nextScale = gesture.startTransform.scale * (currentDistance / gesture.startDistance);
        const startMid = midpointRelativeToCenter(gesture.startMidpoint, stageRef.current);
        const currentMid = midpointRelativeToCenter(currentMidpoint, stageRef.current);
        const scaleRatio = nextScale / gesture.startTransform.scale;

        setTransform(
          constrain({
            scale: nextScale,
            x: currentMid.x - (startMid.x - gesture.startTransform.x) * scaleRatio,
            y: currentMid.y - (startMid.y - gesture.startTransform.y) * scaleRatio,
          }),
        );
        return;
      }

      if (gesture.kind === "pan") {
        const point = pointersRef.current.get(gesture.pointerId);
        if (!point) return;
        setTransform(
          constrain({
            scale: gesture.startTransform.scale,
            x: gesture.startTransform.x + point.x - gesture.startPoint.x,
            y: gesture.startTransform.y + point.y - gesture.startPoint.y,
          }),
        );
      }
    },
    [beginGesture, constrain],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      event.preventDefault();
      event.stopPropagation();

      const point = pointersRef.current.get(event.pointerId)!;
      pointersRef.current.delete(event.pointerId);
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture can already be released on iOS/WebKit.
      }

      const now = Date.now();
      const previousTap = lastTapRef.current;
      const activePointers = pointersRef.current.size;
      const wasPanOrPinch = gestureRef.current?.kind;
      gestureRef.current = null;

      if (activePointers > 0) {
        beginGesture();
        return;
      }

      if (!wasPanOrPinch || transform.scale <= MIN_SCALE + 0.001) {
        if (
          previousTap &&
          now - previousTap.time <= DOUBLE_TAP_MS &&
          tapDistance(previousTap.point, point) <= DOUBLE_TAP_DISTANCE
        ) {
          lastTapRef.current = null;
          toggleDoubleTapZoom(point);
          return;
        }
        lastTapRef.current = { time: now, point };
      }
    },
    [beginGesture, toggleDoubleTapZoom, transform.scale],
  );

  const onPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = null;
  }, []);

  return {
    stageRef,
    contentRef,
    zoomed: transform.scale > MIN_SCALE + 0.001,
    transformStyle: {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
    },
    eventHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    reset,
  };
}
