import { z } from "zod";
import { isGoogleDriveHost } from "@/lib/google-drive";
import { isSupabaseStorageHost } from "@/lib/supabase-storage-url";
import { extractYouTubeVideoId, isYouTubeHost } from "@/lib/youtube";

/** Strip obvious HTML/script payloads from admin text fields */
export function sanitizeText(input: string, max = 2000) {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, max);
}

export function sanitizeNullableText(
  input: string | null | undefined,
  max = 2000,
) {
  if (input == null) return null;
  const cleaned = sanitizeText(input, max);
  return cleaned.length ? cleaned : null;
}

function allowedVideoHosts() {
  const raw = process.env.VIDEO_ALLOWED_HOSTS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function allowedCoverImageHosts() {
  const raw = process.env.COVER_IMAGE_ALLOWED_HOSTS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatches(host: string, rule: string) {
  if (rule.includes("*")) {
    const re = new RegExp(
      `^${rule.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`,
      "i",
    );
    return re.test(host);
  }
  return host === rule || host.endsWith(`.${rule}`);
}

export function isPicInThHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "pic.in.th" || host.endsWith(".pic.in.th");
}

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const m = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/** https image URLs that the cover proxy may fetch server-side. */
export function isAllowedCoverImageUrl(value: URL) {
  if (value.protocol !== "https:" || isPrivateOrLocalHost(value.hostname)) {
    return false;
  }

  const configuredSupabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase()
    : null;
  const host = value.hostname.toLowerCase();
  return (
    host === configuredSupabaseHost ||
    isPicInThHost(host) ||
    allowedCoverImageHosts().includes(host)
  );
}

function hostAllowed(hostname: string) {
  // Always allow Google Drive share links for the free Drive player path
  if (isGoogleDriveHost(hostname)) return true;
  if (isYouTubeHost(hostname)) return true;
  // Free image host used for course cover thumbnails
  if (isPicInThHost(hostname)) return true;
  if (isSupabaseStorageHost(hostname)) return true;
  const allowed = allowedVideoHosts();
  if (!allowed || allowed.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowed.some((rule) => hostMatches(host, rule));
}

/** Allow https URLs (optionally host-whitelisted), relative paths, or asset IDs */
export function isSafeVideoRef(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;
  if (extractYouTubeVideoId(v)) return true;
  if (/^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (u.protocol !== "https:") return false;
      return hostAllowed(u.hostname);
    } catch {
      return false;
    }
  }
  if (/^[a-zA-Z0-9_./-]{3,200}$/.test(v) && !v.includes("://")) return true;
  return false;
}

export const httpsUrlSchema = z
  .string()
  .trim()
  .refine((v) => !v || /^https:\/\//i.test(v), {
    message: "ต้องเป็น https:// เท่านั้น",
  })
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && hostAllowed(u.hostname);
    } catch {
      return false;
    }
  }, "URL ไม่ถูกต้องหรือโดเมนไม่อยู่ใน whitelist");

/** Course covers use their own strict allowlist, independent of resource URLs. */
export const coverUrlSchema = z
  .string()
  .trim()
  .refine((v) => !v || /^https:\/\//i.test(v), {
    message: "ต้องเป็น https:// เท่านั้น",
  })
  .refine((v) => {
    if (!v) return true;
    try {
      return isAllowedCoverImageUrl(new URL(v));
    } catch {
      return false;
    }
  }, "URL รูปปกไม่อยู่ใน allowlist");

export const videoRefSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => v == null || v === "" || isSafeVideoRef(v), {
    message:
      "ลิงก์วิดีโอต้องเป็น https:// (โดเมนที่อนุญาต) หรือ asset id ที่ปลอดภัย",
  });

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9\u0e00-\u0e7f]+(?:-[a-z0-9\u0e00-\u0e7f]+)*$/i, {
    message: "slug ไม่ถูกต้อง",
  })
  .transform((v) => v.normalize("NFC"));

/** Compare URL / DB slugs safely (Thai NFC vs NFD, encoded params). */
export function normalizeSlug(input: string) {
  let value = input.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* already decoded */
  }
  return value.normalize("NFC");
}

export function slugsMatch(a: string, b: string) {
  return normalizeSlug(a) === normalizeSlug(b);
}
