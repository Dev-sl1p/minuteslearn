"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";
import Hls from "hls.js";
import { Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { YouTubeHost } from "@/components/youtube-host";
import { getDeviceFingerprint, getDeviceLabel } from "@/lib/fingerprint";
import {
  extractGoogleDriveFileId,
  googleDriveDirectStreamUrl,
  googleDriveOpenUrl,
} from "@/lib/google-drive";

type Props = {
  lessonId: string;
  compact?: boolean;
  alreadyCompleted?: boolean;
  onCompleted?: () => void;
};

type StartResponse = {
  sessionToken: string;
  playback: {
    provider?: string;
    playbackUrl: string;
    expiresAt: number;
  };
  error?: string;
};

function preferNativeDrivePlayer() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 899px)").matches
  );
}

export function VideoPlayer({
  lessonId,
  compact = false,
  alreadyCompleted = false,
  onCompleted,
}: Props) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [watchPercent, setWatchPercent] = useState(alreadyCompleted ? 100 : 0);
  const [provider, setProvider] = useState<string>("");
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [driveNativeFailed, setDriveNativeFailed] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [markingDone, setMarkingDone] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastReportRef = useRef(0);
  const completedRef = useRef(alreadyCompleted);

  const onHeartbeatFail = useEffectEvent((message: string) => {
    setBlocked(true);
    setError(message);
    videoRef.current?.pause();
  });

  const renewPlaybackToken = useEffectEvent(async () => {
    const res = await fetch("/api/playback/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonId,
        fingerprint: getDeviceFingerprint(),
        label: getDeviceLabel(),
      }),
    });
    const data = (await res.json()) as StartResponse;
    if (!res.ok || !data.sessionToken) return false;
    sessionTokenRef.current = data.sessionToken;
    return true;
  });

  const reportProgress = useEffectEvent(
    async (watchedSec: number, durationSec: number, forceComplete = false) => {
      if (completedRef.current && !forceComplete) return;
      const now = Date.now();
      if (!forceComplete && now - lastReportRef.current < 4000) return;
      lastReportRef.current = now;

      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          watchedSec,
          durationSec,
          forceComplete,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        completed?: boolean;
        percent?: number;
      };
      if (typeof data.percent === "number") {
        setWatchPercent(Math.round(data.percent));
      }
      if (data.completed && !completedRef.current) {
        completedRef.current = true;
        setCompleted(true);
        setWatchPercent(100);
        onCompleted?.();
      }
    },
  );

  const attachProgressListeners = useEffectEvent((video: HTMLVideoElement) => {
    const onTimeUpdate = () => {
      const v = videoRef.current;
      if (!v || !v.duration || !Number.isFinite(v.duration)) return;
      const pct = (v.currentTime / v.duration) * 100;
      setWatchPercent(Math.min(100, Math.round(pct)));
      void reportProgress(v.currentTime, v.duration, pct >= 90);
    };
    const onEnded = () => {
      const v = videoRef.current;
      const dur = v?.duration && Number.isFinite(v.duration) ? v.duration : 1;
      const watched = v?.currentTime ?? dur;
      void reportProgress(watched, dur, true);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    (
      video as HTMLVideoElement & { __progressCleanup?: () => void }
    ).__progressCleanup = () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  });

  const handleYouTubeProgress = useEffectEvent(
    (current: number, duration: number, ended: boolean) => {
      if (!duration || !Number.isFinite(duration) || duration <= 0) return;
      const pct = (current / duration) * 100;
      setWatchPercent(Math.min(100, Math.round(pct)));
      // YouTube getDuration() can be tiny in the first seconds — do not
      // treat that as 90% complete or the parent remounts the player.
      const durationLooksReal = duration >= 15;
      void reportProgress(
        current,
        duration,
        ended || (durationLooksReal && pct >= 90),
      );
    },
  );

  useEffect(() => {
    completedRef.current = alreadyCompleted;
    if (alreadyCompleted) {
      setCompleted(true);
      setWatchPercent(100);
    }
  }, [alreadyCompleted]);

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    async function beat() {
      const token = sessionTokenRef.current;
      if (!token) return;
      const hb = await fetch("/api/playback/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: token }),
      });
      if (hb.ok) return;
      const body = (await hb.json().catch(() => ({}))) as {
        reason?: string;
        error?: string;
      };
      if (body.reason === "SUPERSEDED") {
        onHeartbeatFail(
          body.error ?? "เซสชันถูกปิดจากอุปกรณ์อื่น",
        );
        return;
      }
      await renewPlaybackToken();
    }

    async function startHeartbeat() {
      heartbeatTimer = setInterval(() => {
        void beat();
      }, 30_000);
    }

    async function boot() {
      setError(null);
      setBooting(true);
      setBlocked(false);
      setDriveUrl(null);
      setDriveFileId(null);
      setDriveNativeFailed(false);
      setYoutubeVideoId(null);
      setProvider("");
      setCompleted(completedRef.current);
      setWatchPercent(completedRef.current ? 100 : 0);

      let deferBootingOff = false;

      try {
        const res = await fetch("/api/playback/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            fingerprint: getDeviceFingerprint(),
            label: getDeviceLabel(),
          }),
        });
        const data = (await res.json()) as StartResponse;
        if (!res.ok) {
          if (!cancelled) {
            const msg = data.error ?? "ไม่สามารถเริ่มสตรีมได้";
            setError(msg);
            toast.error("เล่นวิดีโอไม่ได้", msg);
          }
          return;
        }
        if (cancelled) return;

        sessionTokenRef.current = data.sessionToken;
        setProvider(data.playback.provider ?? "");
        const url = data.playback.playbackUrl;

        if (data.playback.provider === "youtube") {
          deferBootingOff = true;
          setYoutubeVideoId(url);
          await startHeartbeat();
          return;
        }

        if (data.playback.provider === "drive") {
          const fileId =
            extractGoogleDriveFileId(url) ??
            extractGoogleDriveFileId(url.replace("/preview", "/view"));
          setDriveFileId(fileId);

          // Mobile / touch: Drive iframe often cannot start — use native video.
          if (preferNativeDrivePlayer() && fileId) {
            setProvider("drive-native");
            const video = videoRef.current;
            if (!video) {
              if (!cancelled) setError("ไม่พบเครื่องเล่นวิดีโอ");
              return;
            }
            video.src = googleDriveDirectStreamUrl(fileId);
            attachProgressListeners(video);
            await startHeartbeat();
            return;
          }

          setDriveUrl(url);
          await startHeartbeat();
          return;
        }

        const video = videoRef.current;
        if (!video) {
          if (!cancelled) setError("ไม่พบเครื่องเล่นวิดีโอ");
          return;
        }

        const isHls =
          /\.m3u8(\?|$)/i.test(url) ||
          url.includes("application/vnd.apple.mpegurl");

        if (isHls) {
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
            });
            hlsRef.current = hls;
            hls.loadSource(url);
            hls.attachMedia(video);
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
          } else {
            setError("เบราว์เซอร์นี้ไม่รองรับ HLS");
            return;
          }
        } else {
          video.src = url;
        }

        attachProgressListeners(video);
        await startHeartbeat();
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("โหลดวิดีโอไม่สำเร็จ");
          toast.error("โหลดวิดีโอไม่สำเร็จ");
        }
      } finally {
        if (!cancelled && !deferBootingOff) setBooting(false);
      }
    }

    void boot();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void beat();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const video = videoRef.current as
        | (HTMLVideoElement & { __progressCleanup?: () => void })
        | null;
      video?.__progressCleanup?.();
    };
  }, [lessonId]);

  async function markDriveComplete() {
    setMarkingDone(true);
    await reportProgress(1, 1, true);
    setMarkingDone(false);
    toast.ok("บันทึกว่าดูจบแล้ว");
  }

  const isYouTube = provider === "youtube" && Boolean(youtubeVideoId);
  const isDriveIframe = provider === "drive" || Boolean(driveUrl);
  const isDriveNative = provider === "drive-native";
  const isDrive = isDriveIframe || isDriveNative || Boolean(driveFileId);
  const openDriveHref = driveFileId ? googleDriveOpenUrl(driveFileId) : null;

  return (
    <div className="player">
      <div className={`player__frame ${blocked ? "player__frame--veiled" : ""}`}>
        {booting && (
          <div className="player__loading">
            <Spinner size="lg" label="กำลังโหลดวิดีโอ..." />
          </div>
        )}
        {isYouTube && youtubeVideoId ? (
          <YouTubeHost
            videoId={youtubeVideoId}
            paused={blocked}
            onReady={() => setBooting(false)}
            onProgress={handleYouTubeProgress}
            onError={() => {
              setBooting(false);
              setError(
                "เล่นวิดีโอ YouTube ไม่ได้ — ตรวจสอบว่าตั้ง Unlisted และอนุญาตฝังบนโดเมนนี้",
              );
            }}
          />
        ) : isDriveIframe && driveUrl ? (
          <>
            <iframe
              className="player__video player__drive"
              src={driveUrl}
              title="Google Drive video"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            {!blocked && (
              <div className="player__drive-popout-mask" aria-hidden title="" />
            )}
          </>
        ) : (
          <video
            ref={videoRef}
            className="player__video"
            controls={!blocked}
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            playsInline
            preload="metadata"
            onContextMenu={(e) => e.preventDefault()}
            onPlay={() => {
              if (blocked) videoRef.current?.pause();
            }}
            onError={() => {
              if (isDriveNative) {
                setDriveNativeFailed(true);
                setError(
                  "เล่นบนมือถือผ่าน Drive โดยตรงไม่สำเร็จ — เปิดใน Drive แทนได้",
                );
              }
            }}
          />
        )}

        {blocked && (
          <div className="player__blackout">
            <p className="player__blackout-title">เซสชันถูกระงับ</p>
            <p className="player__blackout-desc">
              {error || "มีการเปิดดูจากที่อื่น"}
            </p>
          </div>
        )}
      </div>

      {isDriveNative && driveNativeFailed && openDriveHref && (
        <a
          className="btn btn--primary"
          href={openDriveHref}
          target="_blank"
          rel="noreferrer"
          style={{ marginTop: "0.75rem" }}
        >
          เปิดเล่นใน Google Drive
        </a>
      )}

      {error && !blocked && <p className="form-error">{error}</p>}
      <p className="player__progress-hint">
        {completed ? (
          <span className="form-ok">ดูครบแล้ว — ปลดล็อกบทถัดไปได้</span>
        ) : isDriveIframe ? (
          <span className="muted">
            โหมด Google Drive — กดปุ่มด้านล่างเมื่อดูจบเพื่อปลดล็อกบทถัดไป
          </span>
        ) : isDriveNative ? (
          <span className="muted">
            {driveNativeFailed
              ? "เปิดใน Drive แล้วกลับมากดปุ่มด้านล่างเมื่อดูจบ"
              : `ความคืบหน้า ${watchPercent}% · ดูถึง 90% เพื่อปลดล็อกบทถัดไป`}
          </span>
        ) : (
          <span className="muted">
            ความคืบหน้า {watchPercent}% · ดูถึง 90% เพื่อปลดล็อกบทถัดไป
          </span>
        )}
      </p>
      {isDrive && !completed && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={markingDone || blocked}
          onClick={() => void markDriveComplete()}
        >
          {markingDone ? "กำลังบันทึก..." : "ดูจบแล้ว — ปลดล็อกบทถัดไป"}
        </button>
      )}
      {isDriveNative && !driveNativeFailed && !completed && (
        <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
          ถ้ากดเล่นไม่ได้{" "}
          {openDriveHref ? (
            <a href={openDriveHref} target="_blank" rel="noreferrer">
              เปิดใน Google Drive
            </a>
          ) : null}
        </p>
      )}
      {!compact && (
        <p className="player__hint">
          {isYouTube
            ? "คลิปจาก YouTube (Unlisted) — ตั้งอนุญาตฝังบนโดเมนนี้ · ดูได้ทีละเครื่อง · ห้ามแชร์คีย์"
            : isDrive
              ? "คลิปจาก Google Drive — ตั้งแชร์เป็น “Anyone with the link” · ดูได้ทีละเครื่อง · ห้ามแชร์คีย์"
              : "ดูได้ทีละเครื่อง · ห้ามแชร์คีย์"}
        </p>
      )}
    </div>
  );
}
