import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rasterImageType, storageCoverVisibility } from "@/lib/cover-access";
import { isAllowedCoverImageUrl } from "@/lib/security";
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

  const visibility = await storageCoverVisibility(bucket, path);
  if (!visibility || (visibility === "draft" && (await auth())?.user?.role !== "ADMIN")) {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
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

  if (data.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const contentType = rasterImageType(buffer);
  if (!contentType) return NextResponse.json({ error: "Not a supported image" }, { status: 415 });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function streamExternalImage(target: URL) {
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // Never make a second request before validating its destination.
      redirect: "error",
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

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  const length = Number(upstream.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const reader = upstream.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Empty image" }, { status: 502 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  const detectedType = rasterImageType(buffer);
  if (!detectedType) return NextResponse.json({ error: "Not a supported image" }, { status: 415 });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": detectedType,
      "X-Content-Type-Options": "nosniff",
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
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!configured || new URL(raw).hostname !== new URL(configured).hostname) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }
    return streamStorageObject(fromSupabase.bucket, fromSupabase.path);
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return badRequest("Invalid url");
  }

  if (!isAllowedCoverImageUrl(target)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  return streamExternalImage(target);
}
