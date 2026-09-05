/** Shared MIME helpers for course material uploads */

export const RESOURCE_MAX_BYTES = 150 * 1024 * 1024;

export const RESOURCE_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
]);

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
};

export function mimeFromFileName(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? null;
}

/** Prefer browser type, else infer from extension. */
export function resolveResourceMime(fileName: string, browserType?: string | null) {
  const raw = (browserType || "").trim().toLowerCase();
  if (raw && raw !== "application/octet-stream" && RESOURCE_ALLOWED_MIME.has(raw)) {
    return raw;
  }
  const inferred = mimeFromFileName(fileName);
  if (inferred) return inferred;
  if (raw && RESOURCE_ALLOWED_MIME.has(raw)) return raw;
  return null;
}

export function isAllowedResourceMime(mime: string) {
  return RESOURCE_ALLOWED_MIME.has(mime.trim().toLowerCase());
}
