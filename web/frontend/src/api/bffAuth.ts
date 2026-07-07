export const BFF_AUTH_STORAGE_KEY = "custom-chat:bff-auth-token";

export function bffAuthToken(): string {
  const envToken = (import.meta.env.VITE_WEB_AUTH_TOKEN ?? "").trim();
  if (envToken) return envToken;
  try {
    return window.localStorage.getItem(BFF_AUTH_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function bffAuthHeaders(token = bffAuthToken()): Record<string, string> {
  const trimmed = token.trim();
  return trimmed ? { Authorization: `Bearer ${trimmed}` } : {};
}

export function appendBffAuthQuery(url: string, token = bffAuthToken()): string {
  const trimmed = token.trim();
  if (!trimmed) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}auth_token=${encodeURIComponent(trimmed).replace(/%20/g, "+")}`;
}
