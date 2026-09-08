import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { heartbeatPlaybackSession } from "@/lib/playback-session";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";

const schema = z.object({
  sessionToken: z.string().min(8),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await heartbeatPlaybackSession({
    userId: session.user.id,
    token: parsed.data.sessionToken,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        error:
          result.reason === "SUPERSEDED"
            ? "มีการเปิดดูจากอุปกรณ์หรือแท็บอื่น — เซสชันนี้ถูกปิด"
            : "เซสชันไม่ถูกต้อง",
      },
      { status: 409 },
    );
  }
  const lesson = result.session.lessonId ? await prisma.lesson.findUnique({
    where: { id: result.session.lessonId }, include: { course: true },
  }) : null;
  const device = result.session.deviceId ? await prisma.device.findFirst({
    where: { id: result.session.deviceId, userId: session.user.id, fingerprint: session.user.fingerprint, revokedAt: null },
  }) : null;
  const isAdmin = session.user.role === "ADMIN";
  if (!lesson || !device || (!lesson.course.published && !isAdmin)
    || !(await userHasCourseAccess(session.user.id, lesson.courseId, { isAdmin }))) {
    return NextResponse.json({ reason: "REVOKED", error: "สิทธิ์การรับชมสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
