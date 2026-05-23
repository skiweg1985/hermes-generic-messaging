import { useRef } from "react";

interface AttachControlsProps {
  disabled: boolean;
  recording: boolean;
  onFile: (file: File) => void;
  onToggleRecord: () => void;
}

export function AttachControls({
  disabled,
  recording,
  onFile,
  onToggleRecord,
}: AttachControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <span className="terminal-hints">
        :attach{" "}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          file
        </button>{" "}
        :record{" "}
        <button type="button" disabled={disabled} onClick={onToggleRecord}>
          {recording ? "stop" : "start"}
        </button>
      </span>
    </>
  );
}
