import { useEffect } from "react";
import type { ConnectionStatus } from "../../types/events";
import type { WsCloseInfo } from "../../api/wsClient";
import type { UpstreamDiagnostics, UpstreamStatus } from "../../api/diagnosticsClient";

interface ConnectionDiagnosticsProps {
  connection: ConnectionStatus;
  reconnecting: boolean;
  link: WsCloseInfo | null;
  upstream: UpstreamDiagnostics | null;
  upstreamLoading: boolean;
  onReconnect: () => void;
  onRefresh: () => void;
}

type Health = "ok" | "warn" | "bad" | "idle";

function browserHealth(status: ConnectionStatus): Health {
  if (status === "connected") return "ok";
  if (status === "connecting") return "warn";
  return "bad";
}

function browserLabel(status: ConnectionStatus, reconnecting: boolean): string {
  if (status === "connected") return "Connected";
  if (status === "connecting") return reconnecting ? "Reconnecting…" : "Connecting…";
  return "Disconnected";
}

function upstreamHealth(status: UpstreamStatus): Health {
  if (status === "ok") return "ok";
  if (status === "closed") return "warn";
  return "bad";
}

function upstreamLabel(status: UpstreamStatus): string {
  switch (status) {
    case "ok":
      return "Reachable";
    case "unreachable":
      return "Unreachable";
    case "unauthorized":
      return "Unauthorized";
    case "closed":
      return "Closed";
    case "error":
      return "Error";
  }
}

function linkDetail(link: WsCloseInfo): string {
  const reason = link.reason?.trim();
  if (reason) return `${link.code} · ${reason}`;
  return `Code ${link.code}`;
}

export function ConnectionDiagnostics({
  connection,
  reconnecting,
  link,
  upstream,
  upstreamLoading,
  onReconnect,
  onRefresh,
}: ConnectionDiagnosticsProps) {
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const showLinkDetail = connection !== "connected" && link !== null;

  return (
    <section className="peek-section">
      <div className="peek-section-head">
        <div className="t-label peek-section-label">Connection</div>
        <button
          type="button"
          className="peek-inline-action"
          onClick={onRefresh}
          disabled={upstreamLoading}
        >
          {upstreamLoading ? "Checking…" : "Recheck"}
        </button>
      </div>

      <div className="diag-hop">
        <span className={`diag-dot diag-dot-${browserHealth(connection)}`} />
        <div className="diag-hop-body">
          <div className="t-body-sm">Browser → Server</div>
          <div className="t-meta diag-hop-status">
            {browserLabel(connection, reconnecting)}
            {showLinkDetail ? ` · ${linkDetail(link)}` : ""}
          </div>
        </div>
      </div>

      <div className="diag-hop">
        <span
          className={`diag-dot diag-dot-${upstream ? upstreamHealth(upstream.status) : "idle"}`}
        />
        <div className="diag-hop-body">
          <div className="t-body-sm">Server → Upstream</div>
          <div className="t-meta diag-hop-status">
            {upstream ? upstreamLabel(upstream.status) : upstreamLoading ? "Checking…" : "Unknown"}
            {upstream?.target ? ` · ${upstream.target}` : ""}
          </div>
          {upstream?.error ? <div className="t-meta diag-hop-error">{upstream.error}</div> : null}
        </div>
      </div>

      {connection !== "connected" ? (
        <button type="button" className="diag-reconnect" onClick={onReconnect}>
          Reconnect
        </button>
      ) : null}
    </section>
  );
}
