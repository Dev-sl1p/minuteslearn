"use client";

const STORAGE_KEY = "ms_device_fp";
let fallbackFingerprint: string | undefined;

export function getDeviceFingerprint() {
  if (typeof window === "undefined") return "ssr";
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && /^[a-zA-Z0-9_-]{8,128}$/.test(cached)) return cached;
  } catch { /* Private browsing may disable persistent storage. */ }
  const fingerprint = fallbackFingerprint ??= `fp_${crypto.randomUUID()}`;
  try { localStorage.setItem(STORAGE_KEY, fingerprint); } catch { /* Use this tab's identity. */ }
  return fingerprint;
}

export function getDeviceLabel() {
  if (typeof navigator === "undefined") return "อุปกรณ์";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return "iOS Safari";
  if (/Android/i.test(ua)) return "Android Browser";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return "เบราว์เซอร์";
}
