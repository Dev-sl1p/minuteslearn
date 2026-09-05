"use client";

import { Icon } from "@/components/icon";

type Overview = {
  students: number;
  publishedCourses: number;
  draftCourses: number;
  activeLicenses: number;
  revokedLicenses: number;
  activeEntitlements: number;
  newStudents30d: number;
  redeem30d: number;
  completedLessons30d: number;
};

type DayPoint = { key: string; label: string; count: number };

type Enrollment = {
  id: string;
  email: string | null;
  name: string | null;
  courseTitle: string;
  status: string;
  redeemedAt: string;
};

type Activity = {
  id: string;
  type: string;
  message: string;
  at: string;
  status?: string;
};

type Props = {
  overview: Overview | null;
  redeemByDay: DayPoint[];
  recentEnrollments: Enrollment[];
  recentActivity: Activity[];
  onGoCourses: () => void;
  onGoAnalytics: () => void;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AdminOverview({
  overview,
  redeemByDay,
  recentEnrollments,
  recentActivity,
  onGoCourses,
  onGoAnalytics,
}: Props) {
  if (!overview) {
    return <p className="muted">กำลังโหลดภาพรวม...</p>;
  }

  const maxDay = Math.max(1, ...redeemByDay.map((d) => d.count));

  const cards = [
    {
      label: "นักเรียนทั้งหมด",
      value: overview.students,
      hint: `+${overview.newStudents30d} ใน 30 วัน`,
    },
    {
      label: "คอร์สที่เผยแพร่",
      value: overview.publishedCourses,
      hint: `${overview.draftCourses} ฉบับร่าง`,
    },
    {
      label: "คีย์ที่ใช้งานอยู่",
      value: overview.activeLicenses,
      hint: `${overview.revokedLicenses} ถูกระงับ`,
    },
    {
      label: "บทเรียนที่ผ่าน (30 วัน)",
      value: overview.completedLessons30d,
      hint: `${overview.redeem30d} ครั้งเปิดคีย์`,
    },
  ];

  return (
    <div className="admin-overview stack">
      <div className="admin-overview__head">
        <div>
          <h2 className="admin-section-title" style={{ marginBottom: 4 }}>
            ภาพรวมระบบ
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            สรุปนักเรียน คอร์ส และกิจกรรมล่าสุด
          </p>
        </div>
        <div className="admin-overview__actions">
          <button type="button" className="btn btn--ghost" onClick={onGoAnalytics}>
            วิเคราะห์ผู้เรียน
          </button>
          <button type="button" className="btn btn--primary" onClick={onGoCourses}>
            จัดการคอร์ส
          </button>
        </div>
      </div>

      <div className="admin-stat-grid admin-stat-grid--4">
        {cards.map((c, i) => (
          <article key={c.label} className="admin-stat-card">
            <div
              className={`admin-stat-card__icon ${
                ["admin-stat-card__icon--rose", "admin-stat-card__icon--red", "admin-stat-card__icon--gray", "admin-stat-card__icon--blue"][i]
              }`}
              aria-hidden
            >
              <Icon
                name={["group", "library_books", "vpn_key", "schedule"][i]!}
                size={22}
              />
            </div>
            <p className="admin-stat-card__label">{c.label}</p>
            <div className="admin-stat-card__value-row">
              <p className="admin-stat-card__value">
                {c.value.toLocaleString("th-TH")}
              </p>
              <span className="admin-stat-card__badge">{c.hint}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="admin-overview__split">
        <section className="panel">
          <h3 className="admin-section-title">กิจกรรมรายเดือน</h3>
          <div className="admin-bar-chart" role="img" aria-label="กราฟเปิดคีย์รายวัน">
            {redeemByDay.map((d) => (
              <div key={d.key} className="admin-bar-chart__col">
                <div
                  className="admin-bar-chart__bar"
                  style={{ height: `${Math.max(8, (d.count / maxDay) * 100)}%` }}
                  title={`${d.count}`}
                />
                <span>{d.label}</span>
                <strong>{d.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3 className="admin-section-title">การเคลื่อนไหวล่าสุด</h3>
          <ul className="admin-activity">
            {recentActivity.length === 0 && (
              <li className="muted">ยังไม่มีกิจกรรม</li>
            )}
            {recentActivity.map((a) => (
              <li key={a.id}>
                <span className="admin-activity__dot" aria-hidden />
                <div>
                  <p>{a.message}</p>
                  <span className="muted">{fmtTime(a.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel admin-directory">
        <div className="admin-directory__head">
          <h3 className="admin-section-title" style={{ margin: 0 }}>
            การลงทะเบียนล่าสุด
          </h3>
        </div>
        <div className="admin-directory__scroll">
          <table className="admin-directory__table">
            <thead>
              <tr>
                <th>ผู้เรียน</th>
                <th>คอร์ส</th>
                <th>วันที่</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {recentEnrollments.map((e) => {
                const label = e.name || e.email || "—";
                const initial = label.trim().slice(0, 1).toUpperCase();
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="admin-directory__student">
                        <span className="admin-directory__avatar" aria-hidden>
                          {initial}
                        </span>
                        <div>
                          <strong>{label}</strong>
                          {e.name && e.email ? (
                            <div className="muted admin-directory__id">{e.email}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>{e.courseTitle}</td>
                    <td>{fmtTime(e.redeemedAt)}</td>
                    <td>
                      <span
                        className={`badge ${e.status === "ACTIVE" ? "badge--ok" : "badge--bad"}`}
                      >
                        {e.status === "ACTIVE" ? "สำเร็จ" : e.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {recentEnrollments.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    ยังไม่มีข้อมูล redeem
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
