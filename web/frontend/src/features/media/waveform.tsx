import { useCallback, useEffect, useRef, useState } from "react";

const TARGET_BARS = 200;
const BAR_WIDTH = 1.5;
const BAR_GAP = 2;

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

    const bars = peaks ?? new Array(TARGET_BARS).fill(0.08);
    const total = bars.length;
    const totalWidth = total * BAR_WIDTH + (total - 1) * BAR_GAP;
    const scale = Math.min(1, width / totalWidth);
    const stride = (BAR_WIDTH + BAR_GAP) * scale;
    const barW = BAR_WIDTH * scale;
    const mid = height / 2;

    for (let i = 0; i < total; i++) {
      const peak = bars[i] ?? 0.05;
      const minHeight = 2;
      const h = Math.max(minHeight, peak * (height - 4));
      const x = i * stride;
      const played = i / total <= progress;
      ctx.fillStyle = played
        ? "rgba(255, 255, 255, 0.92)"
        : "rgba(255, 255, 255, 0.32)";
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
