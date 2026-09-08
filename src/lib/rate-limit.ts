import { prisma } from "@/lib/db";
import { randomUUID } from "node:crypto";

export function getClientIp(req: Request) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

/**
 * Fixed-window rate limit stored in Postgres (works on Vercel serverless).
 */
export async function rateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const windowStart = new Date(now - (now % input.windowMs));

  // Check and consume a slot in one parameterized, row-locked statement.
  const [bucket] = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("id", "key", "count", "windowStart", "updatedAt")
    VALUES (${randomUUID()}, ${input.key}, 1, ${windowStart}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < EXCLUDED."windowStart"
        THEN 1 ELSE LEAST("RateLimitBucket"."count" + 1, ${input.limit + 1}) END,
      "windowStart" = GREATEST("RateLimitBucket"."windowStart", EXCLUDED."windowStart"),
      "updatedAt" = NOW()
    RETURNING "count"
  `;

  return {
    ok: bucket.count <= input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt: new Date(windowStart.getTime() + input.windowMs),
  };
}

export function rateLimitResponse(resetAt: Date) {
  return Response.json(
    {
      error: "RATE_LIMITED",
      message: "ลองใหม่ภายหลัง — มีคำขอมากเกินไป",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        ),
      },
    },
  );
}
