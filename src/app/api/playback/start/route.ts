import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import { registerDevice } from "@/lib/devices";
import { cleanupStaleSessions, startPlaybackSession } from "@/lib/playback-session";
import { createPlaybackToken, PlaybackConfigError } from "@/lib/stream";
import { userHasLessonAccess } from "@/lib/progress";

const schema = z.object({
  lessonId: z.string().min(1),
  requestId: z.string().uuid(),
  label: z.string().max(80).optional(),
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

  const lesson = await prisma.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    include: { course: true },
  });
  if (!lesson || (!lesson.course.published && session.user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const allowed = await userHasCourseAccess(session.user.id, lesson.courseId, {
    isAdmin: session.user.role === "ADMIN",
  });
  if (!allowed) {
    return NextResponse.json({ error: "No access to this course" }, { status: 403 });
  }

  const isAdmin = session.user.role === "ADMIN";
  if (!(await userHasLessonAccess(session.user.id, lesson.id, lesson.courseId, isAdmin))) {
    return NextResponse.json({ error: "เรียนบทก่อนหน้าให้จบก่อน" }, { status: 403 });
  }
  const deviceResult = await registerDevice({
    userId: session.user.id,
    fingerprint: session.user.fingerprint,
    label: parsed.data.label,
    skipLimit: isAdmin,
  });
  if (!deviceResult.ok) {
    return NextResponse.json(
      {
        error:
          deviceResult.error === "DEVICE_LIMIT"
            ? "เต็มจำนวนอุปกรณ์แล้ว — ปลดเครื่องเก่าก่อน"
            : "อุปกรณ์นี้ถูกระงับแล้ว",
      },
      { status: 403 },
    );
  }

  await cleanupStaleSessions();

  if (!lesson.streamAssetId?.trim()) {
    return NextResponse.json(
      { error: "บทเรียนนี้ยังไม่มีวิดีโอ — ติดต่อแอดมิน" },
      { status: 503 },
    );
  }

  try {
    const playback = await createPlaybackToken({
      userId: session.user.id,
      lessonId: lesson.id,
      assetId: lesson.streamAssetId,
    });
    const playbackSession = await startPlaybackSession({
      userId: session.user.id, deviceId: deviceResult.device.id, lessonId: lesson.id,
      requestId: parsed.data.requestId,
    });
    if (!playbackSession) return NextResponse.json({ error: "เซสชันนี้สิ้นสุดแล้ว กรุณากดเล่นต่ออีกครั้ง" }, { status: 409 });
    const progress = await prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: session.user.id, lessonId: lesson.id } },
    });

    return NextResponse.json({
      sessionToken: playbackSession.token,
      playback,
      resumeAt: progress?.completed ? 0 : progress?.watchedSec ?? 0,
      percent: progress?.percent ?? 0,
    });
  } catch (e) {
    if (e instanceof PlaybackConfigError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json(
      { error: "ไม่สามารถเริ่มสตรีมได้" },
      { status: 500 },
    );
  }
}
