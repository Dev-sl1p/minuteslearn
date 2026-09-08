import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const day7 = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));

  const [
    studentCount,
    publishedCourses,
    draftCourses,
    activeLicenses,
    revokedLicenses,
    activeEntitlements,
    newStudents30d,
    redeem30d,
    completedLessons30d,
    recentLicenses,
    courses,
    lessonTotals,
    completedByCourse,
    completedByUser,
    redeemEvents7d,
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: "ADMIN" } } }),
    prisma.course.count({ where: { published: true } }),
    prisma.course.count({ where: { published: false } }),
    prisma.license.count({ where: { status: "ACTIVE" } }),
    prisma.license.count({ where: { status: "REVOKED" } }),
    prisma.entitlement.count({
      where: {
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.user.count({
      where: { role: { not: "ADMIN" }, createdAt: { gte: day30 } },
    }),
    prisma.license.count({ where: { redeemedAt: { gte: day30 } } }),
    prisma.lessonProgress.count({
      where: { completed: true, completedAt: { gte: day30 } },
    }),
    prisma.license.findMany({
      take: 12,
      orderBy: { redeemedAt: "desc" },
      include: {
        user: { select: { email: true, name: true } },
        course: { select: { title: true, slug: true } },
      },
    }),
    prisma.course.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        published: true,
        _count: {
          select: { entitlements: true, lessons: true, licenses: true },
        },
      },
    }),
    prisma.lesson.groupBy({
      by: ["courseId"],
      _count: { _all: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ["courseId"],
      where: { completed: true, user: { role: "USER" } },
      _count: { _all: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: { completed: true, user: { role: "USER" } },
      _count: { _all: true },
    }),
    prisma.license.findMany({
      where: { redeemedAt: { gte: day7 } },
      select: { redeemedAt: true },
    }),
  ]);

  const lessonCountMap = new Map(
    lessonTotals.map((r) => [r.courseId, r._count._all]),
  );
  const completedMap = new Map(
    completedByCourse.map((r) => [r.courseId, r._count._all]),
  );

  const courseStats = courses.map((c) => {
    const lessons = lessonCountMap.get(c.id) ?? c._count.lessons;
    const completed = completedMap.get(c.id) ?? 0;
    const learners = c._count.entitlements;
    const completionRate =
      learners === 0 || lessons === 0
        ? 0
        : Math.min(100, Math.round((completed / (lessons * learners)) * 100));
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      published: c.published,
      learners,
      lessons,
      licenses: c._count.licenses,
      completedLessonEvents: completed,
      completionRate,
    };
  });

  const completedByUserSorted = [...completedByUser]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 15);
  const topUserIds = completedByUserSorted.map((r) => r.userId);
  const topUsers = topUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: {
          id: true,
          email: true,
          name: true,
          _count: { select: { entitlements: true } },
          entitlements: { select: { course: { select: { _count: { select: { lessons: true } } } } } },
        },
      })
    : [];
  const userMap = new Map(topUsers.map((u) => [u.id, u]));

  const topStudents = completedByUserSorted.map((row) => {
    const u = userMap.get(row.userId);
    return {
      userId: row.userId,
      email: u?.email ?? "—",
      name: u?.name ?? null,
      courses: u?._count.entitlements ?? 0,
      completedLessons: row._count._all,
      totalLessons: u?.entitlements.reduce((sum, entry) => sum + entry.course._count.lessons, 0) ?? 0,
    };
  });

  const dayLabels: { key: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("th-TH", { weekday: "short" });
    dayLabels.push({ key, label, count: 0 });
  }
  for (const ev of redeemEvents7d) {
    const key = startOfDay(ev.redeemedAt).toISOString().slice(0, 10);
    const slot = dayLabels.find((d) => d.key === key);
    if (slot) slot.count += 1;
  }

  const recentActivity = [
    ...recentLicenses.slice(0, 8).map((l) => ({
      id: `lic-${l.id}`,
      type: "REDEEM" as const,
      message: `${l.user.email ?? "ผู้ใช้"} เปิดคีย์${l.course ? ` · ${l.course.title}` : ""}`,
      at: l.redeemedAt.toISOString(),
      status: l.status,
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return NextResponse.json({
    overview: {
      students: studentCount,
      publishedCourses,
      draftCourses,
      activeLicenses,
      revokedLicenses,
      activeEntitlements,
      newStudents30d,
      redeem30d,
      completedLessons30d,
    },
    redeemByDay: dayLabels,
    courseStats: courseStats.sort((a, b) => b.learners - a.learners),
    topStudents,
    recentEnrollments: recentLicenses.map((l) => ({
      id: l.id,
      email: l.user.email,
      name: l.user.name,
      courseTitle: l.course?.title ?? "—",
      courseSlug: l.course?.slug ?? null,
      status: l.status,
      redeemedAt: l.redeemedAt.toISOString(),
    })),
    recentActivity,
  });
}
