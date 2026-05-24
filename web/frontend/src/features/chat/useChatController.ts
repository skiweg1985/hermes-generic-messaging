import { useCallback, useEffect, useReducer, useRef } from "react";
import { WsClient } from "../../api/wsClient";
import { uploadMedia } from "../../api/mediaClient";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { DEFAULT_CHAT_ID, chatReducer, initialChatState } from "./chatReducer";
import { loadChatState, persistChatState } from "./sessionPersistence";
import { newId } from "../../lib/uuid";
import type { AssistantButton, ChatSession, TranscriptLine } from "../../types/events";

const USER_ID = "user-demo";
const TYPING_TIMEOUT_MS = 5500;

export interface ChatController {
  userId: string;
  connection: "connecting" | "connected" | "error";
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

export function useChatController(): ChatController {
  const [state, dispatch] = useReducer(
    chatReducer,
    initialChatState(DEFAULT_CHAT_ID, "demo"),
    loadChatState,
  );
  const wsRef = useRef<WsClient | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const { recording, start: startRec, stop: stopRec } = useAudioRecorder();

  const activeSession = state.sessionsById[state.activeChatId];
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

  const submit = useCallback(() => {
    const session = state.sessionsById[state.activeChatId];
    const raw = session.input.trim();
    if (!raw || !wsRef.current || !connected) return;

    if (raw === "cancel") {
      if (session.streamingMessageId) {
        wsRef.current.sendCancel(session.streamingMessageId, session.chatId, USER_ID);
      }
      dispatch({ type: "SET_INPUT", input: "" });
      return;
    }

    if (raw.startsWith("/")) {
      dispatch({ type: "USER_COMMAND", command: raw });
      wsRef.current.sendCommand(raw, session.chatId, USER_ID);
    } else {
      dispatch({ type: "USER_TEXT", text: raw });
      wsRef.current.sendText(raw, session.chatId, USER_ID);
    }
    dispatch({ type: "SET_INPUT", input: "" });
  }, [state.activeChatId, state.sessionsById, connected]);

  const cancel = useCallback(() => {
    const session = state.sessionsById[state.activeChatId];
    if (session.streamingMessageId && wsRef.current) {
      wsRef.current.sendCancel(session.streamingMessageId, session.chatId, USER_ID);
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
      if (!wsRef.current || !connected) return;
      const chatId = state.activeChatId;
      try {
        const result = await uploadMedia(file, file.name);
        dispatch({
          type: "USER_UPLOAD",
          filename: file.name,
          mime: result.mime_type,
          size: result.size_bytes,
          url: result.url,
          chatId,
        });
        const delivered = wsRef.current.sendFileUploaded(
          {
            message_id: newId(),
            filename: file.name,
            mime_type: result.mime_type,
            size_bytes: result.size_bytes,
            url: result.url,
          },
          chatId,
          USER_ID,
        );
        if (!delivered) {
          dispatch({
            type: "USER_ERROR",
            code: "WS_NOT_CONNECTED",
            message: "file stored but agent not notified — reconnect and resend",
            chatId,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload failed";
        const [code, ...rest] = msg.split(": ");
        dispatch({
          type: "USER_ERROR",
          code: code ?? "UPLOAD_FAILED",
          message: rest.join(": ") || msg,
          chatId,
        });
      }
    },
    [connected, state.activeChatId],
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

  const uploadAudio = useCallback(
    async (file: File) => {
      if (!wsRef.current || !connected) return;
      const chatId = state.activeChatId;
      try {
        const result = await uploadMedia(file, file.name);
        dispatch({
          type: "USER_UPLOAD",
          filename: file.name,
          mime: result.mime_type,
          size: result.size_bytes,
          url: result.url,
          chatId,
        });
        const delivered = wsRef.current.sendAudioUploaded(
          {
            message_id: newId(),
            mime_type: result.mime_type,
            size_bytes: result.size_bytes,
            url: result.url,
          },
          chatId,
          USER_ID,
        );
        if (!delivered) {
          dispatch({
            type: "USER_ERROR",
            code: "WS_NOT_CONNECTED",
            message: "audio stored but agent not notified — reconnect and resend",
            chatId,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload failed";
        const [code, ...rest] = msg.split(": ");
        dispatch({
          type: "USER_ERROR",
          code: code ?? "UPLOAD_FAILED",
          message: rest.join(": ") || msg,
          chatId,
        });
      }
    },
    [connected, state.activeChatId],
  );

  const toggleRecord = useCallback(async () => {
    if (!connected) return;
    if (recording) {
      try {
        const blob = await stopRec();
        const name = `recording.webm`;
        await uploadAudio(new File([blob], name, { type: blob.type || "audio/webm" }));
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
  }, [connected, recording, startRec, stopRec, uploadAudio]);

  const reconnect = useCallback(() => {
    wsRef.current?.reconnect();
  }, []);

  return {
    userId: USER_ID,
    connection: state.connection,
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
    uploadFile,
    toggleRecord,
    clickButton,
    reconnect,
    sendCommand,
  };
}
