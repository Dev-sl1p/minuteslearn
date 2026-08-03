import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/library");

  const entitlements = await prisma.entitlement.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      course: {
        include: {
          lessons: { orderBy: { order: "asc" }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="shell">
      <h1 className="page-title">คอร์สของฉัน</h1>
      <p className="page-lead">
        คอร์สที่เปิดด้วย license key แล้ว ·{" "}
        <Link href="/redeem">Redeem คีย์เพิ่ม</Link>
      </p>

      {entitlements.length === 0 ? (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            ยังไม่มีคอร์ส — ไป{" "}
            <Link href="/redeem">redeem license key</Link> หรือซื้อที่{" "}
            <a href="https://minutessharing.com/" target="_blank" rel="noreferrer">
              minutessharing.com
            </a>
          </p>
        </div>
      ) : (
        <div className="course-list">
          {entitlements.map((e) => (
            <Link
              key={e.id}
              href={`/learn/${e.course.slug}`}
              className="course-card"
            >
              <h3>{e.course.title}</h3>
              <p>{e.course.description ?? "เข้าเรียนต่อ"}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
