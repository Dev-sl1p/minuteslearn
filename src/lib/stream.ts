import { SignJWT, importPKCS8 } from "jose";
import { isProductionRuntime } from "@/lib/env";
import {
  extractGoogleDriveFileId,
  googleDrivePreviewUrl,
} from "@/lib/google-drive";
import { extractYouTubeVideoId } from "@/lib/youtube";

export type StreamPlayback = {
  provider: "mux" | "cloudflare" | "mock" | "direct" | "drive" | "youtube";
  playbackUrl: string;
  token?: string;
  expiresAt: number;
};

export class PlaybackConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybackConfigError";
  }
}

function ttlSeconds() {
  return Number(process.env.STREAM_TOKEN_TTL_SECONDS ?? "120");
}

async function signInternalToken(payload: {
  userId: string;
  lessonId: string;
  assetId: string;
}) {
  const secretRaw = process.env.STREAM_TOKEN_SECRET;
  if (!secretRaw && isProductionRuntime()) {
    throw new PlaybackConfigError("STREAM_TOKEN_SECRET is not configured");
  }
  const secret = new TextEncoder().encode(
    secretRaw ?? "dev-stream-secret",
  );
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds();
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
  return { token, expiresAt: exp };
}

function isDirectUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function looksLikeMuxPlaybackId(value: string) {
  return /^[a-zA-Z0-9]{6,}$/.test(value);
}

async function createMuxPlayback(
  playbackId: string,
  expiresAt: number,
): Promise<StreamPlayback> {
  const keyId = process.env.MUX_SIGNING_KEY_ID?.trim();
  const privateKeyPem = (process.env.MUX_SIGNING_PRIVATE_KEY ?? "")
    .trim()
    .replace(/\\n/g, "\n");

  if (keyId && privateKeyPem) {
    const key = await importPKCS8(privateKeyPem, "RS256");
    const muxToken = await new SignJWT({
      sub: playbackId,
      aud: "v",
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: keyId,
      })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(key);

    return {
      provider: "mux",
      playbackUrl: `https://stream.mux.com/${playbackId}.m3u8?token=${muxToken}`,
      token: muxToken,
      expiresAt,
    };
  }

  return {
    provider: "mux",
    playbackUrl: `https://stream.mux.com/${playbackId}.m3u8`,
    expiresAt,
  };
}

export async function createPlaybackToken(input: {
  userId: string;
  lessonId: string;
  assetId: string;
}): Promise<StreamPlayback> {
  const provider = (process.env.VIDEO_PROVIDER ?? "youtube").toLowerCase();
  const asset = input.assetId.trim();
  // YouTube authorizes at the application endpoint. An internal JWT neither
  // protects a YouTube URL nor needs STREAM_TOKEN_SECRET/Mux credentials.
  const youtubeId = extractYouTubeVideoId(asset);
  if (youtubeId) return { provider: "youtube", playbackUrl: youtubeId, expiresAt: 0 };
  if (provider === "youtube") throw new PlaybackConfigError("กรุณาใส่ลิงก์หรือรหัสวิดีโอ YouTube ที่ถูกต้อง");
  const { token, expiresAt } = await signInternalToken(input);

  if (!asset || asset === "demo") {
    throw new PlaybackConfigError("บทเรียนนี้ยังไม่มีวิดีโอ");
  }

  const driveId = extractGoogleDriveFileId(asset);
  // Any resolvable Google Drive link / file id plays via Drive embed
  if (driveId) {
    return {
      provider: "drive",
      playbackUrl: googleDrivePreviewUrl(driveId),
      token,
      expiresAt,
    };
  }

  if (asset && isDirectUrl(asset)) {
    return {
      provider: "direct",
      playbackUrl: asset,
      token,
      expiresAt,
    };
  }

  if (provider === "mux" && asset && looksLikeMuxPlaybackId(asset)) {
    const mux = await createMuxPlayback(asset, expiresAt);
    return { ...mux, token: mux.token ?? token };
  }

  if (
    provider === "cloudflare" &&
    process.env.CF_STREAM_CUSTOMER_SUBDOMAIN &&
    asset
  ) {
    const sub = process.env.CF_STREAM_CUSTOMER_SUBDOMAIN;
    return {
      provider: "cloudflare",
      playbackUrl: `https://${sub}/${asset}/manifest/video.m3u8`,
      token,
      expiresAt,
    };
  }

  // Demo HLS only outside production
  if (!isProductionRuntime()) {
    return {
      provider: "mock",
      playbackUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      token,
      expiresAt,
    };
  }

  throw new PlaybackConfigError("ไม่สามารถสร้างลิงก์เล่นวิดีโอได้");
}
