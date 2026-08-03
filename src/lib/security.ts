import { z } from "zod";

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

function hostAllowed(hostname: string) {
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
  });
