import type { ConnectionStatus } from "../../types/events";

interface ConnectionBannerProps {
  status: ConnectionStatus;
  reconnecting?: boolean;
  onReconnect: () => void;
}

export function ConnectionBanner({
  status,
  reconnecting = false,
  onReconnect,
}: ConnectionBannerProps) {
  if (status === "connected") return null;

  const statusText =
    status === "connecting"
      ? reconnecting
        ? "Reconnecting…"
        : "Connecting…"
      : "Connection lost — trying to reconnect";

  return (
    <div
      className={`connection-banner connection-banner-${status} motion-fade-in`}
      role="status"
      aria-live="polite"
    >
      <span className="connection-banner-dot" />
      <span className="t-meta connection-banner-text">{statusText}</span>
      {status === "error" ? (
        <button
          type="button"
          className="connection-banner-action"
          onClick={onReconnect}
        >
          Reconnect now
        </button>
      ) : null}
    </div>
  );
}
