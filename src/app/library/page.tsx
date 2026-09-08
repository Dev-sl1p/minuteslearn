import Link from "next/link";
import { redirect } from "next/navigation";
import { CoverImage } from "@/components/cover-image";
import { Icon } from "@/components/icon";
import { LearnerShell } from "@/components/learner-shell";
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

  const lessonSelect = { id: true, slug: true, order: true } as const;

  const [entitlements, adminCourses, completedRowsRaw] = await Promise.all([
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
            lessons: { orderBy: { order: "asc" }, select: lessonSelect },
            _count: { select: { lessons: true } },
          },
        })
      : Promise.resolve([]),
    prisma.lessonProgress.findMany({
      where: { userId },
      select: { courseId: true, lessonId: true, updatedAt: true, completed: true },
    }),
  ]);

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

  type Item = {
    key: string;
    courseId: string;
    href: string;
    continueHref: string;
    title: string;
    description: string;
    coverUrl: string | null;
    badge: string | null;
    badgeOk: boolean;
    totalLessons: number;
    doneLessons: number;
    percent: number;
  };

  const items: Item[] = isAdmin
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
        return {
          key: c.id,
          courseId: c.id,
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
        return {
          key: e.id,
          courseId: e.courseId,
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
    items[0];

  return (
    <LearnerShell>
      <div className="dash page-enter">
        <header className="dash__intro">
          <h1 className="page-title">
            {isAdmin ? "คอร์สทั้งหมด (แอดมิน)" : `ยินดีต้อนรับกลับมา, ${greeting}`}
          </h1>
          <p className="page-lead">
            {isAdmin ? (
              <>
                แอดมินเข้าเรียนได้ทุกคอร์ส ·{" "}
                <Link href="/admin">ไปหลังบ้าน</Link>
              </>
            ) : (
              <>
                มีความคืบหน้าดี — มาเรียนต่อกันเถอะ ·{" "}
                <Link href="/redeem">เพิ่มคีย์</Link>
              </>
            )}
          </p>
        </header>

        {items.length === 0 ? (
          <div className="panel anim-rise">
            <p className="muted" style={{ margin: 0 }}>
              ยังไม่มีคอร์ส — ไป{" "}
              <Link href="/redeem">ใส่คีย์</Link> หรือซื้อที่{" "}
              <a
                href="https://minutessharing.com/"
                target="_blank"
                rel="noreferrer"
              >
                minutessharing.com
              </a>
            </p>
          </div>
        ) : (
          <>
            {continueItem && (
              <section className="dash-bento anim-rise">
                <article className="dash-continue">
                  <div className="dash-continue__media">
                    {continueItem.coverUrl ? (
                      <CoverImage src={continueItem.coverUrl} loading="eager" />
                    ) : (
                      <div className="dash-continue__fallback" aria-hidden>
                        {continueItem.title.slice(0, 1)}
                      </div>
                    )}
                    <span className="dash-continue__chip">เรียนต่อ</span>
                  </div>
                  <div className="dash-continue__body">
                    <p className="dash-continue__eyebrow">คอร์สล่าสุด</p>
                    <h2>{continueItem.title}</h2>
                    <p>{continueItem.description}</p>
                    <div className="dash-progress">
                      <div className="dash-progress__meta">
                        <span>ความคืบหน้า</span>
                        <span>{continueItem.percent}%</span>
                      </div>
                      <div className="dash-progress__track">
                        <div
                          className="dash-progress__fill"
                          style={{ width: `${continueItem.percent}%` }}
                        />
                      </div>
                    </div>
                    <Link
                      href={continueItem.continueHref}
                      className="btn btn--primary"
                    >
                      เรียนต่อ
                    </Link>
                  </div>
                </article>

                <aside className="dash-stat panel">
                  <div className="dash-stat__icon" aria-hidden>
                    <Icon name="school" size={28} />
                  </div>
                  <p className="dash-stat__value">{items.length}</p>
                  <p className="dash-stat__label">คอร์สที่เข้าถึงได้</p>
                  <p className="muted" style={{ margin: "0.75rem 0 0" }}>
                    ผ่านแล้วเฉลี่ย{" "}
                    {items.length
                      ? Math.round(
                          items.reduce((s, i) => s + i.percent, 0) /
                            items.length,
                        )
                      : 0}
                    %
                  </p>
                </aside>
              </section>
            )}

            <section className="dash-section">
              <div className="dash-section__head">
                <h2>คอร์สเรียนทั้งหมดของคุณ</h2>
              </div>
              <div className="course-grid">
                {items.map((item, i) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="course-card course-card--media anim-rise"
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  >
                    <div className="course-card__thumb">
                      {item.coverUrl ? (
                        <CoverImage src={item.coverUrl} />
                      ) : (
                        <div className="course-card__thumb-fallback" aria-hidden>
                          {item.title.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="course-card__body">
                      <div className="course-card__head">
                        <h3>{item.title}</h3>
                        {item.badge && (
                          <span
                            className={`badge ${item.badgeOk ? "badge--ok" : "badge--bad"}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p>{item.description}</p>
                      <div className="dash-progress dash-progress--card">
                        <div className="dash-progress__meta">
                          <span>
                            {item.doneLessons}/{item.totalLessons} บท
                          </span>
                          <span>{item.percent}%</span>
                        </div>
                        <div className="dash-progress__track">
                          <div
                            className="dash-progress__fill"
                            style={{ width: `${item.percent}%` }}
                          />
                        </div>
                      </div>
                      <div className="course-card__foot">
                        <span className="course-card__action">
                          {item.percent > 0 ? "เรียนต่อ" : "เริ่มเรียน"}
                          <Icon name="arrow_forward" size={16} />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </LearnerShell>
  );
}
