import type { ConnectionStatus } from "../types/events";

interface StatusBarProps {
  connection: ConnectionStatus;
  streaming: boolean;
  onReconnect: () => void;
}

export function StatusBar({ connection, streaming, onReconnect }: StatusBarProps) {
  const status =
    connection === "connected"
      ? "[connected]"
      : connection === "connecting"
        ? "[connecting]"
        : "[error]";

  return (
    <div className="terminal-status">
      <span>
        {status}
        {streaming ? " stream:active" : ""}
        {streaming ? " ^C cancel" : ""}
        {connection === "error" ? (
          <>
            {" "}
            <button type="button" onClick={onReconnect}>
              reconnect
            </button>
          </>
        ) : null}
      </span>
      <span>custom_chat v1</span>
    </div>
  );
}
