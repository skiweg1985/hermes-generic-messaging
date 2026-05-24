import { useCallback, useRef, useState } from "react";

import { normalizeMimeType } from "../lib/normalizeMimeType";

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    mediaRef.current = recorder;
    setRecording(true);
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRef.current;
      if (!recorder) {
        reject(new Error("not recording"));
        return;
      }
      recorder.onstop = () => {
        const mime = normalizeMimeType(recorder.mimeType || "audio/webm");
        const blob = new Blob(chunksRef.current, { type: mime });
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaRef.current = null;
        chunksRef.current = [];
        setRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { recording, start, stop };
}
