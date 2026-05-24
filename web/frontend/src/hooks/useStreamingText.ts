import { useEffect, useRef, useState } from "react";

/**
 * Buffers rapidly-changing text and flushes at most once per animation frame.
 * This keeps streaming text from causing per-token React reconciliation when
 * tokens arrive faster than 60fps, while still feeling instantaneous.
 *
 * Returns the buffered text. Caller may pass the source string at any rate.
 */
export function useStreamingText(source: string, active: boolean): string {
  const [displayed, setDisplayed] = useState(source);
  const pendingRef = useRef(source);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    pendingRef.current = source;

    if (!active) {
      // When inactive, flush immediately so the final value is shown.
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setDisplayed(source);
      return;
    }

    if (frameRef.current !== null) return; // already scheduled
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setDisplayed(pendingRef.current);
    });
  }, [source, active]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  return displayed;
}
