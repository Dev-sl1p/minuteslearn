import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export {
  RESOURCE_ALLOWED_MIME,
  RESOURCE_MAX_BYTES,
  isAllowedResourceMime,
  mimeFromFileName,
  resolveResourceMime,
} from "@/lib/resource-mime";

let client: SupabaseClient | null = null;

export function supabaseStorageConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "ยังไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function storageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "course-materials";
}

export function safeStorageFileName(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[^\w.\u0e00-\u0e7f-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}
