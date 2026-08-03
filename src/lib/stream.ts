import { SignJWT, importPKCS8 } from "jose";

export type StreamPlayback = {
  provider: "mux" | "cloudflare" | "mock" | "direct";
  playbackUrl: string;
  token?: string;
  expiresAt: number;
};

function ttlSeconds() {
  return Number(process.env.STREAM_TOKEN_TTL_SECONDS ?? "120");
}

async function signInternalToken(payload: {
  userId: string;
  lessonId: string;
  assetId: string;
}) {
  const secret = new TextEncoder().encode(
    process.env.STREAM_TOKEN_SECRET ?? "dev-stream-secret",
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

export async function createPlaybackToken(input: {
  userId: string;
  lessonId: string;
  assetId: string;
}): Promise<StreamPlayback> {
  const provider = (process.env.VIDEO_PROVIDER ?? "mock").toLowerCase();
  const { token, expiresAt } = await signInternalToken(input);
  const asset = input.assetId.trim();

  // Admin can paste a full HLS/MP4 URL into streamAssetId
  if (asset && isDirectUrl(asset)) {
    return {
      provider: "direct",
      playbackUrl: asset,
      token,
      expiresAt,
    };
  }

  if (provider === "mux" && process.env.MUX_SIGNING_KEY_ID && asset) {
    const playbackId = asset;
    const privateKeyPem = (process.env.MUX_SIGNING_PRIVATE_KEY ?? "").replace(
      /\\n/g,
      "\n",
    );
    const key = await importPKCS8(privateKeyPem, "RS256");
    const muxToken = await new SignJWT({
      sub: playbackId,
      aud: "v",
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: process.env.MUX_SIGNING_KEY_ID,
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

  // Fallback demo stream when no URL/asset configured
  return {
    provider: "mock",
    playbackUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    token,
    expiresAt,
  };
}
