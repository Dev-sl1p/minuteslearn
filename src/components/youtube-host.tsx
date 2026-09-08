"use client";

import { memo, useEffect, useRef } from "react";
import { loadYouTubeIframeApi } from "@/lib/youtube-iframe-api";

type Props = {
  videoId: string;
  startSeconds?: number;
  paused?: boolean;
  onReady?: () => void;
  onProgress?: (current: number, duration: number, ended: boolean) => void;
  onError?: () => void;
};

function YouTubeHostInner({
  videoId,
  startSeconds = 0,
  paused = false,
  onReady,
  onProgress,
  onError,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const onReadyRef = useRef(onReady);
  const onProgressRef = useRef(onProgress);
  const onErrorRef = useRef(onError);
  const pausedRef = useRef(paused);

  useEffect(() => {
    onReadyRef.current = onReady;
    onProgressRef.current = onProgress;
    onErrorRef.current = onError;
    pausedRef.current = paused;
  }, [onError, onProgress, onReady, paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    host.appendChild(mount);

    let cancelled = false;
    let progressTimer: ReturnType<typeof setInterval> | undefined;

    function readPosition() {
      const player = playerRef.current;
      if (!player?.getCurrentTime || !player.getDuration) return null;
      const current = player.getCurrentTime();
      const duration = player.getDuration();
      if (!Number.isFinite(current) || current < 0 || !Number.isFinite(duration) || duration <= 0) return null;
      return { current: Math.min(current, duration), duration };
    }

    function report(ended = false) {
      const position = readPosition();
      if (!position) return;
      onProgressRef.current?.(position.current, position.duration, ended);
    }

    function stopPolling() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = undefined;
      }
    }

    function startPolling() {
      stopPolling();
      progressTimer = setInterval(() => report(false), 2000);
    }

    void loadYouTubeIframeApi()
      .then(() => {
        if (cancelled) return;
        const player = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
            start: Math.floor(startSeconds),
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              if (pausedRef.current) player.pauseVideo();
              onReadyRef.current?.();
            },
            onStateChange: (event) => {
              if (cancelled) return;
              if (event.data === YT.PlayerState.PLAYING) {
                if (pausedRef.current) { player.pauseVideo(); return; }
                startPolling();
                return;
              }
              if (
                event.data === YT.PlayerState.PAUSED ||
                event.data === YT.PlayerState.BUFFERING
              ) {
                stopPolling();
                report(false);
                return;
              }
              if (event.data === YT.PlayerState.ENDED) {
                stopPolling();
                report(true);
              }
            },
            onError: () => {
              if (cancelled) return;
              stopPolling();
              onErrorRef.current?.();
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      stopPolling();
      playerRef.current?.destroy?.();
      playerRef.current = null;
      mount.remove();
    };
  }, [videoId, startSeconds]);

  useEffect(() => {
    if (paused) playerRef.current?.pauseVideo();
  }, [paused]);

  return <div ref={hostRef} className="player__video player__youtube" />;
}

export const YouTubeHost = memo(YouTubeHostInner);
