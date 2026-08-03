import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const HEARTBEAT_STALE_MS = 90_000;

export async function startPlaybackSession(input: {
  userId: string;
  deviceId?: string;
  lessonId: string;
}) {
  const now = new Date();

  // End stale or other active sessions for this user (single concurrent stream)
  await prisma.playbackSession.updateMany({
    where: {
      userId: input.userId,
      endedAt: null,
    },
    data: { endedAt: now },
  });

  const token = randomBytes(24).toString("hex");
  const session = await prisma.playbackSession.create({
    data: {
      userId: input.userId,
      deviceId: input.deviceId,
      lessonId: input.lessonId,
      token,
      lastBeatAt: now,
    },
  });

  return session;
}

export async function heartbeatPlaybackSession(input: {
  userId: string;
  token: string;
}) {
  const session = await prisma.playbackSession.findFirst({
    where: {
      token: input.token,
      userId: input.userId,
      endedAt: null,
    },
  });

  if (!session) {
    return { ok: false as const, reason: "INVALID" as const };
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

  await prisma.playbackSession.update({
    where: { id: session.id },
    data: { lastBeatAt: new Date() },
  });

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
