import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import { registerDevice } from "@/lib/devices";
import { cleanupStaleSessions, startPlaybackSession } from "@/lib/playback-session";
import { createPlaybackToken, PlaybackConfigError } from "@/lib/stream";

const schema = z.object({
  lessonId: z.string().min(1),
  fingerprint: z.string().min(8).max(128),
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
  if (!lesson || !lesson.course.published) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const allowed = await userHasCourseAccess(session.user.id, lesson.courseId, {
    isAdmin: session.user.role === "ADMIN",
  });
  if (!allowed) {
    return NextResponse.json({ error: "No access to this course" }, { status: 403 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const deviceResult = await registerDevice({
    userId: session.user.id,
    fingerprint: parsed.data.fingerprint,
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

  const playbackSession = await startPlaybackSession({
    userId: session.user.id,
    deviceId: deviceResult.device.id,
    lessonId: lesson.id,
  });

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

    return NextResponse.json({
      sessionToken: playbackSession.token,
      playback,
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
