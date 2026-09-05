/** Extract a Google Drive file id from common share / open URLs */
export function extractGoogleDriveFileId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // Bare file id pasted by admin
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value) && !value.includes("://")) {
    return value;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      !host.endsWith("drive.google.com") &&
      !host.endsWith("docs.google.com")
    ) {
      return null;
    }

    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) return fileMatch[1];

    const openMatch = url.pathname.match(/\/open/);
    if (openMatch) {
      const id = url.searchParams.get("id");
      if (id) return id;
    }

    const ucId = url.searchParams.get("id");
    if (ucId) return ucId;

    return null;
  } catch {
    return null;
  }
}

export function isGoogleDriveRef(input: string) {
  return extractGoogleDriveFileId(input) != null && (
    /drive\.google\.com|docs\.google\.com/i.test(input) ||
    (/^[a-zA-Z0-9_-]{25,}$/.test(input.trim()) && !input.includes("://"))
  );
}

/** Embeddable preview URL for the in-app player iframe (desktop) */
export function googleDrivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/** Direct media URL for native <video> on mobile (public “anyone with link” files) */
export function googleDriveDirectStreamUrl(fileId: string) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
}

/** Open in Drive app / browser tab (mobile fallback) */
export function googleDriveOpenUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function isGoogleDriveHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "drive.google.com" ||
    host.endsWith(".drive.google.com") ||
    host === "docs.google.com" ||
    host.endsWith(".docs.google.com")
  );
}
