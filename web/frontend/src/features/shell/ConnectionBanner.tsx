import type { ConnectionStatus } from "../../types/events";

interface ConnectionBannerProps {
  status: ConnectionStatus;
  onReconnect: () => void;
}

export function ConnectionBanner({ status, onReconnect }: ConnectionBannerProps) {
  if (status === "connected") return null;

  return (
    <div
      className={`connection-banner connection-banner-${status} motion-fade-in`}
      role="status"
      aria-live="polite"
    >
      <span className="connection-banner-dot" />
      <span className="t-meta connection-banner-text">
        {status === "connecting"
          ? "Connecting…"
          : "Connection lost — trying to reconnect"}
      </span>
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
