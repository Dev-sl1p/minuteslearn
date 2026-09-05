import { prisma } from "@/lib/db";

export function maxDevices() {
  return Number(process.env.MAX_DEVICES ?? "2");
}

export async function registerDevice(input: {
  userId: string;
  fingerprint: string;
  label?: string;
  /** Admins previewing courses bypass the device cap */
  skipLimit?: boolean;
}) {
  const existing = await prisma.device.findUnique({
    where: {
      userId_fingerprint: {
        userId: input.userId,
        fingerprint: input.fingerprint,
      },
    },
  });

  if (existing) {
    if (existing.revokedAt && !input.skipLimit) {
      return { ok: false as const, error: "DEVICE_REVOKED" as const, device: existing };
    }
    const device = await prisma.device.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        label: input.label ?? existing.label,
        revokedAt: input.skipLimit ? null : existing.revokedAt,
      },
    });
    return { ok: true as const, device };
  }

  const activeCount = await prisma.device.count({
    where: { userId: input.userId, revokedAt: null },
  });

  if (!input.skipLimit && activeCount >= maxDevices()) {
    return { ok: false as const, error: "DEVICE_LIMIT" as const, device: null };
  }

  const device = await prisma.device.create({
    data: {
      userId: input.userId,
      fingerprint: input.fingerprint,
      label: input.label ?? "Unknown device",
    },
  });

  return { ok: true as const, device };
}

export async function listDevices(userId: string) {
  return prisma.device.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeDevice(userId: string, deviceId: string) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) return null;
  return prisma.device.update({
    where: { id: deviceId },
    data: { revokedAt: new Date() },
  });
}
