"use client";

const STORAGE_KEY = "ms_device_fp";

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function getDeviceFingerprint() {
  if (typeof window === "undefined") return "ssr";

  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) return cached;

  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  const fp = `fp_${hashString(parts.join("|"))}_${hashString(
    navigator.userAgent.slice(0, 64),
  )}`;
  localStorage.setItem(STORAGE_KEY, fp);
  return fp;
}

export function getDeviceLabel() {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return "iOS Safari";
  if (/Android/i.test(ua)) return "Android Browser";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Browser";
}
