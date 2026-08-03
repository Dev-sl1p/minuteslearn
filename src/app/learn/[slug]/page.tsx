import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import {
  firstUnlockedIncomplete,
  getCompletedLessonIds,
  isLessonUnlocked,
} from "@/lib/progress";

type Props = {
  params: Promise<{ slug: string }>;
};

function formatDuration(sec: number | null) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function LearnCoursePage({ params }: Props) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=/learn/${slug}`);

  const course = await prisma.course.findUnique({
    where: { slug },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  if (!course || !course.published) notFound();

  const allowed = await userHasCourseAccess(session.user.id, course.id);
  if (!allowed) {
    return (
      <div className="shell">
        <h1 className="page-title">{course.title}</h1>
        <div className="panel">
          <p style={{ margin: 0 }}>
            คุณยังไม่มีสิทธิ์เข้าคอร์สนี้ —{" "}
            <Link href="/redeem">redeem license key</Link>
          </p>
        </div>
      </div>
    );
  }

  const completedIds = await getCompletedLessonIds(session.user.id, course.id);
  const gates = course.lessons.map((l) => ({
    id: l.id,
    slug: l.slug,
    order: l.order,
  }));
  const resume = firstUnlockedIncomplete(gates, completedIds);
  const doneCount = course.lessons.filter((l) => completedIds.has(l.id)).length;

  return (
    <div className="shell">
      <p className="muted">
        <Link href="/library">← คอร์สของฉัน</Link>
      </p>
      <h1 className="page-title">{course.title}</h1>
      <p className="page-lead">{course.description}</p>
      <p className="muted" style={{ marginTop: "-0.75rem" }}>
        ความคืบหน้า {doneCount}/{course.lessons.length} บท ·
        ต้องดูครบอย่างน้อย 90% ก่อนไปบทถัดไป
      </p>

      {resume && (
        <p style={{ marginBottom: "1.25rem" }}>
          <Link
            href={`/learn/${course.slug}/${resume.slug}`}
            className="btn btn--primary"
          >
            เรียนต่อ →
          </Link>
        </p>
      )}

      <div className="panel">
        <h2
          style={{
            marginTop: 0,
            fontSize: "1.05rem",
            fontFamily: "var(--font-display)",
          }}
        >
          ลำดับการเรียน
        </h2>
        <div className="curriculum-list">
          {course.lessons.map((lesson, i) => {
            const unlocked = isLessonUnlocked(gates, lesson.id, completedIds);
            const done = completedIds.has(lesson.id);

            if (!unlocked) {
              return (
                <div
                  key={lesson.id}
                  className="curriculum-item curriculum-item--locked"
                >
                  <span className="curriculum-item__num">🔒</span>
                  <span className="curriculum-item__body">
                    <span className="curriculum-item__title">{lesson.title}</span>
                    <span className="curriculum-item__desc">
                      ล็อก — ดูบทก่อนหน้าให้ครบก่อน
                    </span>
                  </span>
                  <span className="curriculum-item__dur">
                    {formatDuration(lesson.durationSec)}
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={lesson.id}
                href={`/learn/${course.slug}/${lesson.slug}`}
                className="curriculum-item"
              >
                <span className="curriculum-item__num">
                  {done ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <span className="curriculum-item__body">
                  <span className="curriculum-item__title">{lesson.title}</span>
                  {lesson.description && (
                    <span className="curriculum-item__desc">
                      {lesson.description}
                    </span>
                  )}
                </span>
                <span className="curriculum-item__dur">
                  {done ? "ผ่านแล้ว" : formatDuration(lesson.durationSec)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
