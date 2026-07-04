import { useCallback, useEffect, useRef, useState } from "react";
import { WsClient, type WsCloseInfo } from "../api/wsClient";
import { fetchDiagnostics, type UpstreamDiagnostics } from "../api/diagnosticsClient";
import type { ConnectionStatus, EventEnvelope } from "../types/events";

export interface ConnectionStore {
  connection: ConnectionStatus;
  connected: boolean;
  reconnecting: boolean;
  /** Last browser<->BFF close, if any. */
  link: WsCloseInfo | null;
  /** BFF<->upstream probe result, loaded on demand. */
  upstream: UpstreamDiagnostics | null;
  upstreamLoading: boolean;
  reconnect: () => void;
  refreshDiagnostics: () => void;
  client: WsClient;
}

/**
 * Owns the browser<->BFF WebSocket transport and all connection health state.
 * Chat domain state lives in the chat reducer; this store is the single source
 * of truth for connection status, reconnect handling and link/upstream
 * diagnostics.
 */
export function useConnectionStore(onEvent: (event: EventEnvelope) => void): ConnectionStore {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [link, setLink] = useState<WsCloseInfo | null>(null);
  const [upstream, setUpstream] = useState<UpstreamDiagnostics | null>(null);
  const [upstreamLoading, setUpstreamLoading] = useState(false);
  const hasConnectedOnceRef = useRef(false);
  const clientRef = useRef<WsClient | null>(null);

  if (clientRef.current === null) {
    clientRef.current = new WsClient(
      (event) => onEventRef.current(event),
      (status) => {
        if (status === "connected") hasConnectedOnceRef.current = true;
        setConnection(status);
      },
      (info) => setLink(info),
    );
  }
  const client = clientRef.current;

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  const refreshDiagnostics = useCallback(() => {
    setUpstreamLoading(true);
    void fetchDiagnostics()
      .then((result) => {
        if (result) setUpstream(result.upstream);
      })
      .finally(() => setUpstreamLoading(false));
  }, []);

  const reconnect = useCallback(() => {
    client.reconnect();
    refreshDiagnostics();
  }, [client, refreshDiagnostics]);

  const connected = connection === "connected";
  const reconnecting = connection === "connecting" && hasConnectedOnceRef.current;

  return {
    connection,
    connected,
    reconnecting,
    link,
    upstream,
    upstreamLoading,
    reconnect,
    refreshDiagnostics,
    client,
  };
}
