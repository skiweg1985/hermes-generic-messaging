import { useCallback, useEffect, useReducer, useRef } from "react";
import { StatusBar } from "../../components/StatusBar";
import { WsClient } from "../../api/wsClient";
import { uploadAudio } from "../../api/mediaClient";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { AttachControls } from "./AttachControls";
import { chatReducer, initialChatState } from "./chatReducer";
import { PromptLine } from "./PromptLine";
import { Transcript } from "./Transcript";
import { newId } from "../../lib/uuid";

const CHAT_ID = "workspace:demo";
const USER_ID = "user-demo";
const SESSION_LABEL = `${USER_ID}@${CHAT_ID}`;

export function ChatPage() {
  const [state, dispatch] = useReducer(
    chatReducer,
    initialChatState(SESSION_LABEL),
  );
  const wsRef = useRef<WsClient | null>(null);
  const { recording, start: startRec, stop: stopRec } = useAudioRecorder();

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

  const connected = state.connection === "connected";

  const handleSubmit = useCallback(() => {
    const raw = state.input.trim();
    if (!raw || !wsRef.current || !connected) return;

    if (raw === "cancel") {
      if (state.streamingMessageId) {
        wsRef.current.sendCancel(state.streamingMessageId, CHAT_ID, USER_ID);
      }
      dispatch({ type: "SET_INPUT", input: "" });
      return;
    }

    if (raw.startsWith("/")) {
      dispatch({ type: "USER_COMMAND", command: raw });
      wsRef.current.sendCommand(raw, CHAT_ID, USER_ID);
    } else {
      dispatch({ type: "USER_TEXT", text: raw });
      wsRef.current.sendText(raw, CHAT_ID, USER_ID);
    }
    dispatch({ type: "SET_INPUT", input: "" });
  }, [state.input, state.streamingMessageId, connected]);

  const handleCancel = useCallback(() => {
    if (state.streamingMessageId && wsRef.current) {
      wsRef.current.sendCancel(state.streamingMessageId, CHAT_ID, USER_ID);
    }
  }, [state.streamingMessageId]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!wsRef.current || !connected) return;
      try {
        const result = await uploadAudio(file, file.name);
        dispatch({
          type: "USER_UPLOAD",
          filename: file.name,
          mime: result.mime_type,
          size: result.size_bytes,
        });
        wsRef.current.sendAudioUploaded(
          {
            message_id: newId(),
            mime_type: result.mime_type,
            size_bytes: result.size_bytes,
            url: result.url,
          },
          CHAT_ID,
          USER_ID,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload failed";
        const [code, ...rest] = msg.split(": ");
        dispatch({
          type: "USER_ERROR",
          code: code ?? "UPLOAD_FAILED",
          message: rest.join(": ") || msg,
        });
      }
    },
    [connected],
  );

  const handleToggleRecord = useCallback(async () => {
    if (!connected) return;
    if (recording) {
      try {
        const blob = await stopRec();
        const name = `recording.webm`;
        await handleFile(new File([blob], name, { type: blob.type || "audio/webm" }));
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
  }, [connected, recording, startRec, stopRec, handleFile]);

  return (
    <div className="terminal">
      <div className="terminal-title">{state.sessionLabel}</div>
      <Transcript lines={state.lines} />
      <AttachControls
        disabled={!connected}
        recording={recording}
        onFile={handleFile}
        onToggleRecord={handleToggleRecord}
      />
      <PromptLine
        value={state.input}
        disabled={!connected}
        onChange={(input) => dispatch({ type: "SET_INPUT", input })}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
      <StatusBar
        connection={state.connection}
        streaming={state.streamingMessageId !== null}
        onReconnect={() => wsRef.current?.reconnect()}
      />
    </div>
  );
}
