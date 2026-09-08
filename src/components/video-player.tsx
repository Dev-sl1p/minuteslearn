"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { YouTubeHost } from "@/components/youtube-host";
import { getDeviceLabel } from "@/lib/fingerprint";
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
  resumeAt?: number;
  percent?: number;
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
  const onCompletedRef = useRef(onCompleted);
  const resumeAtRef = useRef(0);
  const requestIdRef = useRef<string | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);

  const onHeartbeatFail = useCallback((message: string) => {
    setBlocked(true);
    setError(message);
    videoRef.current?.pause();
  }, []);

  const reportProgress = useCallback(
    async (watchedSec: number, durationSec: number, flush = false) => {
      if (completedRef.current && !flush) return;
      const now = Date.now();
      if (!flush && now - lastReportRef.current < 4000) return;
      lastReportRef.current = now;
      if (!sessionTokenRef.current) return;
      try {
        const res = await fetch("/api/progress", {
          method: "POST",
          signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            watchedSec,
            durationSec,
            sessionToken: sessionTokenRef.current,
          }),
        });
        if (!res.ok) {
          if ([401, 403, 409].includes(res.status)) onHeartbeatFail("สิทธิ์หรือเซสชันนี้สิ้นสุดแล้ว กรุณาเปิดบทเรียนใหม่");
          return;
        }
        const data = (await res.json()) as {
          completed?: boolean;
          percent?: number;
        };
        if (typeof data.percent === "number") {
          setWatchPercent(Math.floor(data.percent));
        }
        if (data.completed && !completedRef.current) {
          completedRef.current = true;
          setCompleted(true);
          setWatchPercent(100);
          onCompletedRef.current?.();
        }
      } catch {
        // Heartbeat handles a lost connection; progress retries on the next tick.
      }
    },
    [lessonId, onHeartbeatFail],
  );

  const attachProgressListeners = useCallback((video: HTMLVideoElement) => {
    const onTimeUpdate = () => {
      const v = videoRef.current;
      if (!v || !v.duration || !Number.isFinite(v.duration)) return;
      void reportProgress(v.currentTime, v.duration);
    };
    const onEnded = () => {
      const v = videoRef.current;
      const dur = v?.duration && Number.isFinite(v.duration) ? v.duration : 1;
      const watched = v?.currentTime ?? dur;
      void reportProgress(watched, dur, true);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    const restorePosition = () => {
      if (resumeAtRef.current > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(resumeAtRef.current, Math.max(0, video.duration - 1));
      }
    };
    video.addEventListener("loadedmetadata", restorePosition, { once: true });
    (
      video as HTMLVideoElement & { __progressCleanup?: () => void }
    ).__progressCleanup = () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadedmetadata", restorePosition);
    };
  }, [reportProgress]);

  const handleYouTubeProgress = useCallback(
    (current: number, duration: number, ended: boolean) => {
      if (!duration || !Number.isFinite(duration) || duration <= 0) return;
      // YouTube getDuration() can be tiny in the first seconds — do not
      // treat that as 90% complete or the parent remounts the player.
      void reportProgress(
        current,
        duration,
        ended,
      );
    },
    [reportProgress],
  );

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    const videoAtStart = videoRef.current;

    async function beat() {
      const token = sessionTokenRef.current;
      if (!token) return;
      try {
        const hb = await fetch("/api/playback/heartbeat", {
          method: "POST",
          signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: token }),
        });
        if (cancelled || hb.ok) return;
        const body = (await hb.json().catch(() => ({}))) as {
          reason?: string;
          error?: string;
        };
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        onHeartbeatFail(body.error ?? "เซสชันนี้สิ้นสุดแล้ว กรุณากดเล่นต่ออีกครั้ง");
      } catch {
        if (!cancelled) {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          onHeartbeatFail("ขาดการเชื่อมต่อ ตรวจสอบอินเทอร์เน็ตแล้วกดเล่นต่อ");
        }
      }
    }

    async function startHeartbeat() {
      heartbeatTimer = setInterval(() => {
        void beat();
      }, 30_000);
    }

    async function boot() {
      requestIdRef.current ??= crypto.randomUUID();
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
          signal: AbortSignal.timeout(20000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            requestId: requestIdRef.current,
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
        resumeAtRef.current = Math.max(0, data.resumeAt ?? 0);
        setResumeAt(resumeAtRef.current);
        setWatchPercent(Math.floor(data.percent ?? 0));
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
      const video = videoAtStart as
        | (HTMLVideoElement & { __progressCleanup?: () => void })
        | null;
      video?.__progressCleanup?.();
    };
  }, [attachProgressListeners, lessonId, onHeartbeatFail, toast, attempt]);

  async function markDriveComplete() {
    setMarkingDone(true);
    try {
      await reportProgress(1, 1, true);
    } finally { setMarkingDone(false); }
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
            startSeconds={resumeAt}
            paused={blocked}
            onReady={() => setBooting(false)}
            onProgress={handleYouTubeProgress}
            onError={() => {
              setBooting(false);
              setError(
                "วิดีโอนี้ยังเล่นไม่ได้ ลองใหม่อีกครั้งหรือติดต่อผู้ดูแลคอร์ส",
              );
            }}
          />
        ) : isDriveIframe && driveUrl ? (
          <>
            <iframe
              className="player__video player__drive"
              src={blocked ? "about:blank" : driveUrl}
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
            controlsList="nodownload"
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
            <p className="player__blackout-title">มีการเล่นจากหน้าต่างหรืออุปกรณ์อื่น</p>
            <p className="player__blackout-desc">
              {error || "เปิดดูได้ทีละหนึ่งหน้าต่างหรือเครื่องเดียวในเวลาเดียวกัน"}
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

      {error && !blocked && (
        <div className="player__error-box">
          <p className="form-error">{error}</p>
          {error.includes("อุปกรณ์") && (
            <a
              href="/devices"
              target="_blank"
              rel="noreferrer"
              className="btn btn--ghost"
              style={{ marginTop: "0.5rem", display: "inline-flex" }}
            >
              ไปหน้าจัดการอุปกรณ์ ↗
            </a>
          )}
        </div>
      )}
      {error && !booting && (
        <button className="btn btn--primary" type="button" onClick={() => { requestIdRef.current = crypto.randomUUID(); setAttempt((value) => value + 1); }}>
          {blocked ? "สลับมาดูเครื่องนี้" : "ลองโหลดวิดีโออีกครั้ง"}
        </button>
      )}
      <p className="player__progress-hint" data-testid="lesson-progress">
        {completed ? (
          <span className="form-ok">ผ่านบทเรียนแล้ว · ปลดล็อกบทถัดไปแล้ว</span>
        ) : isYouTube ? (
          <span className="muted">
            ความคืบหน้า {watchPercent}% · ครบ 90% เพื่อปลดล็อกบทถัดไป
          </span>
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
            ? "เปิดเรียนได้ครั้งละหนึ่งหน้าต่าง · กรุณาเก็บคีย์ไว้เป็นส่วนตัว"
            : isDrive
              ? "คลิปจาก Google Drive — ตั้งแชร์เป็น “Anyone with the link” · ดูได้ทีละเครื่อง · ห้ามแชร์คีย์"
              : "ดูได้ทีละเครื่อง · ห้ามแชร์คีย์"}
        </p>
      )}
    </div>
  );
}
