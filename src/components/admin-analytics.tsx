"use client";

import { Icon } from "@/components/icon";

type CourseStat = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  learners: number;
  lessons: number;
  licenses: number;
  completedLessonEvents: number;
  completionRate: number;
};

type Student = {
  userId: string;
  email: string;
  name: string | null;
  courses: number;
  completedLessons: number;
};

type DayPoint = { key: string; label: string; count: number };

type Props = {
  courseStats: CourseStat[];
  topStudents: Student[];
  overview: {
    students: number;
    activeEntitlements: number;
    completedLessons30d: number;
    redeem30d: number;
  } | null;
  redeemByDay?: DayPoint[];
  onGoCourses?: () => void;
};

function initialOf(name: string | null, email: string) {
  const s = (name || email || "?").trim();
  return s.slice(0, 1).toUpperCase();
}

export function AdminAnalytics({
  courseStats,
  topStudents,
  overview,
  redeemByDay = [],
  onGoCourses,
}: Props) {
  if (!overview) {
    return <p className="muted">กำลังโหลดข้อมูล...</p>;
  }

  const avgCompletion =
    courseStats.length === 0
      ? 0
      : Math.round(
          courseStats.reduce((s, c) => s + c.completionRate, 0) /
            courseStats.length,
        );

  const topCourses = [...courseStats]
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5);

  const maxDay = Math.max(1, ...redeemByDay.map((d) => d.count));
  const chartDays =
    redeemByDay.length > 0
      ? redeemByDay
      : Array.from({ length: 7 }, (_, i) => ({
          key: String(i),
          label: ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"][i],
          count: 0,
        }));

  return (
    <div className="admin-analytics stack">
      <div className="admin-analytics__head">
        <div>
          <h2 className="admin-section-title" style={{ marginBottom: 4 }}>
            วิเคราะห์ผู้เรียน
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            สรุปความคืบหน้าและการมีส่วนร่วมของผู้เรียน
          </p>
        </div>
        <div className="admin-analytics__controls">
          <label className="admin-analytics__search">
            <span className="sr-only">ค้นหานักเรียน</span>
            <input type="search" placeholder="ค้นหานักเรียน..." disabled />
          </label>
          <button type="button" className="btn btn--ghost admin-analytics__range" disabled>
            30 วันล่าสุด
          </button>
        </div>
      </div>

      <div className="admin-stat-grid admin-stat-grid--4">
        <article className="admin-stat-card">
          <div className="admin-stat-card__icon admin-stat-card__icon--rose" aria-hidden>
            <Icon name="group" size={22} />
          </div>
          <p className="admin-stat-card__label">นักเรียนทั้งหมด</p>
          <div className="admin-stat-card__value-row">
            <p className="admin-stat-card__value">
              {overview.students.toLocaleString("th-TH")}
            </p>
            <span className="admin-stat-card__badge admin-stat-card__badge--up">
              สิทธิ์ใช้งาน {overview.activeEntitlements}
            </span>
          </div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-card__icon admin-stat-card__icon--red" aria-hidden>
            <Icon name="check_circle" size={22} />
          </div>
          <p className="admin-stat-card__label">อัตราเรียนจบเฉลี่ย</p>
          <div className="admin-stat-card__value-row">
            <p className="admin-stat-card__value">{avgCompletion}%</p>
            <span className="admin-stat-card__badge admin-stat-card__badge--up">
              จากทุกคอร์ส
            </span>
          </div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-card__icon admin-stat-card__icon--gray" aria-hidden>
            <Icon name="bar_chart" size={22} />
          </div>
          <p className="admin-stat-card__label">เปิดคีย์ (30 วัน)</p>
          <div className="admin-stat-card__value-row">
            <p className="admin-stat-card__value">
              {overview.redeem30d.toLocaleString("th-TH")}
            </p>
            <span className="admin-stat-card__badge">คงที่</span>
          </div>
        </article>
        <article className="admin-stat-card">
          <div className="admin-stat-card__icon admin-stat-card__icon--blue" aria-hidden>
            <Icon name="schedule" size={22} />
          </div>
          <p className="admin-stat-card__label">บทที่ผ่าน (30 วัน)</p>
          <div className="admin-stat-card__value-row">
            <p className="admin-stat-card__value">
              {overview.completedLessons30d.toLocaleString("th-TH")}
            </p>
            <span className="admin-stat-card__badge">ในช่วงนี้</span>
          </div>
        </article>
      </div>

      <div className="admin-analytics__split">
        <section className="panel admin-analytics__chart">
          <div className="admin-panel-head">
            <h3 className="admin-section-title" style={{ margin: 0 }}>
              แนวโน้มการเรียน
            </h3>
            <span className="muted" aria-hidden>
              ···
            </span>
          </div>
          {redeemByDay.length > 0 ? (
            <div
              className="admin-bar-chart admin-bar-chart--tall"
              role="img"
              aria-label="กราฟกิจกรรมเรียนรายวัน"
            >
              {chartDays.map((d) => (
                <div key={d.key} className="admin-bar-chart__col">
                  <div
                    className="admin-bar-chart__bar"
                    style={{
                      height: `${Math.max(8, (d.count / maxDay) * 100)}%`,
                    }}
                    title={`${d.count}`}
                  />
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-analytics__chart-frame muted">
              ยังไม่มีข้อมูลกราฟ
            </div>
          )}
        </section>

        <section className="panel admin-analytics__top-courses">
          <div className="admin-panel-head">
            <h3 className="admin-section-title" style={{ margin: 0 }}>
              คอร์สยอดนิยม
            </h3>
            <span className="admin-analytics__by">เรียงตามอัตราจบ</span>
          </div>
          <ul className="admin-top-course-list">
            {topCourses.map((c) => (
              <li key={c.id}>
                <div className="admin-top-course-list__meta">
                  <strong>{c.title}</strong>
                  <span>{c.completionRate}%</span>
                </div>
                <div className="admin-mini-progress">
                  <div style={{ width: `${c.completionRate}%` }} />
                </div>
              </li>
            ))}
            {topCourses.length === 0 && (
              <li className="muted">ยังไม่มีคอร์ส</li>
            )}
          </ul>
          {onGoCourses ? (
            <button
              type="button"
              className="btn btn--ghost admin-analytics__view-all"
              onClick={onGoCourses}
            >
              ดูคอร์สทั้งหมด
            </button>
          ) : null}
        </section>
      </div>

      <section className="panel admin-directory">
        <div className="admin-directory__head">
          <h3 className="admin-section-title" style={{ margin: 0 }}>
            รายชื่อผู้เรียน
          </h3>
          <button type="button" className="btn btn--ghost" disabled>
            กรอง
          </button>
        </div>
        <div className="admin-directory__scroll">
          <table className="admin-directory__table">
            <thead>
              <tr>
                <th>ผู้เรียน</th>
                <th>คอร์สที่เรียน</th>
                <th>ความคืบหน้า</th>
                <th>บทที่ผ่าน</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {topStudents.map((s) => {
                const progress = Math.min(
                  100,
                  Math.round((s.completedLessons / Math.max(1, s.courses * 5)) * 100),
                );
                return (
                  <tr key={s.userId}>
                    <td>
                      <div className="admin-directory__student">
                        <span className="admin-directory__avatar" aria-hidden>
                          {initialOf(s.name, s.email)}
                        </span>
                        <div>
                          <strong>{s.name || s.email}</strong>
                          <div className="muted admin-directory__id">
                            {s.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-directory__chip">
                        {s.courses} คอร์ส
                      </span>
                    </td>
                    <td>
                      <div className="admin-directory__progress">
                        <div className="admin-mini-progress">
                          <div style={{ width: `${progress}%` }} />
                        </div>
                        <span>{progress}%</span>
                      </div>
                    </td>
                    <td>
                      <strong>{s.completedLessons}</strong>
                    </td>
                    <td className="admin-directory__actions muted" aria-hidden>
                      <Icon name="chevron_right" size={18} />
                    </td>
                  </tr>
                );
              })}
              {topStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    ยังไม่มีข้อมูลความคืบหน้า
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="admin-directory__foot">
          <button type="button" className="btn btn--ghost" disabled>
            โหลดเพิ่ม
          </button>
        </div>
      </section>
    </div>
  );
}
