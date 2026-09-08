import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const HEARTBEAT_STALE_MS = 2 * 60 * 1000;

export async function startPlaybackSession(input: {
  userId: string;
  deviceId?: string;
  lessonId: string;
  requestId?: string;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const token = input.requestId
      ? createHash("sha256").update(JSON.stringify([input.userId, input.deviceId, input.lessonId, input.requestId])).digest("hex")
      : randomBytes(24).toString("hex");
    if (input.requestId) {
      const existing = await tx.playbackSession.findUnique({ where: { token } });
      // Duplicate starts must not evict each other or revive an ended session.
      if (existing) return existing.endedAt ? null : existing;
    }

    // End stale or other active sessions for this user (single concurrent stream)
    await tx.playbackSession.updateMany({
      where: {
        userId: input.userId,
        endedAt: null,
      },
      data: { endedAt: now },
    });

    const session = await tx.playbackSession.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId,
        lessonId: input.lessonId,
        token,
        lastBeatAt: now,
      },
    });

    return session;
  });
}

export async function heartbeatPlaybackSession(input: {
  userId: string;
  token: string;
}) {
  const session = await prisma.playbackSession.findFirst({
    where: {
      token: input.token,
      userId: input.userId,
    },
  });

  if (!session) {
    return { ok: false as const, reason: "INVALID" as const };
  }
  if (session.endedAt) return { ok: false as const, reason: "SUPERSEDED" as const };
  if (Date.now() - session.lastBeatAt.getTime() > HEARTBEAT_STALE_MS) {
    await endPlaybackSession(input.userId, input.token);
    return { ok: false as const, reason: "EXPIRED" as const };
  }

  // Another session may have taken over
  const newer = await prisma.playbackSession.findFirst({
    where: {
      userId: input.userId,
      endedAt: null,
      createdAt: { gt: session.createdAt },
    },
  });

  if (newer) {
    await prisma.playbackSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    return { ok: false as const, reason: "SUPERSEDED" as const };
  }

  const updated = await prisma.playbackSession.updateMany({
    where: { id: session.id, endedAt: null },
    data: { lastBeatAt: new Date() },
  });
  if (!updated.count) return { ok: false as const, reason: "SUPERSEDED" as const };

  return { ok: true as const, session };
}

export async function endPlaybackSession(userId: string, token: string) {
  await prisma.playbackSession.updateMany({
    where: { userId, token, endedAt: null },
    data: { endedAt: new Date() },
  });
}

export async function cleanupStaleSessions() {
  const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);
  await prisma.playbackSession.updateMany({
    where: {
      endedAt: null,
      lastBeatAt: { lt: cutoff },
    },
    data: { endedAt: new Date() },
  });
}
