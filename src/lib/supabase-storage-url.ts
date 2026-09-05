export function isSupabaseStorageHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "supabase.co" || host.endsWith(".supabase.co");
}

/** Parse public/sign/authenticated object URLs into bucket + path (token ignored). */
export function parseSupabaseStorageObject(
  input: string,
): { bucket: string; path: string } | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || !isSupabaseStorageHost(url.hostname)) {
      return null;
    }
    const match = url.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
    );
    if (!match?.[1] || !match[2]) return null;
    const path = decodeURIComponent(match[2]);
    if (!path || path.includes("..")) return null;
    return { bucket: decodeURIComponent(match[1]), path };
  } catch {
    return null;
  }
}
