import type { KeyboardEvent } from "react";

interface PromptLineProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PromptLine({ value, disabled, onChange, onSubmit, onCancel }: PromptLineProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="terminal-prompt">
      <span className="terminal-prompt-prefix">{"> "}</span>
      <input
        className="terminal-prompt-input"
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="message"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
