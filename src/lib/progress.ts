import { prisma } from "@/lib/db";

/** Watch at least this % (or video ended) to unlock the next lesson */
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
  if (idx <= 0) return true;
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
  forceComplete?: boolean;
}) {
  const duration = Math.max(input.durationSec, 1);
  const watched = Math.max(0, Math.min(input.watchedSec, duration));
  const percent = Math.min(100, (watched / duration) * 100);
  const completed =
    Boolean(input.forceComplete) || percent >= COMPLETE_THRESHOLD;

  const existing = await prisma.lessonProgress.findUnique({
    where: {
      userId_lessonId: {
        userId: input.userId,
        lessonId: input.lessonId,
      },
    },
  });

  if (existing?.completed) {
    return existing;
  }

  return prisma.lessonProgress.upsert({
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
}
