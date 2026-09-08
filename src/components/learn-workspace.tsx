"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { VideoPlayer } from "@/components/video-player";

export type LearnResource = {
  id: string;
  title: string;
};

export type LearnModule = {
  id: string;
  title: string;
  order: number;
};

export type LearnLesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  moduleId: string | null;
  durationSec: number | null;
  resources?: LearnResource[];
};

type Props = {
  courseTitle: string;
  courseSlug: string;
  lesson: LearnLesson;
  lessons: LearnLesson[];
  modules?: LearnModule[];
  completedLessonIds: string[];
  isAdmin?: boolean;
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

function lessonLabel(
  lessons: LearnLesson[],
  modules: LearnModule[],
  lessonId: string,
) {
  const sortedMods = [...modules].sort((a, b) => a.order - b.order);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return "—";

  if (lesson.moduleId) {
    const mi = sortedMods.findIndex((m) => m.id === lesson.moduleId);
    if (mi >= 0) {
      const inMod = lessons
        .filter((l) => l.moduleId === lesson.moduleId)
        .sort((a, b) => a.order - b.order);
      const li = inMod.findIndex((l) => l.id === lessonId);
      if (li >= 0) return `${mi + 1}.${li + 1}`;
    }
  }

  const orphans = lessons
    .filter((l) => !l.moduleId)
    .sort((a, b) => a.order - b.order);
  const oi = orphans.findIndex((l) => l.id === lessonId);
  if (oi >= 0 && sortedMods.length > 0) {
    return `${sortedMods.length + 1}.${oi + 1}`;
  }
  return String(lessons.findIndex((l) => l.id === lessonId) + 1).padStart(
    2,
    "0",
  );
}

export function LearnWorkspace({
  courseTitle,
  courseSlug,
  lesson,
  lessons,
  modules = [],
  completedLessonIds,
  isAdmin = false,
}: Props) {
  const toast = useToast();
  const sidebarRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [completed, setCompleted] = useState(
    () => new Set(completedLessonIds),
  );
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<Record<string, string>>({});
  const [openModuleKeys, setOpenModuleKeys] = useState<Set<string> | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"details" | "resources">("details");

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
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSidebarOpen(false); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const target = event.shiftKey ? items[items.length - 1] : items[0];
      if ((event.shiftKey && document.activeElement === items[0]) || (!event.shiftKey && document.activeElement === items[items.length - 1])) {
        event.preventDefault(); target?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [isDesktop, sidebarOpen]);

  const index = lessons.findIndex((l) => l.id === lesson.id);
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  const currentDone = completed.has(lesson.id);
  const nextUnlocked = next
    ? isAdmin || isUnlocked(lessons, next.id, completed)
    : false;
  const currentLabel = lessonLabel(lessons, modules, lesson.id);

  const filteredIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set(lessons.map((l) => l.id));
    return new Set(
      lessons.filter((l) => l.title.toLowerCase().includes(q)).map((l) => l.id),
    );
  }, [lessons, query]);

  const sidebarGroups = useMemo(() => {
    const sortedMods = [...modules].sort((a, b) => a.order - b.order);
    const groups: {
      key: string;
      title: string | null;
      moduleIndex: number | null;
      lessons: LearnLesson[];
    }[] = [];

    for (let mi = 0; mi < sortedMods.length; mi++) {
      const mod = sortedMods[mi];
      const items = lessons
        .filter((l) => l.moduleId === mod.id && filteredIds.has(l.id))
        .sort((a, b) => a.order - b.order);
      if (items.length === 0 && query.trim()) continue;
      if (items.length === 0 && !query.trim()) {
        groups.push({
          key: mod.id,
          title: mod.title,
          moduleIndex: mi + 1,
          lessons: [],
        });
        continue;
      }
      groups.push({
        key: mod.id,
        title: mod.title,
        moduleIndex: mi + 1,
        lessons: items,
      });
    }

    const orphans = lessons
      .filter((l) => !l.moduleId && filteredIds.has(l.id))
      .sort((a, b) => a.order - b.order);
    if (orphans.length > 0) {
      groups.push({
        key: "__none",
        title: sortedMods.length > 0 ? "อื่นๆ" : null,
        moduleIndex: sortedMods.length > 0 ? sortedMods.length + 1 : null,
        lessons: orphans,
      });
    }

    return groups;
  }, [lessons, modules, filteredIds, query]);

  const activeModuleKey = useMemo(() => {
    const group = sidebarGroups.find((g) =>
      g.lessons.some((l) => l.id === lesson.id),
    );
    return group?.key ?? null;
  }, [sidebarGroups, lesson.id]);

  function toggleModule(key: string) {
    setOpenModuleKeys((prev) => {
      const base = prev ?? new Set(activeModuleKey ? [activeModuleKey] : []);
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isModuleOpen(key: string, hasTitle: boolean) {
    if (!hasTitle) return true;
    if (query.trim()) return true;
    if (key === activeModuleKey) return true;
    return openModuleKeys?.has(key) ?? false;
  }

  const doneCount = lessons.filter((l) => completed.has(l.id)).length;
  const progressPct =
    lessons.length > 0 ? Math.round((doneCount / lessons.length) * 100) : 0;
  const ringOffset = 100 - progressPct;
  const resources = lesson.resources ?? [];

  function closeSidebarOnMobile() {
    if (!isDesktop) setSidebarOpen(false);
  }

  async function downloadResource(id: string) {
    // Open while the click still has user activation. Keep an ordinary link as
    // a fallback for browsers that block popups entirely.
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/learn/resources/${id}/download`, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!res.ok) {
        popup?.close();
        toast.error("ดาวน์โหลดไม่สำเร็จ", data.error);
        return;
      }
      const url = new URL(String(data.url));
      if (url.protocol !== "https:") throw new Error("Invalid download URL");
      setDownloadLinks((links) => ({ ...links, [id]: url.href }));
      if (popup) popup.location.replace(url.href);
      else toast.info("ไฟล์พร้อมแล้ว", "กดเปิดไฟล์ด้านล่างเพื่อดาวน์โหลด");
    } catch {
      popup?.close();
      toast.error("ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="learn-workspace page-enter">
      <header className="learn-topbar" aria-label="แถบควบคุมการเรียน">
        <div className="learn-topbar__left">
          <Link href="/library" className="learn-topbar__brand">
            MinutesLearn
          </Link>
          <div className="learn-topbar__titles">
            <p className="learn-topbar__course">
              <Link href={`/learn/${courseSlug}`}>{courseTitle}</Link>
              {isAdmin ? " · แอดมิน" : ""}
            </p>
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
            {sidebarOpen ? "ซ่อน" : "บทเรียน"}
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
          <nav className="learn-breadcrumb" aria-label="breadcrumb">
            <Link href="/library">คอร์สของฉัน</Link>
            <Icon name="chevron_right" size={16} className="learn-breadcrumb__sep" />
            <Link href={`/learn/${courseSlug}`}>{courseTitle}</Link>
            <Icon name="chevron_right" size={16} className="learn-breadcrumb__sep" />
            <span className="learn-breadcrumb__current">{lesson.title}</span>
          </nav>

          <VideoPlayer
            key={lesson.id}
            lessonId={lesson.id}
            compact
            alreadyCompleted={currentDone}
            onCompleted={() => {
              setCompleted((prevSet) => {
                const nextSet = new Set(prevSet);
                nextSet.add(lesson.id);
                return nextSet;
              });
              toast.ok("ผ่านบทนี้แล้ว", next ? "ไปบทถัดไปได้เลย" : "ครบทุกบทในคอร์ส");
            }}
          />
          <div className="learn-meta anim-rise">
            <div className="learn-meta__row">
              <span className="badge badge--current">บทที่ {currentLabel}</span>
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

            {resources.length > 0 && (
              <div className="learn-meta__tabs" role="tablist" aria-label="แท็บเนื้อหาบทเรียน">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "details"}
                  className={`learn-meta__tab${activeTab === "details" ? " is-active" : ""}`}
                  onClick={() => setActiveTab("details")}
                >
                  รายละเอียดเนื้อหา
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "resources"}
                  className={`learn-meta__tab${activeTab === "resources" ? " is-active" : ""}`}
                  onClick={() => setActiveTab("resources")}
                >
                  เอกสารประกอบ ({resources.length})
                </button>
              </div>
            )}

            {activeTab === "details" && (
              <div className="learn-meta__body">
                {lesson.description ? (
                  <p className="learn-meta__desc">{lesson.description}</p>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>ไม่มีคำอธิบายเพิ่มเติมสำหรับบทเรียนนี้</p>
                )}
              </div>
            )}

            {activeTab === "resources" && resources.length > 0 && (
              <div className="learn-resources">
                <p className="learn-resources__label">ไฟล์เอกสารประกอบ ({resources.length} รายการ)</p>
                <ul className="learn-resources__list">
                  {resources.map((r) => (
                    <li key={r.id} className="learn-resource-card">
                      <div className="learn-resource-card__info">
                        <span className="learn-resource-card__icon" aria-hidden>
                          <Icon name="description" size={20} />
                        </span>
                        <div>
                          <span className="learn-resource-card__title">{r.title}</span>
                          <span className="learn-resource-card__sub">เอกสารประกอบบทเรียน</span>
                        </div>
                      </div>
                      <div className="learn-resource-card__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={downloadingId === r.id}
                          onClick={() => void downloadResource(r.id)}
                        >
                          {downloadingId === r.id ? (
                            "กำลังเตรียมลิงก์..."
                          ) : (
                            <>
                              <Icon name="download" size={16} /> ดาวน์โหลด
                            </>
                          )}
                        </button>
                        {downloadLinks[r.id] && (
                          <a
                            className="btn btn--primary btn--sm"
                            href={downloadLinks[r.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            เปิดไฟล์ ↗
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!currentDone && !isAdmin && (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                ดูวิดีโอให้ถึงอย่างน้อย 90% เพื่อปลดล็อกบทถัดไป
              </p>
            )}
            {isAdmin && (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                โหมดแอดมิน — ข้ามการล็อกบทได้
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
            <aside ref={sidebarRef} className="learn-sidebar" aria-label="ลำดับการเรียน" role={isDesktop ? undefined : "dialog"} aria-modal={isDesktop ? undefined : true}>
              <div className="learn-sidebar__head">
                {!isDesktop && <button type="button" className="btn btn--ghost" onClick={() => setSidebarOpen(false)}>ปิดรายการบทเรียน</button>}
                <div>
                  <h2>เนื้อหาหลักสูตร</h2>
                  <p className="muted">
                    ความคืบหน้า: {doneCount}/{lessons.length} บท ({progressPct}%)
                  </p>
                </div>
                <div
                  className="learn-progress-ring"
                  aria-label={`ความคืบหน้า ${progressPct}%`}
                >
                  <svg viewBox="0 0 36 36" aria-hidden>
                    <circle
                      className="learn-progress-ring__track"
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      strokeWidth="4"
                    />
                    <circle
                      className="learn-progress-ring__value"
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      strokeWidth="4"
                      strokeDasharray="100"
                      strokeDashoffset={ringOffset}
                    />
                  </svg>
                  <span>{progressPct}%</span>
                </div>
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
                {sidebarGroups.map((group) => {
                  const hasTitle = Boolean(group.title);
                  const open = isModuleOpen(group.key, hasTitle);

                  return (
                  <div
                    key={group.key}
                    className={`learn-sidebar__group${open ? " is-open" : ""}`}
                  >
                    {hasTitle && (
                      <button
                        type="button"
                        className="learn-sidebar__module"
                        aria-expanded={open}
                        onClick={() => toggleModule(group.key)}
                      >
                        <span>
                          {group.moduleIndex != null
                            ? `${group.moduleIndex}. `
                            : ""}
                          {group.title}
                        </span>
                        <Icon
                          name={open ? "expand_less" : "expand_more"}
                          size={18}
                        />
                      </button>
                    )}
                    {open &&
                    group.lessons.map((l) => {
                      const active = l.id === lesson.id;
                      const unlocked =
                        isAdmin || isUnlocked(lessons, l.id, completed);
                      const done = completed.has(l.id);
                      const dur = formatDuration(l.durationSec);

                      if (!unlocked) {
                        return (
                          <div
                            key={l.id}
                            className="learn-sidebar__item learn-sidebar__item--locked"
                            aria-disabled
                          >
                            <span className="learn-sidebar__num">
                              <Icon name="lock" size={16} />
                            </span>
                            <span className="learn-sidebar__info">
                              <span className="learn-sidebar__name">
                                {l.title}
                              </span>
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
                            <Icon
                              name={
                                done
                                  ? "check_circle"
                                  : active
                                    ? "play_arrow"
                                    : "play_circle"
                              }
                              size={18}
                              filled={done || active}
                            />
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
                  </div>
                  );
                })}
                {filteredIds.size === 0 && (
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
