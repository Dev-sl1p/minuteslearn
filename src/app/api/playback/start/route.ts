import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import { registerDevice } from "@/lib/devices";
import { cleanupStaleSessions, startPlaybackSession } from "@/lib/playback-session";
import { createPlaybackToken } from "@/lib/stream";

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

  const allowed = await userHasCourseAccess(session.user.id, lesson.courseId);
  if (!allowed) {
    return NextResponse.json({ error: "No access to this course" }, { status: 403 });
  }

  const deviceResult = await registerDevice({
    userId: session.user.id,
    fingerprint: parsed.data.fingerprint,
    label: parsed.data.label,
  });
  if (!deviceResult.ok) {
    return NextResponse.json(
      {
        error:
          deviceResult.error === "DEVICE_LIMIT"
            ? "Device limit reached"
            : "Device revoked",
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

  const playback = await createPlaybackToken({
    userId: session.user.id,
    lessonId: lesson.id,
    assetId: lesson.streamAssetId ?? "demo",
  });

  return NextResponse.json({
    sessionToken: playbackSession.token,
    watermark: session.user.email ?? session.user.id,
    playback,
  });
}
