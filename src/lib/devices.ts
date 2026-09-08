import { prisma } from "@/lib/db";
import { deviceSessionPrefix } from "@/lib/auth-session";

export function maxDevices() {
  const limit = Number(process.env.MAX_DEVICES ?? "2");
  return Number.isInteger(limit) && limit > 0 ? limit : 2;
}

export async function registerDevice(input: { userId: string; fingerprint: string; label?: string; skipLimit?: boolean }) {
  return prisma.$transaction(async (tx) => {
    // Serialize enrollment and revocation for this account.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const existing = await tx.device.findUnique({
      where: { userId_fingerprint: { userId: input.userId, fingerprint: input.fingerprint } },
    });
    if (!existing || existing.revokedAt) {
      const count = await tx.device.count({ where: { userId: input.userId, revokedAt: null } });
      if (!input.skipLimit && count >= maxDevices()) return { ok: false as const, error: "DEVICE_LIMIT" as const, device: null };
    }
    const device = await tx.device.upsert({
      where: { userId_fingerprint: { userId: input.userId, fingerprint: input.fingerprint } },
      create: { userId: input.userId, fingerprint: input.fingerprint, label: input.label ?? "เบราว์เซอร์" },
      update: { lastSeenAt: new Date(), label: input.label, revokedAt: null },
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
