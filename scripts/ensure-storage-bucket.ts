/**
 * Create (or update) the private course-materials bucket in Supabase Storage.
 *
 * Usage:
 *   npm run storage:ensure-bucket
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { RESOURCE_ALLOWED_MIME } from "../src/lib/resource-mime";

loadEnvConfig(process.cwd());

const ALLOWED = [...RESOURCE_ALLOWED_MIME];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || "course-materials";

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const options = {
    public: false,
    fileSizeLimit: 150 * 1024 * 1024,
    allowedMimeTypes: ALLOWED,
  };

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("listBuckets failed:", listError.message);
    process.exit(1);
  }

  const exists = buckets?.some((b) => b.name === bucket);
  if (!exists) {
    const { data, error } = await supabase.storage.createBucket(bucket, options);
    if (error) {
      console.error("createBucket failed:", error.message);
      process.exit(1);
    }
    console.log(`Created private bucket: ${data?.name ?? bucket}`);
    return;
  }

  const { error } = await supabase.storage.updateBucket(bucket, options);
  if (error) {
    console.error("updateBucket failed:", error.message);
    process.exit(1);
  }
  console.log(`Updated bucket MIME allowlist: ${bucket}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
