"use client";

const STORAGE_KEY = "ms_device_fp";
let fallbackFingerprint: string | undefined;

function getCookieFp(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ms_device_fp=([^;]+)/);
  if (match && /^[a-zA-Z0-9_-]{8,128}$/.test(match[1])) return match[1];
  return null;
}

function setCookieFp(val: string) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `ms_device_fp=${val}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* ignore cookie write errors */
  }
}

export function getDeviceFingerprint() {
  if (typeof window === "undefined") return "ssr";
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* Private browsing or strict security may disable localStorage. */
  }

  const cookieFp = getCookieFp();

  // If localStorage has valid fingerprint, sync to cookie
  if (cached && /^[a-zA-Z0-9_-]{8,128}$/.test(cached)) {
    if (cookieFp !== cached) setCookieFp(cached);
    return cached;
  }

  // If localStorage was cleared (e.g. Safari 7-day ITP reset), restore from cookie
  if (cookieFp) {
    try {
      localStorage.setItem(STORAGE_KEY, cookieFp);
    } catch {
      /* ignore */
    }
    return cookieFp;
  }

  // Generate new fingerprint and persist to both
  const fingerprint = fallbackFingerprint ??= `fp_${crypto.randomUUID()}`;
  try {
    localStorage.setItem(STORAGE_KEY, fingerprint);
  } catch {
    /* Use this tab's identity. */
  }
  setCookieFp(fingerprint);
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
