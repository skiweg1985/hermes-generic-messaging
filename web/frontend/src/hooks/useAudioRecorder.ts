import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeMimeType } from "../lib/normalizeMimeType";

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const stopPromiseRef = useRef<Promise<Blob> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) ctx.close().catch(() => undefined);
    setLevel(0);
  }, []);

  const startLevelMeter = useCallback(
    (stream: MediaStream) => {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        const current = analyserRef.current;
        if (!current) return;
        current.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 5));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [],
  );

  const start = useCallback(async (): Promise<void> => {
    if (mediaRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      mediaRef.current = recorder;
      startLevelMeter(stream);
      setRecording(true);
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      throw err;
    }
  }, [startLevelMeter]);

  const stop = useCallback((): Promise<Blob> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    const promise = new Promise<Blob>((resolve, reject) => {
      const recorder = mediaRef.current;
      if (!recorder) {
        reject(new Error("not recording"));
        return;
      }
      mediaRef.current = null;
      const cleanup = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        chunksRef.current = [];
        stopLevelMeter();
        setRecording(false);
        stopPromiseRef.current = null;
      };
      recorder.onstop = () => {
        const mime = normalizeMimeType(recorder.mimeType || "audio/webm");
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanup();
        resolve(blob);
      };
      recorder.onerror = (event) => {
        cleanup();
        reject(event.error);
      };
      if (recorder.state === "inactive") {
        recorder.onstop(new Event("stop"));
        return;
      }
      recorder.requestData();
      recorder.stop();
    });
    stopPromiseRef.current = promise;
    return promise;
  }, [stopLevelMeter]);

  useEffect(
    () => () => {
      const recorder = mediaRef.current;
      mediaRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      chunksRef.current = [];
      stopLevelMeter();
    },
    [stopLevelMeter],
  );

  return { recording, level, start, stop };
}
