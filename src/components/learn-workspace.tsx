"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VideoPlayer } from "@/components/video-player";

export type LearnLesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  durationSec: number | null;
};

type Props = {
  courseTitle: string;
  courseSlug: string;
  lesson: LearnLesson;
  lessons: LearnLesson[];
  completedLessonIds: string[];
};

function formatDuration(sec: number | null) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isUnlocked(
  lessons: LearnLesson[],
  lessonId: string,
  completed: Set<string>,
) {
  const sorted = [...lessons].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === lessonId);
  if (idx <= 0) return true;
  return completed.has(sorted[idx - 1].id);
}

export function LearnWorkspace({
  courseTitle,
  courseSlug,
  lesson,
  lessons,
  completedLessonIds,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [completed, setCompleted] = useState(
    () => new Set(completedLessonIds),
  );

  useEffect(() => {
    setCompleted(new Set(completedLessonIds));
  }, [completedLessonIds]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 960px)");
    const sync = () => {
      setIsDesktop(mq.matches);
      setSidebarOpen(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (isDesktop || !sidebarOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDesktop, sidebarOpen]);

  const index = lessons.findIndex((l) => l.id === lesson.id);
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  const currentDone = completed.has(lesson.id);
  const nextUnlocked = next
    ? isUnlocked(lessons, next.id, completed)
    : false;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((l) => l.title.toLowerCase().includes(q));
  }, [lessons, query]);

  const doneCount = lessons.filter((l) => completed.has(l.id)).length;

  function closeSidebarOnMobile() {
    if (!isDesktop) setSidebarOpen(false);
  }

  return (
    <div className="learn-workspace">
      <header className="learn-topbar" aria-label="แถบควบคุมการเรียน">
        <div className="learn-topbar__left">
          <Link
            href={`/learn/${courseSlug}`}
            className="learn-topbar__back"
            title="กลับไปยังคอร์ส"
          >
            ←
          </Link>
          <div className="learn-topbar__titles">
            <p className="learn-topbar__course">{courseTitle}</p>
            <h1 className="learn-topbar__lesson">{lesson.title}</h1>
          </div>
        </div>
        <div className="learn-topbar__actions">
          <button
            type="button"
            className="btn btn--ghost learn-topbar__toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-pressed={sidebarOpen}
          >
            {sidebarOpen ? "ซ่อนบท" : "รายการบท"}
          </button>
          {next ? (
            nextUnlocked ? (
              <Link
                href={`/learn/${courseSlug}/${next.slug}`}
                className="btn btn--primary"
              >
                บทถัดไป →
              </Link>
            ) : (
              <button type="button" className="btn btn--ghost" disabled>
                ดูครบก่อน
              </button>
            )
          ) : (
            <Link href={`/learn/${courseSlug}`} className="btn btn--ghost">
              {currentDone ? "จบคอร์ส" : "ภาพรวมคอร์ส"}
            </Link>
          )}
        </div>
      </header>

      <div className={`learn-body ${sidebarOpen ? "" : "learn-body--wide"}`}>
        <section className="learn-main">
          <VideoPlayer
            lessonId={lesson.id}
            compact
            alreadyCompleted={currentDone}
            onCompleted={() => {
              setCompleted((prevSet) => {
                const nextSet = new Set(prevSet);
                nextSet.add(lesson.id);
                return nextSet;
              });
            }}
          />
          <div className="learn-meta">
            <div className="learn-meta__row">
              <span className="badge badge--current">
                บทที่ {String(index + 1).padStart(2, "0")}
              </span>
              {currentDone ? (
                <span className="badge badge--ok">ผ่านแล้ว</span>
              ) : (
                <span className="badge">ยังไม่ครบ</span>
              )}
              {formatDuration(lesson.durationSec) && (
                <span className="muted">{formatDuration(lesson.durationSec)}</span>
              )}
            </div>
            <h2 className="learn-meta__title">{lesson.title}</h2>
            {lesson.description && (
              <p className="learn-meta__desc">{lesson.description}</p>
            )}
            {!currentDone && (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                ดูวิดีโอให้ถึงอย่างน้อย 90% เพื่อปลดล็อกบทถัดไป
              </p>
            )}
            <div className="learn-meta__nav">
              {prev ? (
                <Link
                  href={`/learn/${courseSlug}/${prev.slug}`}
                  className="btn btn--ghost"
                >
                  ← บทก่อน
                </Link>
              ) : (
                <span />
              )}
              {next &&
                (nextUnlocked ? (
                  <Link
                    href={`/learn/${courseSlug}/${next.slug}`}
                    className="btn btn--ghost"
                  >
                    บทถัดไป →
                  </Link>
                ) : (
                  <button type="button" className="btn btn--ghost" disabled>
                    ล็อก — ดูครบก่อน
                  </button>
                ))}
            </div>
          </div>
        </section>

        {sidebarOpen && (
          <>
            {!isDesktop && (
              <button
                type="button"
                className="learn-sidebar-backdrop"
                aria-label="ปิดรายการบท"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <aside className="learn-sidebar" aria-label="ลำดับการเรียน">
              <div className="learn-sidebar__head">
                <h2>ลำดับการเรียน</h2>
                <p className="muted">
                  ผ่าน {doneCount}/{lessons.length}
                </p>
              </div>
              <input
                className="learn-sidebar__search"
                type="search"
                placeholder="ค้นหาบทเรียน..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="ค้นหาบทเรียน"
              />
              <nav className="learn-sidebar__list">
                {filtered.map((l, i) => {
                  const n = lessons.findIndex((x) => x.id === l.id) + 1 || i + 1;
                  const active = l.id === lesson.id;
                  const unlocked = isUnlocked(lessons, l.id, completed);
                  const done = completed.has(l.id);
                  const dur = formatDuration(l.durationSec);

                  if (!unlocked) {
                    return (
                      <div
                        key={l.id}
                        className="learn-sidebar__item learn-sidebar__item--locked"
                        aria-disabled
                      >
                        <span className="learn-sidebar__num">🔒</span>
                        <span className="learn-sidebar__info">
                          <span className="learn-sidebar__name">{l.title}</span>
                          <span className="learn-sidebar__dur">
                            ล็อก — ดูบทก่อนหน้าให้ครบ
                          </span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={l.id}
                      href={`/learn/${courseSlug}/${l.slug}`}
                      className="learn-sidebar__item"
                      data-active={active}
                      aria-current={active ? "page" : undefined}
                      onClick={closeSidebarOnMobile}
                    >
                      <span className="learn-sidebar__num">
                        {done ? "✓" : String(n).padStart(2, "0")}
                      </span>
                      <span className="learn-sidebar__info">
                        <span className="learn-sidebar__name">{l.title}</span>
                        <span className="learn-sidebar__dur">
                          {done ? "ผ่านแล้ว" : dur ?? "ยังไม่ครบ"}
                        </span>
                      </span>
                    </Link>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="muted" style={{ padding: "0.75rem" }}>
                    ไม่พบบทเรียน
                  </p>
                )}
              </nav>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
