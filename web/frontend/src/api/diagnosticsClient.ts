import { bffAuthHeaders } from "./bffAuth";

const DIAGNOSTICS_ENDPOINT = "/api/v1/diagnostics";

export type UpstreamStatus = "ok" | "unreachable" | "unauthorized" | "closed" | "error";

export interface UpstreamDiagnostics {
  status: UpstreamStatus;
  target: string;
  error?: string;
}

export interface ConnectionDiagnostics {
  bff: "ok";
  upstream: UpstreamDiagnostics;
}

export async function fetchDiagnostics(): Promise<ConnectionDiagnostics | null> {
  try {
    const res = await fetch(DIAGNOSTICS_ENDPOINT, {
      method: "GET",
      headers: { ...bffAuthHeaders(), Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as ConnectionDiagnostics;
  } catch {
    return null;
  }
}
