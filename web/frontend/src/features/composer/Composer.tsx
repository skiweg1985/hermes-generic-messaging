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
  type PointerEvent,
} from "react";
import {
  applySlashCommand,
  filterSlashCommands,
  getSlashSuggestionQuery,
} from "../chat/slashCommandSuggest";
import { SlashPopover } from "./SlashPopover";
import { useComposerClearance } from "../../hooks/useComposerClearance";
import type { PendingAttachment, ReplyTarget } from "../../types/events";
import {
  IconArrowUp,
  IconStop,
  IconPaperclip,
  IconMic,
  IconAlert,
  IconClose,
  IconLock,
  IconReply,
} from "../shell/icons";
import { TypingIndicator } from "../chat/messages/TypingIndicator";

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 240;

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  value: string;
  disabled: boolean;
  streaming: boolean;
  typing?: boolean;
  recording: boolean;
  recordingLevel: number;
  replyTarget?: ReplyTarget;
  pendingAttachments?: PendingAttachment[];
  onChange: (value: string) => void;
  onClearReply?: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  onFiles: (files: File[]) => void;
  onRetryUpload?: (localId: string) => void;
  onRemovePending?: (localId: string) => void;
  onStartRecord: () => Promise<void>;
  onStopRecord: (options?: { send?: boolean }) => Promise<void>;
}

const RECORD_LOCK_DISTANCE = 72;
const RECORD_MIN_SEND_MS = 650;
const WAVEFORM_BARS = 32;

type RecordGestureState = "idle" | "starting" | "pressing" | "locked" | "finishing";
type RecordPendingStop = "send" | "cancel" | null;

interface RecordPointerState {
  pointerId: number;
  startY: number;
  startAt: number;
  started: boolean;
  locked: boolean;
  pendingStop: RecordPendingStop;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    value,
    disabled,
    streaming,
    typing = false,
    recording,
    recordingLevel,
    replyTarget,
    onChange,
    onClearReply,
    pendingAttachments = [],
    onSubmit,
    onCancel,
    onFiles,
    onRetryUpload,
    onRemovePending,
    onStartRecord,
    onStopRecord,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  useComposerClearance(regionRef);
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [recordGesture, setRecordGesture] = useState<RecordGestureState>("idle");
  const [recordLockProgress, setRecordLockProgress] = useState(0);
  const [recordStartedAt, setRecordStartedAt] = useState<number | null>(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>(
    Array.from({ length: WAVEFORM_BARS }, () => 0.08),
  );
  const recordPointerRef = useRef<RecordPointerState | null>(null);

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

  useEffect(() => {
    if (!recording && recordGesture === "idle") {
      recordPointerRef.current = null;
      setRecordLockProgress(0);
      setRecordStartedAt(null);
      setRecordElapsed(0);
      setWaveformLevels(Array.from({ length: WAVEFORM_BARS }, () => 0.08));
      return;
    }
    const start = recordStartedAt ?? Date.now();
    if (recordStartedAt === null) setRecordStartedAt(start);
    const tick = () => setRecordElapsed(Math.max(0, Date.now() - start));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [recording, recordGesture, recordStartedAt]);

  useEffect(() => {
    if (!recording && recordGesture === "idle") return;
    setWaveformLevels((levels) => {
      const next = [...levels.slice(1), Math.max(0.08, Math.min(1, recordingLevel))];
      return next;
    });
  }, [recording, recordGesture, recordingLevel]);

  // Auto-grow.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const mobileComposer =
      typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    const minHeight = mobileComposer ? 48 : MIN_HEIGHT;
    const maxHeight = mobileComposer ? 132 : MAX_HEIGHT;
    const next = Math.min(maxHeight, Math.max(minHeight, el.scrollHeight));
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

  const finishRecording = useCallback(
    async (send: boolean) => {
      const state = recordPointerRef.current;
      if (state && !state.started) {
        state.pendingStop = send ? "send" : "cancel";
        setRecordGesture("finishing");
        return;
      }

      const elapsed = state ? Date.now() - state.startAt : recordElapsed;
      const shouldSend = send && elapsed >= RECORD_MIN_SEND_MS;
      setRecordGesture("finishing");
      setRecordLockProgress(0);
      try {
        await onStopRecord({ send: shouldSend });
      } finally {
        recordPointerRef.current = null;
        setRecordGesture("idle");
        setRecordStartedAt(null);
        setRecordElapsed(0);
      }
    },
    [onStopRecord, recordElapsed],
  );

  const handleRecordPointerDown = async (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || recording || recordGesture !== "idle") return;
    e.preventDefault();
    const button = e.currentTarget;
    const pointerId = e.pointerId;
    button.setPointerCapture(pointerId);
    const startAt = Date.now();
    recordPointerRef.current = {
      pointerId,
      startY: e.clientY,
      startAt,
      started: false,
      locked: false,
      pendingStop: null,
    };
    setRecordGesture("starting");
    setRecordStartedAt(startAt);
    setRecordElapsed(0);
    setRecordLockProgress(0);
    try {
      await onStartRecord();
    } catch {
      recordPointerRef.current = null;
      setRecordGesture("idle");
      setRecordStartedAt(null);
      setRecordElapsed(0);
      setRecordLockProgress(0);
      return;
    }

    const state = recordPointerRef.current;
    if (!state || state.pointerId !== pointerId) {
      return;
    }
    state.started = true;
    if (state.pendingStop) {
      void finishRecording(state.pendingStop === "send");
      return;
    }
    setRecordGesture(state.locked ? "locked" : "pressing");
  };

  const handleRecordPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const state = recordPointerRef.current;
    if (!state || state.pointerId !== e.pointerId || state.locked) return;
    const deltaY = Math.max(0, state.startY - e.clientY);
    const progress = Math.min(1, deltaY / RECORD_LOCK_DISTANCE);
    setRecordLockProgress(progress);
    if (progress >= 1) {
      state.locked = true;
      state.pendingStop = null;
      setRecordGesture("locked");
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture may already be gone on some mobile browsers */
      }
    }
  };

  const handleRecordPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const state = recordPointerRef.current;
    if (!state || state.pointerId !== e.pointerId || state.locked) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!state.started) {
      state.pendingStop = "send";
      setRecordGesture("finishing");
      return;
    }
    void finishRecording(true);
  };

  const handleRecordPointerCancel = (e: PointerEvent<HTMLButtonElement>) => {
    const state = recordPointerRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!state.started) {
      state.pendingStop = "cancel";
      setRecordGesture("finishing");
      return;
    }
    void finishRecording(false);
  };

  const formatElapsed = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const hasText = value.trim().length > 0;
  const canSend = hasText || hasReadyAttachment;
  const recordingActive = recording || recordGesture !== "idle";
  const recordLocked = recordGesture === "locked";
  const recordBusy = recordGesture === "starting" || recordGesture === "finishing";
  const sendDisabled = disabled || recordingActive || (!canSend && !streaming) || hasUploading;
  const recordButtonLabel = recordLocked
    ? "Aufnahme beenden und senden"
    : recordingActive
      ? "Aufnahme läuft"
      : "Sprachnachricht aufnehmen";
  const recordButtonTitle = recordLocked
    ? "Aufnahme beenden und senden"
    : recordingActive
      ? "Nach oben wischen zum Fixieren"
      : "Gedrückt halten für Sprachnachricht";

  const sendButton = streaming ? (
    <button
      type="button"
      className="composer-send composer-send-stop"
      onClick={onCancel}
      aria-label="Stop generating"
      title="Stop generating (⌘.)"
    >
      <IconStop size={14} />
      <span className="composer-shortcut" aria-hidden>⌘.</span>
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
      <span className="composer-shortcut" aria-hidden>⏎</span>
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
  const recordHint = recordBusy
    ? "Mikrofon startet"
    : recordLocked
      ? "Fixiert: Stop beendet und sendet"
      : "Nach oben wischen zum Fixieren";

  return (
    <div className="composer-region" ref={regionRef}>
      <div
        className={`composer${disabled ? " composer-disabled" : ""}${
          recordingActive ? " composer-recording" : ""
        }${recordLocked ? " composer-recording-locked" : ""}${
          canSend || streaming ? " composer-can-send" : ""
        }`}
      >
        {replyTarget ? (
          <div className="composer-reply" aria-label="Replying to message">
            <span className="composer-reply-marker" aria-hidden>
              <IconReply size={13} />
            </span>
            <span className="composer-reply-body">
              <span className="composer-reply-label">{replyTarget.label}</span>
              <span className="composer-reply-preview truncate">
                {replyTarget.preview}
              </span>
            </span>
            <button
              type="button"
              className="composer-reply-clear"
              onClick={onClearReply}
              aria-label="Clear reply"
            >
              <IconClose size={13} />
            </button>
          </div>
        ) : null}

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

        {menuOpen ? (
          <SlashPopover
            suggestions={suggestions}
            highlightIndex={highlight}
            onPick={(cmd) => {
              const idx = suggestions.indexOf(cmd);
              pickSuggestion(idx);
            }}
            onHover={(i) => setHighlight(i)}
          />
        ) : null}

        {recordingActive ? (
          <div className="composer-recording-panel" aria-live="polite">
            <div className="composer-recording-dot" aria-hidden />
            <span className="composer-recording-time t-mono-sm">
              {formatElapsed(recordElapsed)}
            </span>
            <div className="composer-recording-wave" aria-hidden>
              {waveformLevels.map((level, index) => (
                <span
                  key={index}
                  className="composer-recording-bar"
                  style={{ transform: `scaleY(${0.24 + level * 0.76})` }}
                />
              ))}
            </div>
            {!recordLocked ? (
              <div className="composer-record-lock-rail" aria-hidden>
                <span
                  className="composer-record-lock-target"
                  style={{
                    transform: `translateY(${Math.round((1 - recordLockProgress) * 28)}px)`,
                    opacity: 0.45 + recordLockProgress * 0.55,
                  }}
                >
                  <IconLock size={13} />
                </span>
                <span className="composer-record-lock-label">Fixieren</span>
              </div>
            ) : null}
            <div className="composer-recording-lock-hint t-meta">
              <IconLock size={12} />
              <span>{recordHint}</span>
            </div>
          </div>
        ) : (
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
        )}

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
              disabled={disabled || recordingActive}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              title="Attach file"
            >
              <IconPaperclip size={14} />
              <span className="composer-shortcut" aria-hidden>⌘U</span>
            </button>
            <button
              type="button"
              className={`composer-icon composer-icon-record${recordingActive ? " composer-icon-recording" : ""}${
                recordLocked ? " composer-icon-recording-locked" : ""
              }`}
              disabled={recordBusy || (disabled && !recordingActive)}
              onPointerDown={handleRecordPointerDown}
              onPointerMove={handleRecordPointerMove}
              onPointerUp={handleRecordPointerUp}
              onPointerCancel={handleRecordPointerCancel}
              onClick={() => {
                if (recordLocked) void finishRecording(true);
              }}
              aria-label={recordButtonLabel}
              title={recordButtonTitle}
            >
              {recordLocked ? <IconStop size={14} /> : <IconMic size={14} />}
              <span className="composer-shortcut" aria-hidden>⌥V</span>
            </button>
            <button
              type="button"
              className="composer-icon"
              disabled={disabled || recordingActive}
              onClick={() => {
                if (!value.trim()) onChange("/");
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-label="Slash commands"
              title="Slash commands (⌘/)"
            >
              <span className="composer-slash-pill" aria-hidden>/</span>
              <span className="composer-shortcut" aria-hidden>/</span>
            </button>
          </div>

          <div className="composer-actions-right">
            {recordingActive && recordLocked ? (
              <button
                type="button"
                className="composer-icon composer-recording-cancel"
                onClick={() => void finishRecording(false)}
                aria-label="Cancel voice recording"
                title="Cancel"
              >
                <IconClose size={14} />
                <span className="composer-shortcut" aria-hidden>Esc</span>
              </button>
            ) : (
              <span className="composer-hint t-meta">
              {typing ? (
                <span className="composer-status" aria-live="polite" aria-label="Assistant schreibt">
                  <TypingIndicator />
                  <span className="composer-status-label">Schreibt…</span>
                </span>
              ) : streaming ? (
                "Generating…"
              ) : (
                <>
                  <kbd>⏎</kbd> send · <kbd>⇧⏎</kbd> newline
                </>
              )}
              </span>
            )}
            {recordingActive && recordLocked ? null : sendButton}
          </div>
        </div>
      </div>
    </div>
  );
});
