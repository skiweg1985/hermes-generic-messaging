import { useCallback, useEffect, useReducer, useRef, type Dispatch } from "react";
import { WsClient } from "../../api/wsClient";
import { uploadMedia } from "../../api/mediaClient";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import {
  DEFAULT_CHAT_ID,
  chatReducer,
  createChatSession,
  initialChatState,
  resolveCancelTargetId,
  type ChatAction,
} from "./chatReducer";
import { loadChatState, persistChatState } from "./sessionPersistence";
import { newId } from "../../lib/uuid";
import { normalizeMimeType } from "../../lib/normalizeMimeType";
import type {
  AssistantButton,
  ChatSession,
  MessageAttachment,
  PendingAttachment,
  TranscriptLine,
} from "../../types/events";

const USER_ID = "user-demo";
const TYPING_TIMEOUT_MS = 5500;

export interface ChatController {
  userId: string;
  connection: "connecting" | "connected" | "error";
  reconnecting: boolean;
  connected: boolean;
  recording: boolean;
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
  toggleRecord: () => Promise<void>;
  clickButton: (line: TranscriptLine, button: AssistantButton) => void;
  reconnect: () => void;
  sendCommand: (command: string) => void;
}

function createBrowserChatId(): string {
  const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : newId();
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
  const [state, dispatch] = useReducer(
    chatReducer,
    initialChatState(DEFAULT_CHAT_ID, "demo"),
    loadChatState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const wsRef = useRef<WsClient | null>(null);
  const hasConnectedOnceRef = useRef(false);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const uploadPromisesRef = useRef<
    Map<string, Promise<PendingAttachment["result"]>>
  >(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const { recording, start: startRec, stop: stopRec } = useAudioRecorder();

  const activeSession =
    state.sessionsById[state.activeChatId] ??
    Object.values(state.sessionsById)[0] ??
    createChatSession(state.activeChatId);
  const sessions = Object.values(state.sessionsById).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  useEffect(() => {
    const client = new WsClient(
      (event) => dispatch({ type: "INBOUND_EVENT", event }),
      (connection) => dispatch({ type: "SET_CONNECTION", connection }),
    );
    wsRef.current = client;
    client.connect();
    return () => client.disconnect();
  }, []);

  useEffect(() => {
    dispatch({ type: "SET_RECORDING", recording });
  }, [recording]);

  useEffect(() => {
    persistChatState(state);
  }, [state.activeChatId, state.sessionsById]);

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

  const connected = state.connection === "connected";
  if (connected) hasConnectedOnceRef.current = true;
  const reconnecting =
    state.connection === "connecting" && hasConnectedOnceRef.current;

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
      if (!wsRef.current || stateRef.current.connection !== "connected") return;

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
        if (!wsRef.current || stateRef.current.connection !== "connected") return;
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
          wsRef.current.sendCancel(cancelTarget, session.chatId, USER_ID);
        }
        dispatch({ type: "SET_INPUT", input: "" });
        return;
      }

      if (raw.startsWith("/")) {
        dispatch({ type: "USER_COMMAND", command: raw });
        wsRef.current.sendCommand(raw, session.chatId, USER_ID);
        dispatch({ type: "SET_INPUT", input: "" });
        dispatch({ type: "CLEAR_PENDING_ATTACHMENTS" });
        pendingFilesRef.current.clear();
        return;
      }

      const turnMessageId = newId();
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

      const delivered = wsRef.current.sendMessage(
        { messageId: turnMessageId, text: raw, attachments },
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
    if (cancelTarget && wsRef.current) {
      wsRef.current.sendCancel(cancelTarget, session.chatId, USER_ID);
    }
  }, [state.activeChatId, state.sessionsById]);

  const sendCommand = useCallback(
    (command: string) => {
      if (!wsRef.current || !connected) return;
      const chatId = state.activeChatId;
      dispatch({ type: "USER_COMMAND", command });
      wsRef.current.sendCommand(command, chatId, USER_ID);
    },
    [connected, state.activeChatId],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      await addFiles([file]);
    },
    [addFiles],
  );

  const clickButton = useCallback(
    (line: TranscriptLine, button: AssistantButton) => {
      if (!wsRef.current || !connected || line.clickedButtonId) return;
      const chatId = state.activeChatId;

      if (line.buttonKind === "slash_pick" && line.commandBase) {
        const cmd = `${line.commandBase} ${button.id}`.trim();
        dispatch({ type: "USER_COMMAND", command: cmd });
        wsRef.current.sendCommand(cmd, chatId, USER_ID);
        dispatch({ type: "BUTTON_CLICKED", chatId, lineId: line.id, buttonId: button.id });
        return;
      }

      if (line.buttonKind === "model_picker") {
        if (button.id === "mx:noop") return;
        wsRef.current.sendButtonClick(
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

      wsRef.current.sendButtonClick(
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

  const toggleRecord = useCallback(async () => {
    if (!connected) {
      dispatch(notConnectedError(state.activeChatId));
      return;
    }
    if (recording) {
      try {
        const blob = await stopRec();
        const mime = normalizeMimeType(blob.type || "audio/webm");
        const file = new File([blob], "recording.webm", { type: mime });
        await addFiles([file]);
      } catch {
        dispatch({
          type: "USER_ERROR",
          code: "RECORD_FAILED",
          message: "could not finalize recording",
        });
      }
    } else {
      try {
        await startRec();
      } catch {
        dispatch({
          type: "USER_ERROR",
          code: "MIC_DENIED",
          message: "microphone access denied",
        });
      }
    }
  }, [connected, recording, startRec, stopRec, addFiles, state.activeChatId]);

  const reconnect = useCallback(() => {
    wsRef.current?.reconnect();
  }, []);

  return {
    userId: USER_ID,
    connection: state.connection,
    reconnecting,
    connected,
    recording,
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
    toggleRecord,
    clickButton,
    reconnect,
    sendCommand,
  };
}
