import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseCurriculum } from "@/components/course-curriculum";
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

export default async function LearnCoursePage({ params }: Props) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=/learn/${slug}`);

  const isAdmin = session.user.role === "ADMIN";
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: { orderBy: { order: "asc" } },
      lessons: { orderBy: { order: "asc" } },
    },
  });
  if (!course) notFound();
  if (!course.published && !isAdmin) notFound();

  const allowed = await userHasCourseAccess(session.user.id, course.id, {
    isAdmin,
  });
  if (!allowed) {
    return (
      <div className="shell page-enter">
        <h1 className="page-title">{course.title}</h1>
        <div className="panel anim-rise">
          <p style={{ margin: 0 }}>
            คุณยังไม่มีสิทธิ์เข้าคอร์สนี้ —{" "}
            <Link href="/redeem">ใส่คีย์เพื่อเปิดคอร์ส</Link>
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

  const sortedMods = [...course.modules].sort((a, b) => a.order - b.order);
  const groups: {
    key: string;
    title: string | null;
    moduleIndex: number | null;
    lessons: {
      id: string;
      title: string;
      slug: string;
      description: string | null;
      durationSec: number | null;
    }[];
  }[] = [];

  for (let mi = 0; mi < sortedMods.length; mi++) {
    const mod = sortedMods[mi];
    groups.push({
      key: mod.id,
      title: mod.title,
      moduleIndex: mi + 1,
      lessons: course.lessons
        .filter((l) => l.moduleId === mod.id)
        .sort((a, b) => a.order - b.order)
        .map((l) => ({
          id: l.id,
          title: l.title,
          slug: l.slug,
          description: l.description,
          durationSec: l.durationSec,
        })),
    });
  }
  const orphans = course.lessons
    .filter((l) => !l.moduleId)
    .sort((a, b) => a.order - b.order);
  if (orphans.length > 0) {
    groups.push({
      key: "__none",
      title: sortedMods.length > 0 ? "อื่นๆ" : null,
      moduleIndex: sortedMods.length > 0 ? sortedMods.length + 1 : null,
      lessons: orphans.map((l) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        description: l.description,
        durationSec: l.durationSec,
      })),
    });
  }

  const unlockedIds = course.lessons
    .filter((l) => isAdmin || isLessonUnlocked(gates, l.id, completedIds))
    .map((l) => l.id);

  return (
    <div className="shell page-enter">
      <p className="muted">
        <Link href="/library">← คอร์สของฉัน</Link>
        {isAdmin && !course.published ? " · ฉบับร่าง (แอดมิน)" : null}
      </p>
      <h1 className="page-title">{course.title}</h1>
      <p className="page-lead">{course.description}</p>
      <p className="muted" style={{ marginTop: "-0.75rem" }}>
        {isAdmin
          ? "โหมดแอดมิน — เปิดดูทุกบทได้โดยไม่ต้องปลดล็อก"
          : `ความคืบหน้า ${doneCount}/${course.lessons.length} บท · ต้องดูครบอย่างน้อย 90% ก่อนไปบทถัดไป`}
      </p>

      {(resume || (isAdmin && course.lessons[0])) && (
        <p style={{ marginBottom: "1.25rem" }}>
          <Link
            href={`/learn/${course.slug}/${(resume ?? course.lessons[0]).slug}`}
            className="btn btn--primary"
          >
            {isAdmin ? "เปิดดูบทแรก →" : "เรียนต่อ →"}
          </Link>
        </p>
      )}

      <div className="panel anim-rise">
        <h2
          style={{
            marginTop: 0,
            fontSize: "1.05rem",
            fontFamily: "var(--font-display)",
          }}
        >
          ลำดับการเรียน
        </h2>
        <CourseCurriculum
          courseSlug={course.slug}
          groups={groups}
          completedIds={[...completedIds]}
          unlockedIds={unlockedIds}
        />
      </div>
    </div>
  );
}
