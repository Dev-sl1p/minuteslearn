function isYouTubeHostName(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube.com") ||
    host.endsWith(".youtube-nocookie.com")
  );
}

function youtubeIdFromPath(segment: string | undefined) {
  const id = segment?.split("/")[0];
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Extract a YouTube video id from common watch / share / embed URLs */
export function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be") {
      return youtubeIdFromPath(url.pathname.slice(1));
    }

    if (isYouTubeHostName(host)) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;

      const pathId = url.pathname.match(
        /\/(?:embed|shorts|live|v)\/([^/?]+)/,
      );
      if (pathId?.[1]) return youtubeIdFromPath(pathId[1]);
    }

    return null;
  } catch {
    if (/^[\w-]{11}$/.test(value)) return value;
    return null;
  }
}

export function isYouTubeHost(hostname: string) {
  return isYouTubeHostName(hostname);
}

export function isYouTubeRef(input: string) {
  if (extractYouTubeVideoId(input)) return true;
  return /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(input.trim());
}

/** Privacy-enhanced embed URL (used only if plain iframe is needed) */
export function youtubeNoCookieEmbedUrl(videoId: string, origin?: string) {
  const params = new URLSearchParams({
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
    enablejsapi: "1",
  });
  if (origin) params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params}`;
}
