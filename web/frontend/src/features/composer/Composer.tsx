import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  applySlashCommand,
  filterSlashCommands,
  getSlashSuggestionQuery,
} from "../chat/slashCommandSuggest";
import { SlashPopover } from "./SlashPopover";
import type { PendingAttachment } from "../../types/events";
import {
  IconArrowUp,
  IconStop,
  IconPaperclip,
  IconMic,
  IconSlash,
  IconAlert,
} from "../shell/icons";

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  value: string;
  disabled: boolean;
  streaming: boolean;
  recording: boolean;
  pendingAttachments?: PendingAttachment[];
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onFiles: (files: File[]) => void;
  onRetryUpload?: (localId: string) => void;
  onRemovePending?: (localId: string) => void;
  onToggleRecord: () => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    value,
    disabled,
    streaming,
    recording,
    onChange,
    pendingAttachments = [],
    onSubmit,
    onCancel,
    onFiles,
    onRetryUpload,
    onRemovePending,
    onToggleRecord,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
    }),
    [],
  );

  // Suggestion derivations.
  const query = getSlashSuggestionQuery(value, cursor);
  const suggestions = query === null || menuDismissed ? [] : filterSlashCommands(query);
  const exactMatch =
    query !== null &&
    suggestions.length === 1 &&
    suggestions[0]!.name.toLowerCase() === `/${query}`.toLowerCase();
  const menuOpen = suggestions.length > 0 && !exactMatch;

  useEffect(() => {
    setHighlight(0);
  }, [query, suggestions.length]);

  useEffect(() => {
    if (!value.startsWith("/")) setMenuDismissed(false);
  }, [value]);

  // Auto-grow.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [value]);

  const syncCursor = useCallback(() => {
    const pos = textareaRef.current?.selectionStart ?? value.length;
    setCursor(pos);
  }, [value.length]);

  const pickSuggestion = useCallback(
    (index: number) => {
      const command = suggestions[index];
      if (!command) return;
      onChange(applySlashCommand(value, command));
      setMenuDismissed(false);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const end = el.value.length;
        el.setSelectionRange(end, end);
        el.focus();
        setCursor(end);
      });
    },
    [suggestions, onChange, value],
  );

  const hasReadyAttachment = pendingAttachments.some((a) => a.status === "done");
  const hasUploading = pendingAttachments.some(
    (a) => a.status === "uploading" || a.status === "queued",
  );

  const submit = useCallback(() => {
    if (!value.trim() && !hasReadyAttachment) return;
    if (hasUploading) return;
    onSubmit();
  }, [onSubmit, value, hasReadyAttachment, hasUploading]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        pickSuggestion(highlight);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pickSuggestion(highlight);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      // No-op for now (parent decides global escape).
      return;
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setCursor(e.target.selectionStart ?? e.target.value.length);
    setMenuDismissed(false);
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length > 0) {
      onFiles(Array.from(list));
    }
    e.target.value = "";
  };

  const hasText = value.trim().length > 0;
  const canSend = hasText || hasReadyAttachment;
  const sendDisabled = disabled || (!canSend && !streaming) || hasUploading;

  const sendButton = streaming ? (
    <button
      type="button"
      className="composer-send composer-send-stop"
      onClick={onCancel}
      aria-label="Stop generating"
      title="Stop generating (⌘.)"
    >
      <IconStop size={14} />
    </button>
  ) : (
    <button
      type="button"
      className="composer-send"
      disabled={sendDisabled}
      onClick={submit}
      aria-label="Send message"
      title="Send (⏎)"
    >
      <IconArrowUp size={14} />
    </button>
  );

  // Prevent body scroll while focused on iOS — handled by shell instead.
  const placeholder = useMemo(
    () =>
      recording
        ? "Recording…"
        : streaming
          ? "Streaming response…"
          : "Message Hermes",
    [recording, streaming],
  );

  return (
    <div className="composer-region">
      <div className={`composer${disabled ? " composer-disabled" : ""}`}>
        {pendingAttachments.length > 0 ? (
          <div className="composer-attachments" aria-label="Anhänge">
            {pendingAttachments.map((entry) => (
              <div
                key={entry.localId}
                className={`composer-attachment composer-attachment-${entry.status}`}
              >
                <span className="composer-attachment-name truncate" title={entry.fileName}>
                  {entry.fileName}
                </span>
                {entry.status === "uploading" || entry.status === "queued" ? (
                  <span className="composer-attachment-status t-meta">Wird hochgeladen…</span>
                ) : null}
                {entry.status === "error" ? (
                  <>
                    <span className="composer-attachment-status t-meta composer-attachment-error">
                      <IconAlert size={12} />
                      Upload fehlgeschlagen
                    </span>
                    {onRetryUpload ? (
                      <button
                        type="button"
                        className="composer-attachment-retry t-meta"
                        onClick={() => onRetryUpload(entry.localId)}
                      >
                        Erneut versuchen
                      </button>
                    ) : null}
                  </>
                ) : null}
                {onRemovePending ? (
                  <button
                    type="button"
                    className="composer-attachment-remove"
                    aria-label={`Remove ${entry.fileName}`}
                    onClick={() => onRemovePending(entry.localId)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <SlashPopover
          suggestions={suggestions}
          highlightIndex={highlight}
          onPick={(cmd) => {
            const idx = suggestions.indexOf(cmd);
            pickSuggestion(idx);
          }}
          onHover={(i) => setHighlight(i)}
        />

        <textarea
          ref={textareaRef}
          className="composer-input"
          value={value}
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          onSelect={syncCursor}
          onFocus={syncCursor}
          placeholder={placeholder}
          rows={1}
          spellCheck
          autoComplete="off"
          aria-label="Message"
          aria-autocomplete={menuOpen ? "list" : undefined}
          aria-controls={menuOpen ? "composer-slash-list" : undefined}
          aria-expanded={menuOpen}
        />

        <div className="composer-actions">
          <div className="composer-actions-left">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,audio/*,video/*,.pdf,.txt,.csv,.docx,.xlsx"
              hidden
              onChange={handleFile}
            />
            <button
              type="button"
              className="composer-icon"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              title="Attach file"
            >
              <IconPaperclip size={14} />
            </button>
            <button
              type="button"
              className={`composer-icon${recording ? " composer-icon-recording" : ""}`}
              disabled={disabled}
              onClick={onToggleRecord}
              aria-label={recording ? "Stop recording" : "Start voice recording"}
              title={recording ? "Stop recording" : "Voice"}
            >
              <IconMic size={14} />
            </button>
            <button
              type="button"
              className="composer-icon"
              disabled={disabled}
              onClick={() => {
                if (!value.trim()) onChange("/");
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-label="Slash commands"
              title="Slash commands (⌘/)"
            >
              <IconSlash size={14} />
            </button>
          </div>

          <div className="composer-actions-right">
            <span className="composer-hint t-meta">
              {streaming ? (
                "Generating…"
              ) : (
                <>
                  <kbd>⌘⏎</kbd> send · <kbd>⇧⏎</kbd> newline
                </>
              )}
            </span>
            {sendButton}
          </div>
        </div>
      </div>
    </div>
  );
});
