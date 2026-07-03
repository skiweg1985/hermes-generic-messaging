import { useCallback, useEffect, useRef, useState } from "react";

const TARGET_BARS = 200;
const BAR_STRIDE = 4;

interface UseWaveformResult {
  peaks: number[] | null;
  loading: boolean;
  failed: boolean;
}

/**
 * Loads an audio URL, decodes it, and reduces it to ~200 normalized peaks.
 * Returns null until ready; gracefully falls back to a flat line on failure.
 */
export function useWaveform(url: string | undefined): UseWaveformResult {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    setLoading(true);
    setFailed(false);
    setPeaks(null);

    const audioCtx =
      typeof window !== "undefined" &&
      typeof window.AudioContext !== "undefined"
        ? new window.AudioContext()
        : null;

    if (!audioCtx) {
      setFailed(true);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("fetch failed");
        const buf = await response.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(buf);
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const chunk = Math.max(1, Math.floor(data.length / TARGET_BARS));
        const out: number[] = [];
        for (let i = 0; i < TARGET_BARS; i++) {
          const start = i * chunk;
          let max = 0;
          for (let j = 0; j < chunk; j++) {
            const v = Math.abs(data[start + j] ?? 0);
            if (v > max) max = v;
          }
          out.push(max);
        }
        const peak = Math.max(...out, 0.0001);
        const normalized = out.map((v) => Math.min(1, v / peak));
        setPeaks(normalized);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
        audioCtx.close().catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { peaks, loading, failed };
}

interface WaveformCanvasProps {
  peaks: number[] | null;
  progress: number; // 0..1
  width: number;
  height: number;
  onSeek: (ratio: number) => void;
}

export function WaveformCanvas({
  peaks,
  progress,
  width,
  height,
  onSeek,
}: WaveformCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = window.devicePixelRatio || 1;
  const draggingRef = useRef(false);

  // Draw.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const bars =
      peaks ??
      Array.from({ length: TARGET_BARS }, (_, index) => {
        const a = Math.sin(index * 0.35) * 0.22;
        const b = Math.sin(index * 0.09 + 1.6) * 0.3;
        return Math.max(0.1, Math.min(0.9, 0.34 + a + b));
      });
    const total = bars.length;
    const visibleBars = Math.max(24, Math.min(total, Math.floor(width / BAR_STRIDE)));
    const stride = width / visibleBars;
    const barW = Math.max(2, Math.min(4, stride * 0.5));
    const mid = height / 2;
    const styles = getComputedStyle(canvas);
    const playedColor =
      styles.getPropertyValue("--waveform-played").trim() || "rgba(20, 20, 20, 0.88)";
    const idleColor =
      styles.getPropertyValue("--waveform-idle").trim() || "rgba(20, 20, 20, 0.18)";

    for (let i = 0; i < visibleBars; i++) {
      const sourceIndex = Math.min(total - 1, Math.floor((i / visibleBars) * total));
      const peak = bars[sourceIndex] ?? 0.05;
      const minHeight = 5;
      const h = Math.max(minHeight, peak * (height - 6));
      const x = i * stride + (stride - barW) / 2;
      const played = i / Math.max(1, visibleBars - 1) <= progress;
      ctx.fillStyle = played ? playedColor : idleColor;
      ctx.beginPath();
      const r = barW / 2;
      const y = mid - h / 2;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + barW, y, x + barW, y + h, r);
      ctx.arcTo(x + barW, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + barW, y, r);
      ctx.closePath();
      ctx.fill();
    }
  }, [peaks, progress, width, height, dpr]);

  const ratioFromEvent = useCallback(
    (clientX: number) => {
      const canvas = ref.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      return Math.max(0, Math.min(1, x / rect.width));
    },
    [],
  );

  return (
    <canvas
      ref={ref}
      className="waveform-canvas"
      style={{ width, height }}
      onPointerDown={(e) => {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        draggingRef.current = true;
        onSeek(ratioFromEvent(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        onSeek(ratioFromEvent(e.clientX));
      }}
      onPointerUp={(e) => {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        draggingRef.current = false;
      }}
    />
  );
}
