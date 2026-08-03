import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import { upsertLessonProgress } from "@/lib/progress";

const schema = z.object({
  lessonId: z.string().min(1),
  watchedSec: z.number().min(0),
  durationSec: z.number().min(0),
  forceComplete: z.boolean().optional(),
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
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const duration =
    parsed.data.durationSec > 0
      ? parsed.data.durationSec
      : lesson.durationSec ?? parsed.data.watchedSec;

  const progress = await upsertLessonProgress({
    userId: session.user.id,
    lessonId: lesson.id,
    courseId: lesson.courseId,
    watchedSec: parsed.data.watchedSec,
    durationSec: duration,
    forceComplete: parsed.data.forceComplete,
  });

  return NextResponse.json({
    completed: progress.completed,
    percent: progress.percent,
  });
}
