import { useCallback, useState } from "react";
import {
  isNotificationsEnabled,
  setNotificationsEnabled,
} from "../features/chat/notifications";

export interface NotificationSettings {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission;
  /** Toggle the opt-in; requests browser permission on first enable. Must run inside a user gesture. */
  toggle: () => Promise<void>;
}

function requestPermissionSafe(): Promise<NotificationPermission> {
  try {
    const result = Notification.requestPermission();
    if (result && typeof result.then === "function") return result;
    // Legacy Safari: callback signature, no promise.
    return new Promise((resolve) =>
      Notification.requestPermission((perm) => resolve(perm)),
    );
  } catch {
    return Promise.resolve("denied");
  }
}

/**
 * Owns the browser-notification opt-in. The enabled flag lives in
 * localStorage (the single source of truth `maybeNotify` reads at event
 * time), so no cross-hook subscription is needed.
 */
export function useNotificationSettings(): NotificationSettings {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [enabled, setEnabled] = useState<boolean>(isNotificationsEnabled);
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );

  const toggle = useCallback(async () => {
    if (!supported) return;
    if (enabled) {
      setNotificationsEnabled(false);
      setEnabled(false);
      return;
    }
    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await requestPermissionSafe();
    setPermission(perm);
    if (perm === "granted") {
      setNotificationsEnabled(true);
      setEnabled(true);
    }
  }, [supported, enabled]);

  return { supported, enabled, permission, toggle };
}
