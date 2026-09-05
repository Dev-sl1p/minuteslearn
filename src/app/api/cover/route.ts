import { NextResponse } from "next/server";
import { isCoverFetchUrl } from "@/lib/security";
import {
  getSupabaseAdmin,
  storageBucket,
  supabaseStorageConfigured,
} from "@/lib/supabase-admin";
import { parseSupabaseStorageObject } from "@/lib/supabase-storage-url";

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_MS = 12_000;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isSafeStoragePath(path: string) {
  return Boolean(path) && !path.includes("..") && !path.startsWith("/");
}

async function streamStorageObject(bucket: string, path: string) {
  const allowedBucket = storageBucket();
  if (bucket !== allowedBucket || !isSafeStoragePath(path)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }
  if (!supabaseStorageConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .download(path);

  if (error || !data) {
    return NextResponse.json(
      { error: "ไม่พบรูปใน Storage" },
      { status: 404 },
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const contentType =
    data.type && data.type.startsWith("image/") ? data.type : "image/jpeg";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

async function streamExternalImage(target: URL) {
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_MS),
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: `${target.origin}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Upstream blocked" },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  let finalUrl: URL;
  try {
    finalUrl = new URL(upstream.url);
  } catch {
    return NextResponse.json({ error: "Redirect not allowed" }, { status: 403 });
  }
  if (!isCoverFetchUrl(finalUrl)) {
    return NextResponse.json({ error: "Redirect not allowed" }, { status: 403 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  const length = Number(upstream.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const storagePath = params.get("path")?.trim() ?? "";
  const storageBucketName = params.get("bucket")?.trim() || storageBucket();
  if (storagePath) {
    return streamStorageObject(storageBucketName, storagePath);
  }

  const raw = params.get("url")?.trim() ?? "";
  if (!raw || raw.length > 4000) return badRequest("Invalid url");

  const fromSupabase = parseSupabaseStorageObject(raw);
  if (fromSupabase) {
    return streamStorageObject(fromSupabase.bucket, fromSupabase.path);
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return badRequest("Invalid url");
  }

  if (!isCoverFetchUrl(target)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  return streamExternalImage(target);
}
