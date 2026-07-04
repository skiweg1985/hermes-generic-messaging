import { useCallback, useEffect, useReducer, useRef, type Dispatch } from "react";
import type { WsCloseInfo } from "../../api/wsClient";
import { uploadMedia } from "../../api/mediaClient";
import { loadRemoteChatState, persistRemoteChatState } from "../../api/sessionClient";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { useConnectionStore } from "../../hooks/useConnectionStore";
import type { UpstreamDiagnostics } from "../../api/diagnosticsClient";
import {
  chatReducer,
  createChatSession,
  initialChatState,
  resolveCancelTargetId,
  type ChatAction,
} from "./chatReducer";
import { loadChatState, mergeChatStates, persistChatState } from "./sessionPersistence";
import { replyTargetFromLine, withReplyPrefix } from "./messageActions";
import { newId } from "../../lib/uuid";
import { normalizeMimeType } from "../../lib/normalizeMimeType";
import type {
  AssistantButton,
  ChatSession,
  ChatState,
  MessageAttachment,
  PendingAttachment,
  ReplyTarget,
  TranscriptLine,
} from "../../types/events";

const USER_ID = "user-demo";
const TYPING_TIMEOUT_MS = 5500;

export interface ChatController {
  userId: string;
  connection: "connecting" | "connected" | "error";
  reconnecting: boolean;
  connected: boolean;
  link: WsCloseInfo | null;
  upstream: UpstreamDiagnostics | null;
  upstreamLoading: boolean;
  refreshDiagnostics: () => void;
  recording: boolean;
  recordingLevel: number;
  replyTarget?: ReplyTarget;
  streaming: boolean;
  activeChatId: string;
  activeSession: ChatSession;
  sessions: ChatSession[];
  setActiveChat: (chatId: string) => void;
  createChat: () => string;
  setInput: (value: string) => void;
  submit: () => void;
  cancel: () => void;
  addFiles: (files: File[]) => Promise<void>;
  retryUpload: (localId: string) => Promise<void>;
  removePending: (localId: string) => void;
  uploadFile: (file: File) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: (options?: { send?: boolean }) => Promise<void>;
  replyToLine: (line: TranscriptLine) => void;
  clearReply: () => void;
  deleteLineLocal: (lineId: string) => void;
  retryLine: (line: TranscriptLine) => void;
  clickButton: (line: TranscriptLine, button: AssistantButton) => void;
  reconnect: () => void;
  sendCommand: (command: string) => void;
}

function voiceFilenameForMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("mp4")) return "voice-message.m4a";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "voice-message.mp3";
  if (lower.includes("ogg") || lower.includes("opus")) return "voice-message.ogg";
  if (lower.includes("wav")) return "voice-message.wav";
  return "voice-message.webm";
}

function createBrowserChatId(): string {
  const id =
    typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : newId();
  return `workspace:${id}`;
}

function notConnectedError(chatId: string): ChatAction {
  return {
    type: "USER_ERROR",
    code: "NOT_CONNECTED",
    message: "not connected — wait for reconnect or use Reconnect",
    chatId,
  };
}

async function uploadPendingFile(
  file: File,
  localId: string,
  chatId: string,
  dispatch: Dispatch<ChatAction>,
): Promise<PendingAttachment["result"]> {
  dispatch({
    type: "SET_PENDING_ATTACHMENT_STATUS",
    chatId,
    localId,
    status: "uploading",
  });
  const result = await uploadMedia(file, file.name);
  const uploaded: PendingAttachment["result"] = {
    url: result.url,
    mime_type: result.mime_type,
    size_bytes: result.size_bytes,
    filename: file.name,
    attachment_id: newId(),
  };
  dispatch({
    type: "SET_PENDING_ATTACHMENT_STATUS",
    chatId,
    localId,
    status: "done",
    result: uploaded,
  });
  return uploaded;
}

export function useChatController(): ChatController {
  const fallbackStateRef = useRef<ChatState | null>(null);
  if (fallbackStateRef.current === null) {
    fallbackStateRef.current = initialChatState(createBrowserChatId(), "New chat");
  }
  const [state, dispatch] = useReducer(
    chatReducer,
    fallbackStateRef.current,
    loadChatState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const conn = useConnectionStore(
    useCallback((event) => dispatch({ type: "INBOUND_EVENT", event }), []),
  );
  const { client, connection, connected, reconnecting, link, upstream, upstreamLoading, reconnect, refreshDiagnostics } =
    conn;
  const connectedRef = useRef(false);
  connectedRef.current = connected;
  const remotePersistenceReadyRef = useRef(false);
  const remotePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const uploadPromisesRef = useRef<
    Map<string, Promise<PendingAttachment["result"]>>
  >(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const { recording, level: recordingLevel, start: startRec, stop: stopRec } = useAudioRecorder();

  const activeSession =
    state.sessionsById[state.activeChatId] ??
    Object.values(state.sessionsById)[0] ??
    createChatSession(state.activeChatId);
  const sessions = Object.values(state.sessionsById).sort((a, b) =>
    (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
  );

  useEffect(() => {
    dispatch({ type: "SET_RECORDING", recording });
  }, [recording]);

  useEffect(() => {
    persistChatState(state);
    if (!remotePersistenceReadyRef.current) return;
    if (remotePersistTimerRef.current !== null) {
      clearTimeout(remotePersistTimerRef.current);
    }
    remotePersistTimerRef.current = setTimeout(() => {
      remotePersistTimerRef.current = null;
      void persistRemoteChatState(stateRef.current).catch(() => {});
    }, 700);
  }, [state.activeChatId, state.sessionsById]);

  useEffect(() => {
    let cancelled = false;
    void loadRemoteChatState(stateRef.current)
      .then((remoteState) => {
        if (cancelled) return;
        if (remoteState) {
          const merged = mergeChatStates(stateRef.current, remoteState);
          dispatch({ type: "HYDRATE_STATE", state: merged });
        } else {
          void persistRemoteChatState(stateRef.current).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) remotePersistenceReadyRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (remotePersistTimerRef.current !== null) {
        clearTimeout(remotePersistTimerRef.current);
        remotePersistTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const timers = typingTimersRef.current;
    for (const session of Object.values(state.sessionsById)) {
      if (!session.typing || !session.typingStartedAt || timers.has(session.chatId))
        continue;
      const startedAt = Date.parse(session.typingStartedAt);
      const age = Number.isNaN(startedAt) ? 0 : Date.now() - startedAt;
      const delay = Math.max(0, TYPING_TIMEOUT_MS - age);
      const timer = setTimeout(() => {
        timers.delete(session.chatId);
        dispatch({ type: "CLEAR_TYPING", chatId: session.chatId });
      }, delay);
      timers.set(session.chatId, timer);
    }
    for (const [chatId, timer] of timers) {
      const session = state.sessionsById[chatId];
      if (session?.typing && session.typingStartedAt) continue;
      clearTimeout(timer);
      timers.delete(chatId);
    }
  }, [state.sessionsById]);

  useEffect(() => {
    const timers = typingTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const setActiveChat = useCallback((chatId: string) => {
    dispatch({ type: "SET_ACTIVE_CHAT", chatId });
  }, []);

  const createChat = useCallback(() => {
    const chatId = createBrowserChatId();
    const sessionCount = Object.keys(state.sessionsById).length;
    dispatch({ type: "CREATE_CHAT", chatId, label: `chat ${sessionCount + 1}` });
    return chatId;
  }, [state.sessionsById]);

  const setInput = useCallback((input: string) => {
    dispatch({ type: "SET_INPUT", input });
  }, []);

  const startPendingUpload = useCallback(
    (file: File, localId: string, chatId: string) => {
      const task = uploadPendingFile(file, localId, chatId, dispatch)
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "upload failed";
          const [code, ...rest] = msg.split(": ");
          dispatch({
            type: "SET_PENDING_ATTACHMENT_STATUS",
            chatId,
            localId,
            status: "error",
            error: {
              code: code ?? "UPLOAD_FAILED",
              message: rest.join(": ") || msg,
            },
          });
          throw err;
        })
        .finally(() => {
          uploadPromisesRef.current.delete(localId);
        });
      uploadPromisesRef.current.set(localId, task);
      return task;
    },
    [],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const chatId = state.activeChatId;
      if (!connected) {
        dispatch(notConnectedError(chatId));
        return;
      }
      const uploadChatId = chatId;
      for (const file of files) {
        const localId = newId();
        pendingFilesRef.current.set(localId, file);
        dispatch({
          type: "ADD_PENDING_ATTACHMENT",
          chatId: uploadChatId,
          localId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        });
        try {
          await startPendingUpload(file, localId, uploadChatId);
        } catch {}
      }
    },
    [connected, startPendingUpload, state.activeChatId],
  );

  const retryUpload = useCallback(
    async (localId: string) => {
      const file = pendingFilesRef.current.get(localId);
      if (!file) return;
      if (!connected) {
        dispatch(notConnectedError(state.activeChatId));
        return;
      }
      let targetChatId = state.activeChatId;
      for (const session of Object.values(state.sessionsById)) {
        if (session.pendingAttachments.some((a) => a.localId === localId)) {
          targetChatId = session.chatId;
          break;
        }
      }
      try {
        await startPendingUpload(file, localId, targetChatId);
      } catch {}
    },
    [connected, startPendingUpload, state.activeChatId, state.sessionsById],
  );

  const removePending = useCallback(
    (localId: string) => {
      pendingFilesRef.current.delete(localId);
      dispatch({
        type: "REMOVE_PENDING_ATTACHMENT",
        chatId: state.activeChatId,
        localId,
      });
    },
    [state.activeChatId],
  );

  const submit = useCallback(() => {
    void (async () => {
      if (!connectedRef.current) return;

      const activeChatId = stateRef.current.activeChatId;
      let session = stateRef.current.sessionsById[activeChatId];
      if (!session) return;

      const pendingUploads = session.pendingAttachments
        .filter((a) => a.status === "uploading" || a.status === "queued")
        .map((a) => uploadPromisesRef.current.get(a.localId))
        .filter(
          (
            task,
          ): task is Promise<PendingAttachment["result"]> => task !== undefined,
        );
      if (pendingUploads.length > 0) {
        await Promise.allSettled(pendingUploads);
        if (!connectedRef.current) return;
        session = stateRef.current.sessionsById[activeChatId];
        if (!session) return;
      }

      const raw = session.input.trim();
      const ready = session.pendingAttachments.filter((a) => a.status === "done" && a.result);
      const hasPendingAttachmentErrors = session.pendingAttachments.some(
        (a) => a.status === "error",
      );
      const hasIncompleteAttachments = session.pendingAttachments.some(
        (a) => a.status === "uploading" || a.status === "queued",
      );
      if (hasPendingAttachmentErrors) {
        dispatch({
          type: "USER_ERROR",
          code: "UPLOAD_FAILED",
          message: "retry or remove failed attachments before sending",
          chatId: session.chatId,
        });
        return;
      }
      if ((!raw && ready.length === 0) || hasIncompleteAttachments) {
        return;
      }

      if (raw === "cancel") {
        const cancelTarget = resolveCancelTargetId(session);
        if (cancelTarget) {
          client.sendCancel(cancelTarget, session.chatId, USER_ID);
        }
        dispatch({ type: "SET_INPUT", input: "" });
        return;
      }

      if (raw.startsWith("/")) {
        dispatch({ type: "USER_COMMAND", command: raw });
        client.sendCommand(raw, session.chatId, USER_ID);
        dispatch({ type: "SET_INPUT", input: "" });
        dispatch({ type: "CLEAR_PENDING_ATTACHMENTS" });
        pendingFilesRef.current.clear();
        return;
      }

      const turnMessageId = newId();
      const outboundText = withReplyPrefix(raw, session.replyTarget);
      const attachments: MessageAttachment[] = ready.map((entry) => ({
        attachment_id: entry.result!.attachment_id,
        mime_type: entry.result!.mime_type,
        size_bytes: entry.result!.size_bytes,
        url: entry.result!.url,
        file_ref: entry.result!.url,
        filename: entry.result!.filename,
      }));

      dispatch({
        type: "USER_MESSAGE",
        turnMessageId,
        text: raw,
        attachments: ready.map((entry) => ({
          attachmentId: entry.result!.attachment_id,
          filename: entry.result!.filename,
          mime: entry.result!.mime_type,
          size: entry.result!.size_bytes,
          url: entry.result!.url,
        })),
      });

      const delivered = client.sendMessage(
        { messageId: turnMessageId, text: outboundText, attachments },
        session.chatId,
        USER_ID,
      );

      if (!delivered) {
        dispatch({
          type: "USER_ERROR",
          code: "WS_NOT_CONNECTED",
          message: "message not delivered — reconnect and resend",
          chatId: session.chatId,
        });
      }

      dispatch({ type: "SET_INPUT", input: "" });
      dispatch({ type: "CLEAR_PENDING_ATTACHMENTS" });
      pendingFilesRef.current.clear();
    })();
  }, []);

  const cancel = useCallback(() => {
    const session = state.sessionsById[state.activeChatId];
    const cancelTarget = resolveCancelTargetId(session);
    if (cancelTarget && client) {
      client.sendCancel(cancelTarget, session.chatId, USER_ID);
    }
  }, [state.activeChatId, state.sessionsById]);

  const sendCommand = useCallback(
    (command: string) => {
      if (!connected) return;
      const chatId = state.activeChatId;
      dispatch({ type: "USER_COMMAND", command });
      client.sendCommand(command, chatId, USER_ID);
    },
    [connected, state.activeChatId],
  );

  const replyToLine = useCallback((line: TranscriptLine) => {
    dispatch({
      type: "SET_REPLY_TARGET",
      chatId: stateRef.current.activeChatId,
      target: replyTargetFromLine(line),
    });
  }, []);

  const clearReply = useCallback(() => {
    dispatch({
      type: "CLEAR_REPLY_TARGET",
      chatId: stateRef.current.activeChatId,
    });
  }, []);

  const deleteLineLocal = useCallback((lineId: string) => {
    dispatch({
      type: "DELETE_LINE_LOCAL",
      chatId: stateRef.current.activeChatId,
      lineId,
    });
  }, []);

  const retryLine = useCallback((line: TranscriptLine) => {
    const current = stateRef.current;
    const chatId = current.activeChatId;
    if (!connectedRef.current) {
      dispatch(notConnectedError(chatId));
      return;
    }

    if (line.kind === "command" && line.text.trim().startsWith("/")) {
      const command = line.text.trim();
      dispatch({ type: "USER_COMMAND", command });
      client.sendCommand(command, chatId, USER_ID);
      return;
    }

    if (line.kind === "user" && line.text.trim()) {
      const turnMessageId = newId();
      const text = line.text.trim();
      dispatch({ type: "USER_TEXT", text, turnMessageId });
      const delivered = client.sendMessage(
        { messageId: turnMessageId, text, attachments: [] },
        chatId,
        USER_ID,
      );
      if (!delivered) {
        dispatch({
          type: "USER_ERROR",
          code: "WS_NOT_CONNECTED",
          message: "message not delivered - reconnect and resend",
          chatId,
        });
      }
      return;
    }

    const command = "/retry";
    dispatch({ type: "USER_COMMAND", command });
    client.sendCommand(command, chatId, USER_ID);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      await addFiles([file]);
    },
    [addFiles],
  );

  const clickButton = useCallback(
    (line: TranscriptLine, button: AssistantButton) => {
      if (!connected || line.clickedButtonId) return;
      const chatId = state.activeChatId;

      if (line.buttonKind === "slash_pick" && line.commandBase) {
        const cmd = `${line.commandBase} ${button.id}`.trim();
        dispatch({ type: "USER_COMMAND", command: cmd });
        client.sendCommand(cmd, chatId, USER_ID);
        dispatch({ type: "BUTTON_CLICKED", chatId, lineId: line.id, buttonId: button.id });
        return;
      }

      if (line.buttonKind === "model_picker") {
        if (button.id === "mx:noop") return;
        client.sendButtonClick(
          {
            message_id: line.id,
            confirm_id: line.confirmId,
            button_id: button.id,
            choice: button.id,
          },
          chatId,
          USER_ID,
          { threadId: line.threadId, sessionId: line.sessionId },
        );
        return;
      }

      client.sendButtonClick(
        {
          message_id: line.id,
          confirm_id: line.confirmId,
          button_id: button.id,
          choice: button.id,
        },
        chatId,
        USER_ID,
        { threadId: line.threadId, sessionId: line.sessionId },
      );
      dispatch({ type: "BUTTON_CLICKED", chatId, lineId: line.id, buttonId: button.id });
    },
    [connected, state.activeChatId],
  );

  const startRecording = useCallback(async () => {
    if (!connected) {
      dispatch(notConnectedError(state.activeChatId));
      return;
    }
    try {
      await startRec();
    } catch (err) {
      dispatch({
        type: "USER_ERROR",
        code: "MIC_DENIED",
        message: "microphone access denied",
        chatId: state.activeChatId,
      });
      throw err;
    }
  }, [connected, startRec, state.activeChatId]);

  const stopRecording = useCallback(
    async (options: { send?: boolean } = { send: true }) => {
      const shouldSend = options.send !== false;
      const chatId = stateRef.current.activeChatId;
      try {
        const blob = await stopRec();
        if (!shouldSend || blob.size === 0) return;
        if (!connectedRef.current) {
          dispatch(notConnectedError(chatId));
          return;
        }
        const session = stateRef.current.sessionsById[chatId];
        const outboundText = withReplyPrefix("", session?.replyTarget);

        const mime = normalizeMimeType(blob.type || "audio/webm");
        const filename = voiceFilenameForMime(mime);
        const file = new File([blob], filename, { type: mime });
        const upload = await uploadMedia(file, filename);
        if (!connectedRef.current) {
          dispatch(notConnectedError(chatId));
          return;
        }

        const turnMessageId = newId();
        const attachmentId = newId();
        dispatch({
          type: "USER_VOICE",
          turnMessageId,
          attachmentId,
          mime: upload.mime_type,
          size: upload.size_bytes,
          url: upload.url,
        });
        const delivered = client.sendMessage(
          {
            messageId: turnMessageId,
            text: outboundText,
            attachments: [
              {
                attachment_id: attachmentId,
                mime_type: upload.mime_type,
                size_bytes: upload.size_bytes,
                url: upload.url,
                file_ref: upload.url,
                filename,
              },
            ],
          },
          chatId,
          USER_ID,
        );

        if (!delivered) {
          dispatch({
            type: "USER_ERROR",
            code: "WS_NOT_CONNECTED",
            message: "voice message not delivered - reconnect and resend",
            chatId,
          });
        }
      } catch {
        if (!shouldSend) return;
        dispatch({
          type: "USER_ERROR",
          code: "RECORD_FAILED",
          message: shouldSend ? "could not send voice message" : "could not finalize recording",
          chatId,
        });
      }
    },
    [stopRec],
  );

  const reconnectNow = useCallback(() => {
    reconnect();
  }, [reconnect]);

  return {
    userId: USER_ID,
    connection,
    reconnecting,
    connected,
    link,
    upstream,
    upstreamLoading,
    refreshDiagnostics,
    recording,
    recordingLevel,
    replyTarget: activeSession.replyTarget,
    streaming: activeSession.streamingMessageId !== null,
    activeChatId: state.activeChatId,
    activeSession,
    sessions,
    setActiveChat,
    createChat,
    setInput,
    submit,
    cancel,
    addFiles,
    retryUpload,
    removePending,
    uploadFile,
    startRecording,
    stopRecording,
    replyToLine,
    clearReply,
    deleteLineLocal,
    retryLine,
    clickButton,
    reconnect: reconnectNow,
    sendCommand,
  };
}
