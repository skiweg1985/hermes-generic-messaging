export interface UploadResult {
  file_id: string;
  url: string;
  mime_type: string;
  size_bytes: number;
}

export async function uploadAudio(file: Blob, filename: string): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch("/api/v1/media/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = (body as { detail?: { code?: string } })?.detail?.code ?? "UPLOAD_FAILED";
    const message =
      (body as { detail?: { message?: string } })?.detail?.message ?? res.statusText;
    throw new Error(`${code}: ${message}`);
  }
  return res.json() as Promise<UploadResult>;
}
