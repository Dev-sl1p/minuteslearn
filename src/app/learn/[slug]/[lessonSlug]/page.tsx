import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import {
  firstUnlockedIncomplete,
  getCompletedLessonIds,
  isLessonUnlocked,
} from "@/lib/progress";
import { LearnWorkspace } from "@/components/learn-workspace";

type Props = {
  params: Promise<{ slug: string; lessonSlug: string }>;
};

export default async function LessonPage({ params }: Props) {
  const { slug, lessonSlug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?next=/learn/${slug}/${lessonSlug}`);
  }

  const course = await prisma.course.findUnique({
    where: { slug },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  if (!course || !course.published) notFound();

  const allowed = await userHasCourseAccess(session.user.id, course.id);
  if (!allowed) redirect(`/learn/${slug}`);

  const lesson = course.lessons.find((l) => l.slug === lessonSlug);
  if (!lesson) notFound();

  const completedIds = await getCompletedLessonIds(session.user.id, course.id);
  const gates = course.lessons.map((l) => ({
    id: l.id,
    slug: l.slug,
    order: l.order,
  }));

  if (!isLessonUnlocked(gates, lesson.id, completedIds)) {
    const fallback = firstUnlockedIncomplete(gates, completedIds);
    redirect(`/learn/${slug}/${fallback?.slug ?? course.lessons[0]?.slug}`);
  }

  return (
    <LearnWorkspace
      courseTitle={course.title}
      courseSlug={course.slug}
      lesson={{
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug,
        description: lesson.description,
        order: lesson.order,
        durationSec: lesson.durationSec,
      }}
      lessons={course.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        description: l.description,
        order: l.order,
        durationSec: l.durationSec,
      }))}
      completedLessonIds={[...completedIds]}
    />
  );
}
