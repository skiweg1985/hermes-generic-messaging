import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconAudio, IconDownload } from "../shell/icons";
import { useWaveform, WaveformCanvas } from "./waveform";

interface WaveformPlayerProps {
  url: string;
  fileName?: string;
  downloadUrl?: string;
  mimeType?: string;
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WaveformPlayer({
  url,
  fileName,
  downloadUrl,
  mimeType,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progressTime, setProgressTime] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);

  const { peaks } = useWaveform(url);

  // Measure container width to size canvas.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bind audio events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgressTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setProgressTime(0);
      audio.currentTime = 0;
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Apply playback rate when speed changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = SPEEDS[speedIndex];
  }, [speedIndex]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, []);

  const seekRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(audio.duration)) return;
      audio.currentTime = ratio * audio.duration;
      setProgressTime(audio.currentTime);
    },
    [],
  );

  const progress = duration > 0 ? progressTime / duration : 0;

  return (
    <div className="waveform" role="group" aria-label={fileName ?? "audio"}>
      <audio ref={audioRef} src={url} preload="metadata">
        {mimeType ? <source src={url} type={mimeType} /> : null}
      </audio>

      <button
        type="button"
        className="waveform-play"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseGlyph /> : <PlayGlyph />}
      </button>

      <div ref={containerRef} className="waveform-track">
        {width > 0 ? (
          <WaveformCanvas
            peaks={peaks}
            progress={progress}
            width={width}
            height={36}
            onSeek={seekRatio}
          />
        ) : null}
      </div>

      <div className="waveform-meta">
        <span className="t-mono-sm waveform-time">
          {formatTime(progressTime)} / {formatTime(duration)}
        </span>
        <button
          type="button"
          className="waveform-speed"
          onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
          aria-label="Playback speed"
          title="Playback speed"
        >
          {SPEEDS[speedIndex]}×
        </button>
        {downloadUrl ? (
          <a
            href={downloadUrl}
            className="waveform-download"
            target="_blank"
            rel="noreferrer"
            aria-label="Download audio"
            title="Download"
          >
            <IconDownload size={14} />
          </a>
        ) : null}
      </div>

      {fileName ? (
        <div className="waveform-name t-meta truncate">
          <IconAudio size={11} /> <span className="truncate">{fileName}</span>
        </div>
      ) : null}
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden focusable="false">
      <path d="M3 1.5v9l8-4.5z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden focusable="false">
      <rect x="3" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" />
      <rect x="6.6" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" />
    </svg>
  );
}
