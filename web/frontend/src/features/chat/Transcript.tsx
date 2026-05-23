import { useEffect, useRef } from "react";
import { TranscriptLine } from "./TranscriptLine";
import type { TranscriptLine as Line } from "../../types/events";

interface TranscriptProps {
  lines: Line[];
}

export function Transcript({ lines }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  if (lines.length === 0) {
    return (
      <div className="terminal-transcript">
        <div className="terminal-transcript-empty">— session ready —</div>
      </div>
    );
  }

  return (
    <div className="terminal-transcript">
      {lines.map((line) => (
        <TranscriptLine key={line.id} line={line} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
