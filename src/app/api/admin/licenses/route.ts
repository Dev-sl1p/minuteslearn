import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const licenses = await prisma.license.findMany({
    include: {
      user: { select: { id: true, email: true, name: true } },
      course: { select: { id: true, title: true, slug: true } },
    },
    orderBy: { redeemedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ licenses });
}

const revokeSchema = z.object({
  licenseId: z.string().min(1),
  revokeDevices: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const license = await prisma.license.findUnique({
    where: { id: parsed.data.licenseId },
  });
  if (!license) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.license.update({
      where: { id: license.id },
      data: { status: "REVOKED" },
    });

    if (license.courseId) {
      await tx.entitlement.updateMany({
        where: {
          userId: license.userId,
          courseId: license.courseId,
        },
        data: { status: "REVOKED" },
      });
    }

    if (parsed.data.revokeDevices) {
      await tx.device.updateMany({
        where: { userId: license.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await tx.playbackSession.updateMany({
      where: { userId: license.userId, endedAt: null },
      data: { endedAt: new Date() },
    });
  });

  await logSecurityEvent({
    type: "LICENSE_REVOKE",
    severity: "warn",
    message: `Revoked license ${license.key}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    ip: getClientIp(req),
    meta: {
      licenseId: license.id,
      userId: license.userId,
      revokeDevices: parsed.data.revokeDevices ?? false,
    },
  });

  return NextResponse.json({ ok: true });
}
