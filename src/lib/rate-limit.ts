import { prisma } from "@/lib/db";

export function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
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

  const existing = await prisma.rateLimitBucket.findUnique({
    where: { key: input.key },
  });

  if (!existing || existing.windowStart.getTime() !== windowStart.getTime()) {
    await prisma.rateLimitBucket.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        count: 1,
        windowStart,
      },
      update: {
        count: 1,
        windowStart,
      },
    });
    return {
      ok: true as const,
      remaining: input.limit - 1,
      resetAt: new Date(windowStart.getTime() + input.windowMs),
    };
  }

  if (existing.count >= input.limit) {
    return {
      ok: false as const,
      remaining: 0,
      resetAt: new Date(windowStart.getTime() + input.windowMs),
    };
  }

  await prisma.rateLimitBucket.update({
    where: { key: input.key },
    data: { count: { increment: 1 } },
  });

  return {
    ok: true as const,
    remaining: input.limit - existing.count - 1,
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
