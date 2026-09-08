import type { License } from "@prisma/client";
import { prisma } from "@/lib/db";
import { validateLicense } from "@/lib/wp-license";

const RECHECK_MS = 5 * 60 * 1000;

export async function refreshLicenseStatus(license: License, force = false) {
  if (license.status !== "ACTIVE" || (license.expiresAt && license.expiresAt <= new Date())) return false;
  if (!license.wpActivated) return true;
  if (!force && Date.now() - license.updatedAt.getTime() < RECHECK_MS) return true;

  // Transport errors propagate: do not turn a temporary shop outage into a
  // permanent revocation. Protected callers deny access until a retry succeeds.
  const upstream = await validateLicense(license.key);
  const expiresAt = upstream?.expiresAt ? new Date(upstream.expiresAt.replace(" ", "T")) : null;
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) throw new Error("Invalid license expiry");
  const active = upstream?.status === "active" && (!expiresAt || expiresAt > new Date());
  await prisma.$transaction(async (tx) => {
    // Do not undo an admin revocation that happened during the upstream request.
    const updated = await tx.license.updateMany({
      where: { id: license.id, status: "ACTIVE" },
      data: { status: active ? "ACTIVE" : "REVOKED", expiresAt, updatedAt: new Date() },
    });
    if (updated.count) {
      await tx.entitlement.updateMany({
        where: { licenseId: license.id, status: "ACTIVE" },
        data: { status: active ? "ACTIVE" : "REVOKED", expiresAt },
      });
      if (!active) await tx.playbackSession.updateMany({
        where: { userId: license.userId, endedAt: null }, data: { endedAt: new Date() },
      });
    }
  });
  const current = await prisma.license.findUnique({ where: { id: license.id } });
  return active && current?.status === "ACTIVE";
}
