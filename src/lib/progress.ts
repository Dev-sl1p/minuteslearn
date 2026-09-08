import { prisma } from "@/lib/db";

/** Watch at least this percentage to unlock the next lesson. */
export const COMPLETE_THRESHOLD = 90;

export type LessonGate = {
  id: string;
  slug: string;
  order: number;
};

export async function getCompletedLessonIds(userId: string, courseId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, courseId, completed: true },
    select: { lessonId: true },
  });
  return new Set(rows.map((r) => r.lessonId));
}

/** First lesson always unlocked; later ones need previous completed */
export function isLessonUnlocked(
  lessons: LessonGate[],
  lessonId: string,
  completedIds: Set<string>,
) {
  const sorted = [...lessons].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === lessonId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const prev = sorted[idx - 1];
  return completedIds.has(prev.id);
}

export function firstUnlockedIncomplete(
  lessons: LessonGate[],
  completedIds: Set<string>,
) {
  const sorted = [...lessons].sort((a, b) => a.order - b.order);
  for (const lesson of sorted) {
    if (!isLessonUnlocked(sorted, lesson.id, completedIds)) break;
    if (!completedIds.has(lesson.id)) return lesson;
  }
  return sorted[sorted.length - 1] ?? null;
}

export async function upsertLessonProgress(input: {
  userId: string;
  lessonId: string;
  courseId: string;
  watchedSec: number;
  durationSec: number;
  sessionToken: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const playback = await tx.playbackSession.findFirst({
      where: { token: input.sessionToken, userId: input.userId, lessonId: input.lessonId, endedAt: null, lastBeatAt: { gte: new Date(Date.now() - 120000) } },
    });
    if (!playback) return null;
    const duration = Math.max(input.durationSec, 1);

    const existing = await tx.lessonProgress.findUnique({
      where: {
        userId_lessonId: {
          userId: input.userId,
          lessonId: input.lessonId,
        },
      },
    });

    // Client positions cannot instantly complete a lesson after a seek or a
    // forged request. Credit cannot grow faster than elapsed time at 2x playback.
    const since = Math.max(playback.createdAt.getTime(), existing?.updatedAt.getTime() ?? 0);
    const credit = Math.max(0, Math.min(120, (Date.now() - since) / 1000 * 2));
    const watched = Math.max(existing?.watchedSec ?? 0, Math.min(input.watchedSec, duration, (existing?.watchedSec ?? 0) + credit));
    const percent = Math.min(100, (watched / duration) * 100);
    const completed = percent >= COMPLETE_THRESHOLD;

    if (existing?.completed) {
      return existing;
    }

    return tx.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: input.userId,
          lessonId: input.lessonId,
        },
      },
      create: {
        userId: input.userId,
        lessonId: input.lessonId,
        courseId: input.courseId,
        watchedSec: watched,
        percent,
        completed,
        completedAt: completed ? new Date() : null,
      },
      update: {
        watchedSec: Math.max(existing?.watchedSec ?? 0, watched),
        percent: Math.max(existing?.percent ?? 0, percent),
        completed,
        completedAt: completed ? new Date() : existing?.completedAt ?? null,
      },
    });
  });
}

export async function userHasLessonAccess(userId: string, lessonId: string, courseId: string, isAdmin = false) {
  if (isAdmin) return true;
  const [lessons, completed] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId }, select: { id: true, slug: true, order: true }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
    getCompletedLessonIds(userId, courseId),
  ]);
  return isLessonUnlocked(lessons, lessonId, completed);
}
