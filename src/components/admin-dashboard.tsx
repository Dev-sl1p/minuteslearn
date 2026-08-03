"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Lesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  streamAssetId: string | null;
  durationSec: number | null;
};

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  wooSku: string | null;
  wooProductId: string | null;
  published: boolean;
  lessons: Lesson[];
  _count: { entitlements: number; licenses: number };
};

type License = {
  id: string;
  key: string;
  status: string;
  redeemedAt: string;
  user: { email: string | null; name: string | null };
  course: { title: string; slug: string } | null;
};

type SecurityEvent = {
  id: string;
  type: string;
  severity: string;
  message: string;
  actorEmail: string | null;
  ip: string | null;
  createdAt: string;
};

type Tab = "courses" | "videos" | "licenses" | "security";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0e00-\u0e7f-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDuration(sec: number | null) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const emptyCourseForm = {
  id: "",
  title: "",
  slug: "",
  description: "",
  coverUrl: "",
  wooSku: "",
  wooProductId: "",
  published: true,
};

const emptyLessonForm = {
  id: "",
  courseId: "",
  title: "",
  slug: "",
  description: "",
  order: 1,
  streamAssetId: "",
  durationMin: "",
  durationSec: "",
};

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("courses");
  const [courses, setCourses] = useState<Course[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [courseForm, setCourseForm] = useState(emptyCourseForm);
  const [lessonForm, setLessonForm] = useState(emptyLessonForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  async function refresh() {
    const [c, l, s] = await Promise.all([
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/licenses").then((r) => r.json()),
      fetch("/api/admin/security").then((r) => r.json()),
    ]);
    if (c.courses) {
      setCourses(c.courses);
      if (!selectedCourseId && c.courses[0]) {
        setSelectedCourseId(c.courses[0].id);
      }
    }
    if (l.licenses) setLicenses(l.licenses);
    if (s.events) setSecurityEvents(s.events);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCourseId && courses[0]) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    setLessonForm((prev) => ({
      ...prev,
      courseId: selectedCourseId || prev.courseId,
      order: selectedCourse ? selectedCourse.lessons.length + 1 : prev.order,
    }));
  }, [selectedCourseId, selectedCourse]);

  function flash(ok: string | null, err: string | null = null) {
    setMessage(ok);
    setError(err);
  }

  function editCourse(course: Course) {
    setCourseForm({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description ?? "",
      coverUrl: course.coverUrl ?? "",
      wooSku: course.wooSku ?? "",
      wooProductId: course.wooProductId ?? "",
      published: course.published,
    });
    setSelectedCourseId(course.id);
    setTab("courses");
  }

  function resetCourseForm() {
    setCourseForm(emptyCourseForm);
  }

  function editLesson(lesson: Lesson) {
    const total = lesson.durationSec ?? 0;
    setLessonForm({
      id: lesson.id,
      courseId: selectedCourseId,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description ?? "",
      order: lesson.order,
      streamAssetId: lesson.streamAssetId ?? "",
      durationMin: total ? String(Math.floor(total / 60)) : "",
      durationSec: total ? String(total % 60) : "",
    });
    setTab("videos");
  }

  function resetLessonForm() {
    setLessonForm({
      ...emptyLessonForm,
      courseId: selectedCourseId,
      order: selectedCourse ? selectedCourse.lessons.length + 1 : 1,
    });
  }

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    flash(null);
    const res = await fetch("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: courseForm.id || undefined,
        title: courseForm.title,
        slug: courseForm.slug || slugify(courseForm.title),
        description: courseForm.description || null,
        coverUrl: courseForm.coverUrl || null,
        wooSku: courseForm.wooSku || null,
        wooProductId: courseForm.wooProductId || null,
        published: courseForm.published,
      }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      flash(null, data.error ?? "บันทึกคอร์สไม่สำเร็จ");
      return;
    }
    flash(courseForm.id ? "อัปเดตคอร์สแล้ว" : "สร้างคอร์สแล้ว");
    setSelectedCourseId(data.course.id);
    resetCourseForm();
    await refresh();
  }

  async function deleteCourse(id: string) {
    if (!confirm("ลบคอร์สและบทเรียนทั้งหมด?")) return;
    setPending(true);
    const res = await fetch(`/api/admin/courses?id=${id}`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) {
      const data = await res.json();
      flash(null, data.error ?? "ลบคอร์สไม่สำเร็จ");
      return;
    }
    flash("ลบคอร์สแล้ว");
    if (selectedCourseId === id) setSelectedCourseId("");
    if (courseForm.id === id) resetCourseForm();
    await refresh();
  }

  async function saveLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!lessonForm.courseId) {
      flash(null, "เลือกคอร์สก่อน");
      return;
    }
    setPending(true);
    flash(null);
    const mins = Number(lessonForm.durationMin || 0);
    const secs = Number(lessonForm.durationSec || 0);
    const durationSec =
      mins > 0 || secs > 0 ? Math.max(0, mins * 60 + secs) : null;

    const res = await fetch("/api/admin/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: lessonForm.id || undefined,
        courseId: lessonForm.courseId,
        title: lessonForm.title,
        slug: lessonForm.slug || slugify(lessonForm.title),
        description: lessonForm.description || null,
        order: Number(lessonForm.order) || 1,
        streamAssetId: lessonForm.streamAssetId || null,
        durationSec,
      }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      flash(null, data.error ?? "บันทึกวิดีโอไม่สำเร็จ");
      return;
    }
    flash(lessonForm.id ? "อัปเดตวิดีโอแล้ว" : "เพิ่มวิดีโอแล้ว");
    resetLessonForm();
    await refresh();
  }

  async function deleteLesson(id: string) {
    if (!confirm("ลบบทเรียนนี้?")) return;
    const res = await fetch(`/api/admin/lessons?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      flash(null, data.error ?? "ลบบทไม่สำเร็จ");
      return;
    }
    flash("ลบบทเรียนแล้ว");
    if (lessonForm.id === id) resetLessonForm();
    await refresh();
  }

  async function revoke(licenseId: string) {
    if (!confirm("ระงับ license และ entitlement นี้?")) return;
    const res = await fetch("/api/admin/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseId, revokeDevices: true }),
    });
    if (!res.ok) {
      const data = await res.json();
      flash(null, data.error ?? "ระงับไม่สำเร็จ");
      return;
    }
    flash("ระงับ license แล้ว");
    await refresh();
  }

  return (
    <div className="admin-cms stack">
      <div className="admin-tabs">
        {(
          [
            ["courses", "คอร์ส"],
            ["videos", "วิดีโอ / บทเรียน"],
            ["licenses", "Licenses"],
            ["security", "Security"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`admin-tab ${tab === id ? "admin-tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <p className="form-ok">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      {tab === "courses" && (
        <div className="admin-grid">
          <section className="panel">
            <h2 className="admin-section-title">
              {courseForm.id ? "แก้ไขคอร์ส" : "เพิ่มคอร์สใหม่"}
            </h2>
            <form className="form admin-form" onSubmit={saveCourse}>
              <label>
                ชื่อคอร์ส
                <input
                  required
                  value={courseForm.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setCourseForm((f) => ({
                      ...f,
                      title,
                      slug: f.id ? f.slug : slugify(title),
                    }));
                  }}
                />
              </label>
              <label>
                Slug (URL)
                <input
                  required
                  value={courseForm.slug}
                  onChange={(e) =>
                    setCourseForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  placeholder="react-mastery"
                />
              </label>
              <label>
                คำอธิบาย
                <textarea
                  rows={3}
                  value={courseForm.description}
                  onChange={(e) =>
                    setCourseForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </label>
              <label>
                Cover image URL (ถ้ามี)
                <input
                  value={courseForm.coverUrl}
                  onChange={(e) =>
                    setCourseForm((f) => ({ ...f, coverUrl: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </label>
              <div className="admin-form__row">
                <label>
                  Woo Product ID
                  <input
                    value={courseForm.wooProductId}
                    onChange={(e) =>
                      setCourseForm((f) => ({
                        ...f,
                        wooProductId: e.target.value,
                      }))
                    }
                    placeholder="123"
                  />
                </label>
                <label>
                  Woo SKU
                  <input
                    value={courseForm.wooSku}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, wooSku: e.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={courseForm.published}
                  onChange={(e) =>
                    setCourseForm((f) => ({
                      ...f,
                      published: e.target.checked,
                    }))
                  }
                />
                เผยแพร่คอร์ส (Published)
              </label>
              <div className="admin-form__actions">
                <button className="btn btn--primary" type="submit" disabled={pending}>
                  {courseForm.id ? "บันทึกการแก้ไข" : "สร้างคอร์ส"}
                </button>
                {courseForm.id && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={resetCourseForm}
                  >
                    ยกเลิกแก้ไข
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel">
            <h2 className="admin-section-title">คอร์สทั้งหมด ({courses.length})</h2>
            <div className="admin-course-list">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className={`admin-course-card ${
                    selectedCourseId === c.id ? "admin-course-card--active" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="admin-course-card__main"
                    onClick={() => setSelectedCourseId(c.id)}
                  >
                    <strong>{c.title}</strong>
                    <span className="muted">/{c.slug}</span>
                    <span className="admin-course-card__meta">
                      {c.lessons.length} บท · Redeem {c._count.licenses} ·{" "}
                      {c.published ? (
                        <span className="badge badge--ok">Published</span>
                      ) : (
                        <span className="badge">Draft</span>
                      )}
                    </span>
                    {(c.wooProductId || c.wooSku) && (
                      <span className="muted">
                        Woo: {c.wooProductId ?? "—"} / {c.wooSku ?? "—"}
                      </span>
                    )}
                  </button>
                  <div className="admin-course-card__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => editCourse(c)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        setSelectedCourseId(c.id);
                        setTab("videos");
                      }}
                    >
                      วิดีโอ
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => deleteCourse(c.id)}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
              {courses.length === 0 && (
                <p className="muted">ยังไม่มีคอร์ส — สร้างทางซ้ายได้เลย</p>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "videos" && (
        <div className="admin-grid">
          <section className="panel">
            <h2 className="admin-section-title">
              {lessonForm.id ? "แก้ไขวิดีโอ" : "เพิ่มวิดีโอ / บทเรียน"}
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              ใส่ลิงก์วิดีโอแบบ <code>https://...</code> (MP4 / HLS) หรือ Mux /
              Cloudflare asset id — ห้ามใช้ http:// หรือ javascript:
            </p>
            <form className="form admin-form" onSubmit={saveLesson}>
              <label>
                คอร์ส
                <select
                  required
                  value={lessonForm.courseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    setLessonForm((f) => ({ ...f, courseId: e.target.value }));
                  }}
                >
                  <option value="" disabled>
                    เลือกคอร์ส
                  </option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ชื่อบท / ชื่อวิดีโอ
                <input
                  required
                  value={lessonForm.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setLessonForm((f) => ({
                      ...f,
                      title,
                      slug: f.id ? f.slug : slugify(title),
                    }));
                  }}
                />
              </label>
              <label>
                Slug
                <input
                  required
                  value={lessonForm.slug}
                  onChange={(e) =>
                    setLessonForm((f) => ({ ...f, slug: e.target.value }))
                  }
                />
              </label>
              <label>
                คำอธิบายบท
                <textarea
                  rows={2}
                  value={lessonForm.description}
                  onChange={(e) =>
                    setLessonForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                ลิงก์วิดีโอ / Stream asset ID
                <input
                  value={lessonForm.streamAssetId}
                  onChange={(e) =>
                    setLessonForm((f) => ({
                      ...f,
                      streamAssetId: e.target.value,
                    }))
                  }
                  placeholder="https://.../video.mp4 หรือ https://.../video.m3u8"
                />
              </label>
              <div className="admin-form__row">
                <label>
                  ลำดับ
                  <input
                    type="number"
                    min={1}
                    value={lessonForm.order}
                    onChange={(e) =>
                      setLessonForm((f) => ({
                        ...f,
                        order: Number(e.target.value) || 1,
                      }))
                    }
                  />
                </label>
                <label>
                  นาที
                  <input
                    type="number"
                    min={0}
                    value={lessonForm.durationMin}
                    onChange={(e) =>
                      setLessonForm((f) => ({
                        ...f,
                        durationMin: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  วินาที
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={lessonForm.durationSec}
                    onChange={(e) =>
                      setLessonForm((f) => ({
                        ...f,
                        durationSec: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="admin-form__actions">
                <button className="btn btn--primary" type="submit" disabled={pending}>
                  {lessonForm.id ? "บันทึกวิดีโอ" : "เพิ่มวิดีโอ"}
                </button>
                {lessonForm.id && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={resetLessonForm}
                  >
                    ยกเลิกแก้ไข
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="admin-sidebar-head">
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                บทในคอร์ส
              </h2>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedCourse ? (
              <>
                <p className="muted">
                  {selectedCourse.title} · {selectedCourse.lessons.length} บท
                  {selectedCourse.lessons[0] && (
                    <>
                      {" "}
                      ·{" "}
                      <Link
                        href={`/learn/${selectedCourse.slug}/${selectedCourse.lessons[0].slug}`}
                      >
                        เปิดหน้าเรียน
                      </Link>
                    </>
                  )}
                </p>
                <div className="admin-lesson-list">
                  {selectedCourse.lessons.map((l) => (
                    <div key={l.id} className="admin-lesson-row">
                      <div>
                        <strong>
                          {String(l.order).padStart(2, "0")}. {l.title}
                        </strong>
                        <div className="muted">
                          {formatDuration(l.durationSec)} ·{" "}
                          {l.streamAssetId ? (
                            <code className="admin-code">
                              {l.streamAssetId.slice(0, 48)}
                              {l.streamAssetId.length > 48 ? "…" : ""}
                            </code>
                          ) : (
                            <span className="badge badge--bad">ยังไม่มีวิดีโอ</span>
                          )}
                        </div>
                      </div>
                      <div className="admin-course-card__actions">
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => editLesson(l)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => deleteLesson(l.id)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                  {selectedCourse.lessons.length === 0 && (
                    <p className="muted">ยังไม่มีบท — เพิ่มวิดีโอทางซ้าย</p>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">สร้างคอร์สก่อน แล้วค่อยเพิ่มวิดีโอ</p>
            )}
          </section>
        </div>
      )}

      {tab === "licenses" && (
        <section className="panel" style={{ overflowX: "auto" }}>
          <h2 className="admin-section-title">Licenses / Revoke</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>ผู้ใช้</th>
                <th>คอร์ส</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {licenses.map((l) => (
                <tr key={l.id}>
                  <td>
                    <code>{l.key}</code>
                  </td>
                  <td>{l.user.email}</td>
                  <td>{l.course?.title ?? "—"}</td>
                  <td>
                    <span
                      className={`badge ${
                        l.status === "ACTIVE" ? "badge--ok" : "badge--bad"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td>
                    {l.status === "ACTIVE" && (
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => revoke(l.id)}
                      >
                        ระงับ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {licenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    ยังไม่มี license ที่ redeem
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === "security" && (
        <section className="panel" style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <h2 className="admin-section-title" style={{ margin: 0 }}>
              Security events
            </h2>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void refresh()}
            >
              รีเฟรช
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            บันทึก login / redeem / งานแอดมิน — ตั้ง SECURITY_WEBHOOK_URL
            เพื่อแจ้งเตือน warn/critical
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ระดับ</th>
                <th>ประเภท</th>
                <th>ข้อความ</th>
                <th>ผู้เกี่ยวข้อง</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {securityEvents.map((e) => (
                <tr key={e.id}>
                  <td>
                    {new Date(e.createdAt).toLocaleString("th-TH", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        e.severity === "critical"
                          ? "badge--bad"
                          : e.severity === "warn"
                            ? "badge--bad"
                            : "badge--ok"
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td>
                    <code>{e.type}</code>
                  </td>
                  <td>{e.message}</td>
                  <td>{e.actorEmail ?? "—"}</td>
                  <td>{e.ip ?? "—"}</td>
                </tr>
              ))}
              {securityEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    ยังไม่มีเหตุการณ์
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
