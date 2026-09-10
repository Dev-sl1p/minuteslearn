import { redirect } from "next/navigation";
import { LearnerShell } from "@/components/learner-shell";
import {
  LibraryView,
  type LibraryCourseItem,
  type LibraryMaterialItem,
} from "@/components/library-view";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/library");

  const isAdmin = session.user.role === "ADMIN";
  const userId = session.user.id;
  const greeting =
    session.user.name?.trim() ||
    session.user.email?.split("@")[0] ||
    "ผู้เรียน";

  const lessonSelect = {
    id: true,
    title: true,
    slug: true,
    order: true,
    resources: {
      orderBy: { order: "asc" as const },
      select: {
        id: true,
        title: true,
        storagePath: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        order: true,
      },
    },
  } as const;

  const courseResourceSelect = {
    id: true,
    title: true,
    storagePath: true,
    url: true,
    mimeType: true,
    sizeBytes: true,
    order: true,
    lessonId: true,
  } as const;

  const [entitlements, adminCourses, completedRowsRaw, licenses] = await Promise.all([
    isAdmin
      ? Promise.resolve([])
      : prisma.entitlement.findMany({
          where: {
            userId,
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            course: {
              include: {
                resources: {
                  where: { lessonId: null },
                  orderBy: { order: "asc" },
                  select: courseResourceSelect,
                },
                lessons: { orderBy: { order: "asc" }, select: lessonSelect },
                _count: { select: { lessons: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
    isAdmin
      ? prisma.course.findMany({
          orderBy: { updatedAt: "desc" },
          include: {
            resources: {
              where: { lessonId: null },
              orderBy: { order: "asc" },
              select: courseResourceSelect,
            },
            lessons: { orderBy: { order: "asc" }, select: lessonSelect },
            _count: { select: { lessons: true } },
          },
        })
      : Promise.resolve([]),
    prisma.lessonProgress.findMany({
      where: { userId },
      select: { courseId: true, lessonId: true, updatedAt: true, completed: true },
    }),
    isAdmin
      ? Promise.resolve([])
      : prisma.license.findMany({
          where: { userId },
          select: { id: true, key: true, courseId: true },
        }),
  ]);

  const licenseByKeyId = new Map(licenses.map((l) => [l.id, l.key]));
  const licenseByCourseId = new Map(
    licenses.filter((l) => l.courseId).map((l) => [l.courseId!, l.key]),
  );

  const courseIds = new Set(
    isAdmin
      ? adminCourses.map((c) => c.id)
      : entitlements.map((e) => e.courseId),
  );

  const completedRows = completedRowsRaw.filter((r) =>
    courseIds.has(r.courseId),
  );

  const completedByCourse = new Map<string, number>();
  const lastActivity = new Map<string, Date>();
  for (const row of completedRows) {
    if (row.completed) completedByCourse.set(
      row.courseId,
      (completedByCourse.get(row.courseId) ?? 0) + 1,
    );
    const prev = lastActivity.get(row.courseId);
    if (!prev || row.updatedAt > prev) {
      lastActivity.set(row.courseId, row.updatedAt);
    }
  }

  const items: LibraryCourseItem[] = isAdmin
    ? adminCourses.map((c) => {
        const done = completedByCourse.get(c.id) ?? 0;
        const total = c._count.lessons;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        const completedIds = new Set(
          completedRows
            .filter((r) => r.courseId === c.id && r.completed)
            .map((r) => r.lessonId),
        );
        const next =
          c.lessons.find((l) => !completedIds.has(l.id)) ?? c.lessons[0];

        const courseMaterials: LibraryMaterialItem[] = (c.resources ?? []).map(
          (r) => ({
            id: r.id,
            title: r.title,
            lessonId: null,
            lessonTitle: "ไฟล์รวมประจำคอร์ส",
            lessonOrder: null,
            courseId: c.id,
            courseTitle: c.title,
            courseSlug: c.slug,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
            isExternal: Boolean(r.url),
            order: r.order,
          }),
        );

        const lessonMaterials: LibraryMaterialItem[] = c.lessons.flatMap((l) =>
          l.resources.map((r) => ({
            id: r.id,
            title: r.title,
            lessonId: l.id,
            lessonTitle: l.title,
            lessonOrder: l.order,
            courseId: c.id,
            courseTitle: c.title,
            courseSlug: c.slug,
            mimeType: r.mimeType,
            sizeBytes: r.sizeBytes,
            isExternal: Boolean(r.url),
            order: r.order,
          })),
        );

        const materials = [...courseMaterials, ...lessonMaterials];

        return {
          key: c.id,
          courseId: c.id,
          slug: c.slug,
          href: `/learn/${c.slug}`,
          continueHref: next
            ? `/learn/${c.slug}/${next.slug}`
            : `/learn/${c.slug}`,
          title: c.title,
          description: c.description ?? "พรีวิวในฐานะแอดมิน",
          coverUrl: c.coverUrl,
          badge: c.published ? "เผยแพร่แล้ว" : "ฉบับร่าง",
          badgeOk: c.published,
          totalLessons: total,
          doneLessons: done,
          percent,
          licenseKey: null,
          materials,
        };
      })
    : entitlements.map((e) => {
        const done = completedByCourse.get(e.courseId) ?? 0;
        const total = e.course._count.lessons;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        const completedIds = new Set(
          completedRows
            .filter((r) => r.courseId === e.courseId && r.completed)
            .map((r) => r.lessonId),
        );
        const next =
          e.course.lessons.find((l) => !completedIds.has(l.id)) ??
          e.course.lessons[0];

        const courseMaterials: LibraryMaterialItem[] = (
          e.course.resources ?? []
        ).map((r) => ({
          id: r.id,
          title: r.title,
          lessonId: null,
          lessonTitle: "ไฟล์รวมประจำคอร์ส",
          lessonOrder: null,
          courseId: e.courseId,
          courseTitle: e.course.title,
          courseSlug: e.course.slug,
          mimeType: r.mimeType,
          sizeBytes: r.sizeBytes,
          isExternal: Boolean(r.url),
          order: r.order,
        }));

        const lessonMaterials: LibraryMaterialItem[] = e.course.lessons.flatMap(
          (l) =>
            l.resources.map((r) => ({
              id: r.id,
              title: r.title,
              lessonId: l.id,
              lessonTitle: l.title,
              lessonOrder: l.order,
              courseId: e.courseId,
              courseTitle: e.course.title,
              courseSlug: e.course.slug,
              mimeType: r.mimeType,
              sizeBytes: r.sizeBytes,
              isExternal: Boolean(r.url),
              order: r.order,
            })),
        );

        const materials = [...courseMaterials, ...lessonMaterials];

        return {
          key: e.id,
          courseId: e.courseId,
          slug: e.course.slug,
          href: `/learn/${e.course.slug}`,
          continueHref: next
            ? `/learn/${e.course.slug}/${next.slug}`
            : `/learn/${e.course.slug}`,
          title: e.course.title,
          description: e.course.description ?? "เข้าเรียนต่อ",
          coverUrl: e.course.coverUrl,
          badge: null,
          badgeOk: true,
          totalLessons: total,
          doneLessons: done,
          percent,
          licenseKey:
            (e.licenseId ? licenseByKeyId.get(e.licenseId) : null) ??
            licenseByCourseId.get(e.courseId) ??
            null,
          materials,
        };
      });

  const continueItem =
    items
      .filter((i) => i.totalLessons > 0 && i.percent < 100)
      .sort((a, b) => {
        const aAct = lastActivity.get(a.courseId)?.getTime() ?? 0;
        const bAct = lastActivity.get(b.courseId)?.getTime() ?? 0;
        return bAct - aAct;
      })[0] ??
    items.find((i) => i.percent < 100) ??
    items[0] ??
    null;

  return (
    <LearnerShell>
      <LibraryView
        items={items}
        continueItem={continueItem}
        isAdmin={isAdmin}
        greeting={greeting}
      />
    </LearnerShell>
  );
}
