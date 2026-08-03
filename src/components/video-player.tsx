"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";
import Hls from "hls.js";
import { getDeviceFingerprint, getDeviceLabel } from "@/lib/fingerprint";

type Props = {
  lessonId: string;
  compact?: boolean;
  alreadyCompleted?: boolean;
  onCompleted?: () => void;
};

type StartResponse = {
  sessionToken: string;
  watermark: string;
  playback: {
    playbackUrl: string;
    expiresAt: number;
  };
  error?: string;
};

type WmSpot = { x: number; y: number; opacity: number };

function randomSpots(): WmSpot[] {
  return [
    {
      x: 6 + Math.random() * 35,
      y: 8 + Math.random() * 30,
      opacity: 0.22 + Math.random() * 0.12,
    },
    {
      x: 45 + Math.random() * 40,
      y: 40 + Math.random() * 35,
      opacity: 0.18 + Math.random() * 0.14,
    },
    {
      x: 10 + Math.random() * 55,
      y: 55 + Math.random() * 30,
      opacity: 0.16 + Math.random() * 0.12,
    },
  ];
}

export function VideoPlayer({
  lessonId,
  compact = false,
  alreadyCompleted = false,
  onCompleted,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState("");
  const [spots, setSpots] = useState<WmSpot[]>(randomSpots);
  const [blocked, setBlocked] = useState(false);
  const [veiled, setVeiled] = useState(false);
  const [veilReason, setVeilReason] = useState("");
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [watchPercent, setWatchPercent] = useState(alreadyCompleted ? 100 : 0);
  const sessionTokenRef = useRef<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastReportRef = useRef(0);
  const completedRef = useRef(alreadyCompleted);

  const onHeartbeatFail = useEffectEvent((message: string) => {
    setBlocked(true);
    setError(message);
    videoRef.current?.pause();
  });

  const applyVeil = useEffectEvent((on: boolean, reason = "") => {
    setVeiled(on);
    setVeilReason(reason);
    if (on) videoRef.current?.pause();
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

  useEffect(() => {
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let watermarkTimer: ReturnType<typeof setInterval> | undefined;

    async function boot() {
      setError(null);
      setBlocked(false);
      setVeiled(false);
      completedRef.current = alreadyCompleted;
      setCompleted(alreadyCompleted);
      setWatchPercent(alreadyCompleted ? 100 : 0);

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
        if (!cancelled) setError(data.error ?? "ไม่สามารถเริ่มสตรีมได้");
        return;
      }
      if (cancelled) return;

      sessionTokenRef.current = data.sessionToken;
      setWatermark(data.watermark);

      const video = videoRef.current;
      if (!video) return;

      const url = data.playback.playbackUrl;
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

      // store removers on video element dataset via closure cleanup below
      (video as HTMLVideoElement & { __progressCleanup?: () => void }).__progressCleanup =
        () => {
          video.removeEventListener("timeupdate", onTimeUpdate);
          video.removeEventListener("ended", onEnded);
        };

      heartbeatTimer = setInterval(async () => {
        const token = sessionTokenRef.current;
        if (!token) return;
        const hb = await fetch("/api/playback/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: token }),
        });
        if (!hb.ok) {
          const body = await hb.json().catch(() => ({}));
          onHeartbeatFail(
            (body as { error?: string }).error ??
              "เซสชันถูกปิดจากอุปกรณ์อื่น",
          );
        }
      }, 30_000);

      watermarkTimer = setInterval(() => {
        setSpots(randomSpots());
      }, 8_000);
    }

    void boot();

    const syncFocusVeil = () => {
      if (document.hidden) {
        applyVeil(true, "สลับแท็บแล้ว — กดกลับมาเพื่อเรียนต่อ");
        return;
      }
      if (!document.hasFocus()) {
        applyVeil(true, "หน้าต่างไม่ได้โฟกัส — กันแชร์จอแบบง่าย");
        return;
      }
      applyVeil(false);
    };

    const original = navigator.mediaDevices?.getDisplayMedia?.bind(
      navigator.mediaDevices,
    );
    if (navigator.mediaDevices && original) {
      navigator.mediaDevices.getDisplayMedia = async (...args) => {
        applyVeil(true, "ตรวจพบการแชร์หน้าจอ — วิดีโอถูกปิดดำชั่วคราว");
        setError("ตรวจพบการแชร์หน้าจอจากแท็บนี้");
        return original(...args);
      };
    }

    document.addEventListener("visibilitychange", syncFocusVeil);
    window.addEventListener("blur", syncFocusVeil);
    window.addEventListener("focus", syncFocusVeil);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", syncFocusVeil);
      window.removeEventListener("blur", syncFocusVeil);
      window.removeEventListener("focus", syncFocusVeil);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (watermarkTimer) clearInterval(watermarkTimer);
      hlsRef.current?.destroy();
      const video = videoRef.current as
        | (HTMLVideoElement & { __progressCleanup?: () => void })
        | null;
      video?.__progressCleanup?.();
      const token = sessionTokenRef.current;
      if (token) {
        void fetch("/api/playback/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: token }),
          keepalive: true,
        });
      }
      if (navigator.mediaDevices && original) {
        navigator.mediaDevices.getDisplayMedia = original;
      }
    };
  }, [lessonId, alreadyCompleted]);

  const showVeil = veiled || blocked;

  return (
    <div className="player">
      <div
        className={`player__frame ${showVeil ? "player__frame--veiled" : ""}`}
      >
        <video
          ref={videoRef}
          className="player__video"
          controls={!showVeil}
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          playsInline
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => {
            if (veiled || blocked) {
              videoRef.current?.pause();
            }
          }}
        />

        {watermark && !showVeil && (
          <>
            <div className="player__wm-grid" aria-hidden>
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i}>{watermark}</span>
              ))}
            </div>
            {spots.map((s, i) => (
              <div
                key={i}
                className="player__watermark"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  opacity: s.opacity,
                }}
                aria-hidden
              >
                {watermark}
              </div>
            ))}
          </>
        )}

        {showVeil && (
          <div className="player__blackout">
            <p className="player__blackout-title">
              {blocked ? "เซสชันถูกระงับ" : "หน้าจอดำชั่วคราว"}
            </p>
            <p className="player__blackout-desc">
              {blocked
                ? error || "มีการเปิดดูจากที่อื่น"
                : veilReason || "กลับมาโฟกัสที่แท็บนี้เพื่อเรียนต่อ"}
            </p>
            {!blocked && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  applyVeil(false);
                  void videoRef.current?.play().catch(() => undefined);
                }}
              >
                เรียนต่อ
              </button>
            )}
          </div>
        )}
      </div>
      {error && !blocked && <p className="form-error">{error}</p>}
      <p className="player__progress-hint">
        {completed ? (
          <span className="form-ok">ดูครบแล้ว — ปลดล็อกบทถัดไปได้</span>
        ) : (
          <span className="muted">
            ความคืบหน้า {watchPercent}% · ดูถึง 90% เพื่อปลดล็อกบทถัดไป
          </span>
        )}
      </p>
      {!compact && (
        <p className="player__hint">
          ลายน้ำระบุตัวตน · จอดำเมื่อสลับแท็บ/แชร์จอจากเบราว์เซอร์ ·
          ดูได้ทีละเซสชัน · ห้ามแชร์คีย์
        </p>
      )}
    </div>
  );
}
