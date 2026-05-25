/** Strip MIME parameters (e.g. `audio/webm;codecs=opus` → `audio/webm`). */
export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}
