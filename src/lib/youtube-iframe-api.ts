let loadPromise: Promise<void> | null = null;

/** One loader per page, with recovery after blocked scripts or lost connections. */
export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined" || window.YT?.Player) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement("script");
    const previousReady = window.onYouTubeIframeAPIReady;
    const ready = () => { try { previousReady?.(); } finally { finish(); } };
    const finish = (error?: Error) => {
      clearInterval(poll);
      clearTimeout(timeout);
      script.removeEventListener("error", failed);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const failed = () => finish(new Error("YouTube could not be loaded"));
    const poll = setInterval(() => { if (window.YT?.Player) finish(); }, 100);
    const timeout = setTimeout(() => finish(new Error("YouTube loading timed out")), 15000);
    script.addEventListener("error", failed, { once: true });
    window.onYouTubeIframeAPIReady = ready;
    if (!existing) {
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => { loadPromise = null; throw error; });
  return loadPromise;
}
