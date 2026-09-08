import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import { upsertLessonProgress, userHasLessonAccess } from "@/lib/progress";

const schema = z.object({
  lessonId: z.string().min(1),
  watchedSec: z.number().finite().min(0).max(86400),
  durationSec: z.number().finite().min(1).max(86400),
  sessionToken: z.string().min(8).max(128),
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
  const isAdmin = session.user.role === "ADMIN";
  if (!lesson || (!lesson.course.published && !isAdmin)) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const allowed = await userHasCourseAccess(session.user.id, lesson.courseId, {
    isAdmin: session.user.role === "ADMIN",
  });
  if (!allowed) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }
  if (!(await userHasLessonAccess(session.user.id, lesson.id, lesson.courseId, isAdmin))) {
    return NextResponse.json({ error: "เรียนบทก่อนหน้าให้จบก่อน" }, { status: 403 });
  }

  const duration =
    lesson.durationSec && lesson.durationSec > 0 ? lesson.durationSec : parsed.data.durationSec;

  const progress = await upsertLessonProgress({
    userId: session.user.id,
    lessonId: lesson.id,
    courseId: lesson.courseId,
    watchedSec: parsed.data.watchedSec,
    durationSec: duration,
    sessionToken: parsed.data.sessionToken,
  });
  if (!progress) return NextResponse.json({ error: "เซสชันนี้สิ้นสุดแล้ว" }, { status: 409 });

  return NextResponse.json({
    completed: progress.completed,
    percent: progress.percent,
  });
}
