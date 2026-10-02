import { prisma } from "@/lib/db";
import { deviceSessionPrefix } from "@/lib/auth-session";

export function maxDevices() {
  const limit = Number(process.env.MAX_DEVICES ?? "2");
  return Number.isInteger(limit) && limit > 0 ? limit : 2;
}

export const STALE_DEVICE_DAYS = 14;

export async function registerDevice(input: {
  userId: string;
  fingerprint: string;
  label?: string;
  skipLimit?: boolean;
  autoEvict?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    // Serialize enrollment and revocation for this account.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;

    const now = new Date();
    // 1. Auto-retire stale devices that haven't been active in 14 days
    const staleCutoff = new Date(Date.now() - STALE_DEVICE_DAYS * 24 * 60 * 60 * 1000);
    const staleDevices = await tx.device.findMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        lastSeenAt: { lt: staleCutoff },
        fingerprint: { not: input.fingerprint },
      },
    });
    for (const stale of staleDevices) {
      await tx.session.deleteMany({
        where: {
          userId: input.userId,
          sessionToken: {
            startsWith: deviceSessionPrefix(input.userId, stale.fingerprint),
          },
        },
      });
      await tx.device.update({
        where: { id: stale.id },
        data: { revokedAt: now },
      });
    }

    const existing = await tx.device.findUnique({
      where: {
        userId_fingerprint: {
          userId: input.userId,
          fingerprint: input.fingerprint,
        },
      },
    });

    if (!existing || existing.revokedAt) {
      const activeDevices = await tx.device.findMany({
        where: { userId: input.userId, revokedAt: null },
        orderBy: { lastSeenAt: "asc" },
      });

      if (!input.skipLimit && activeDevices.length >= maxDevices()) {
        if (input.autoEvict) {
          // Evict the oldest device
          const oldest = activeDevices[0];
          if (oldest) {
            await tx.session.deleteMany({
              where: {
                userId: input.userId,
                sessionToken: {
                  startsWith: deviceSessionPrefix(input.userId, oldest.fingerprint),
                },
              },
            });
            await tx.playbackSession.updateMany({
              where: { userId: input.userId, deviceId: oldest.id, endedAt: null },
              data: { endedAt: now },
            });
            await tx.device.update({
              where: { id: oldest.id },
              data: { revokedAt: now },
            });
          }
        } else {
          return {
            ok: false as const,
            error: "DEVICE_LIMIT" as const,
            device: null,
          };
        }
      }
    }

    const device = await tx.device.upsert({
      where: {
        userId_fingerprint: {
          userId: input.userId,
          fingerprint: input.fingerprint,
        },
      },
      create: {
        userId: input.userId,
        fingerprint: input.fingerprint,
        label: input.label ?? "เบราว์เซอร์",
      },
      update: { lastSeenAt: now, label: input.label, revokedAt: null },
    });
    return { ok: true as const, device };
  });
}

export async function listDevices(userId: string, fingerprint?: string) {
  const devices = await prisma.device.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" } });
  return devices.map(({ fingerprint: deviceFingerprint, ...device }) => ({
    ...device, isCurrent: deviceFingerprint === fingerprint,
  }));
}

export async function revokeDevice(userId: string, deviceId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const device = await tx.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return null;
    await tx.session.deleteMany({
      where: { userId, sessionToken: { startsWith: deviceSessionPrefix(userId, device.fingerprint) } },
    });
    await tx.playbackSession.updateMany({
      where: { userId, deviceId, endedAt: null }, data: { endedAt: new Date() },
    });
    return tx.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
  });
}
