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
import { slugsMatch } from "@/lib/security";

type Props = {
  params: Promise<{ slug: string; lessonSlug: string }>;
};

export default async function LessonPage({ params }: Props) {
  const { slug, lessonSlug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?next=/learn/${slug}/${lessonSlug}`);
  }

  const isAdmin = session.user.role === "ADMIN";
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: { orderBy: { order: "asc" } },
      lessons: {
        orderBy: { order: "asc" },
        include: { resources: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) notFound();
  if (!course.published && !isAdmin) notFound();

  const [allowed, completedIds] = await Promise.all([
    userHasCourseAccess(session.user.id, course.id, { isAdmin }),
    getCompletedLessonIds(session.user.id, course.id),
  ]);
  if (!allowed) redirect(`/learn/${slug}`);

  const lesson = course.lessons.find((l) => slugsMatch(l.slug, lessonSlug));
  if (!lesson) notFound();

  const gates = course.lessons.map((l) => ({
    id: l.id,
    slug: l.slug,
    order: l.order,
  }));

  if (!isAdmin && !isLessonUnlocked(gates, lesson.id, completedIds)) {
    const fallback = firstUnlockedIncomplete(gates, completedIds);
    redirect(`/learn/${slug}/${fallback?.slug ?? course.lessons[0]?.slug}`);
  }

  return (
    <LearnWorkspace
      courseTitle={course.title}
      courseSlug={course.slug}
      isAdmin={isAdmin}
      modules={course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        order: m.order,
      }))}
      lesson={{
        id: lesson.id,
        title: lesson.title,
        slug: lesson.slug,
        description: lesson.description,
        order: lesson.order,
        moduleId: lesson.moduleId,
        durationSec: lesson.durationSec,
        resources: lesson.resources.map((r) => ({
          id: r.id,
          title: r.title,
        })),
      }}
      lessons={course.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        description: l.description,
        order: l.order,
        moduleId: l.moduleId,
        durationSec: l.durationSec,
        resources: l.resources.map((r) => ({ id: r.id, title: r.title })),
      }))}
      completedLessonIds={[...completedIds]}
    />
  );
}
