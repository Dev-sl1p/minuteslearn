"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { CoverImage } from "@/components/cover-image";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";

export type LibraryMaterialItem = {
  id: string;
  title: string;
  lessonId: string | null;
  lessonTitle: string;
  lessonOrder: number | null;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isExternal: boolean;
  order: number;
};

export type LibraryCourseItem = {
  key: string;
  courseId: string;
  slug: string;
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
  licenseKey: string | null;
  materials: LibraryMaterialItem[];
};

export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileTypeMeta(
  mimeType: string | null,
  title: string,
  isExternal: boolean,
): { icon: string; label: string; kind: string } {
  if (isExternal) {
    return { icon: "open_in_new", label: "LINK", kind: "link" };
  }

  const mime = (mimeType || "").toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (mime.includes("pdf") || lowerTitle.endsWith(".pdf")) {
    return { icon: "picture_as_pdf", label: "PDF", kind: "pdf" };
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("tar") ||
    mime.includes("rar") ||
    mime.includes("7z") ||
    lowerTitle.endsWith(".zip") ||
    lowerTitle.endsWith(".rar") ||
    lowerTitle.endsWith(".7z")
  ) {
    return { icon: "folder_zip", label: "ZIP", kind: "zip" };
  }
  if (
    mime.startsWith("image/") ||
    lowerTitle.endsWith(".png") ||
    lowerTitle.endsWith(".jpg") ||
    lowerTitle.endsWith(".jpeg") ||
    lowerTitle.endsWith(".psd") ||
    lowerTitle.endsWith(".ai")
  ) {
    return { icon: "image", label: "IMG", kind: "img" };
  }
  if (
    mime.startsWith("video/") ||
    lowerTitle.endsWith(".mp4") ||
    lowerTitle.endsWith(".mov") ||
    lowerTitle.endsWith(".mkv")
  ) {
    return { icon: "movie", label: "VIDEO", kind: "video" };
  }
  if (
    mime.startsWith("audio/") ||
    lowerTitle.endsWith(".mp3") ||
    lowerTitle.endsWith(".wav")
  ) {
    return { icon: "audio_file", label: "AUDIO", kind: "audio" };
  }
  if (
    lowerTitle.endsWith(".doc") ||
    lowerTitle.endsWith(".docx") ||
    lowerTitle.endsWith(".txt") ||
    lowerTitle.endsWith(".md")
  ) {
    return { icon: "description", label: "DOC", kind: "doc" };
  }
  if (
    lowerTitle.endsWith(".xls") ||
    lowerTitle.endsWith(".xlsx") ||
    lowerTitle.endsWith(".csv")
  ) {
    return { icon: "table_chart", label: "SHEET", kind: "sheet" };
  }

  return { icon: "attach_file", label: "FILE", kind: "file" };
}

type LibraryViewProps = {
  items: LibraryCourseItem[];
  continueItem: LibraryCourseItem | null;
  isAdmin: boolean;
  greeting: string;
};

export function LibraryView({
  items,
  continueItem,
  isAdmin,
  greeting,
}: LibraryViewProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"courses" | "materials">("courses");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [readyLinks, setReadyLinks] = useState<Record<string, string>>({});

  // Deep linking via hash or search params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const courseParam = params.get("course");

    if (hash === "#materials" || tabParam === "materials") {
      setActiveTab("materials");
    }
    if (courseParam) {
      const matched = items.find(
        (i) => i.courseId === courseParam || i.slug === courseParam,
      );
      if (matched) {
        setSelectedCourseFilter(matched.courseId);
      }
    }
  }, [items]);

  function switchTab(tab: "courses" | "materials", courseId?: string) {
    setActiveTab(tab);
    if (courseId) {
      setSelectedCourseFilter(courseId);
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = tab === "materials" ? "materials" : "";
      if (courseId && tab === "materials") {
        url.searchParams.set("course", courseId);
      } else {
        url.searchParams.delete("course");
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  // All materials flattened across courses
  const allMaterials = useMemo(() => {
    return items.flatMap((item) => item.materials);
  }, [items]);

  // Total materials count
  const totalMaterialsCount = allMaterials.length;

  // Filtered courses for materials tab
  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((course) => {
        if (selectedCourseFilter !== "all" && course.courseId !== selectedCourseFilter) {
          return false;
        }
        return true;
      })
      .map((course) => {
        const filteredMaterials = course.materials.filter((mat) => {
          if (!q) return true;
          return (
            mat.title.toLowerCase().includes(q) ||
            mat.lessonTitle.toLowerCase().includes(q) ||
            course.title.toLowerCase().includes(q)
          );
        });
        return {
          ...course,
          materials: filteredMaterials,
        };
      })
      .filter((course) => {
        // If searching, only show courses with matching materials
        if (q) return course.materials.length > 0;
        return true;
      });
  }, [items, selectedCourseFilter, searchQuery]);

  async function downloadResource(id: string) {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setDownloadingId(id);

    try {
      const res = await fetch(`/api/learn/resources/${id}/download`, {
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!res.ok) {
        popup?.close();
        toast.error("ดาวน์โหลดไม่สำเร็จ", data.error ?? "ไม่สามารถดาวน์โหลดไฟล์ได้");
        return;
      }

      const url = new URL(String(data.url));
      if (url.protocol !== "https:") throw new Error("Invalid download URL");

      setReadyLinks((prev) => ({ ...prev, [id]: url.href }));
      if (popup) {
        popup.location.replace(url.href);
      } else {
        toast.info("ไฟล์พร้อมแล้ว", "คลิกปุ่ม 'เปิดไฟล์' เพื่อเริ่มดาวน์โหลด");
      }
    } catch {
      popup?.close();
      toast.error("ดาวน์โหลดไม่สำเร็จ", "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="dash page-enter">
      <header className="dash__intro">
        <h1 className="page-title">
          {isAdmin ? "คอร์สทั้งหมด (แอดมิน)" : `ยินดีต้อนรับกลับมา, ${greeting}`}
        </h1>
        <p className="page-lead">
          {isAdmin ? (
            <>
              แอดมินเข้าเรียนและดาวน์โหลดเอกสารได้ทุกคอร์ส ·{" "}
              <Link href="/admin">ไปหลังบ้าน</Link>
            </>
          ) : (
            <>
              มีความคืบหน้าดี — มาเรียนต่อกันเถอะ ·{" "}
              <Link href="/redeem">เพิ่มคีย์</Link>
            </>
          )}
        </p>

        {/* Tab Navigation */}
        <div className="library-nav-bar" role="tablist" aria-label="แถบสลับมุมมอง">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "courses"}
            className={`library-tab-btn ${activeTab === "courses" ? "library-tab-btn--active" : ""}`}
            onClick={() => switchTab("courses")}
          >
            <Icon name="school" size={18} />
            <span>คอร์สเรียนของฉัน</span>
            <span className="library-tab-badge">{items.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "materials"}
            className={`library-tab-btn ${activeTab === "materials" ? "library-tab-btn--active" : ""}`}
            onClick={() => switchTab("materials")}
          >
            <Icon name="folder_zip" size={18} />
            <span>ไฟล์ประกอบการเรียน</span>
            <span className="library-tab-badge">{totalMaterialsCount}</span>
          </button>
        </div>
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
      ) : activeTab === "courses" ? (
        /* —— Courses View —— */
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
                  <div className="dash-continue__actions">
                    <Link
                      href={continueItem.continueHref}
                      className="btn btn--primary"
                    >
                      เรียนต่อ
                    </Link>
                    {continueItem.materials.length > 0 && (
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => switchTab("materials", continueItem.courseId)}
                      >
                        <Icon name="folder_zip" size={16} />
                        ไฟล์ประกอบ ({continueItem.materials.length})
                      </button>
                    )}
                  </div>
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
                <div
                  key={item.key}
                  className="course-card course-card--media anim-rise"
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                >
                  <Link href={item.href} className="course-card__thumb-link">
                    <div className="course-card__thumb">
                      {item.coverUrl ? (
                        <CoverImage src={item.coverUrl} />
                      ) : (
                        <div className="course-card__thumb-fallback" aria-hidden>
                          {item.title.slice(0, 1)}
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="course-card__body">
                    <div className="course-card__head">
                      <h3>
                        <Link href={item.href}>{item.title}</Link>
                      </h3>
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
                      {item.materials.length > 0 && (
                        <button
                          type="button"
                          className="course-card__material-btn"
                          title="ดูและดาวน์โหลดไฟล์ประกอบของคอร์สนี้"
                          onClick={() => switchTab("materials", item.courseId)}
                        >
                          <Icon name="folder_zip" size={15} />
                          <span>{item.materials.length} ไฟล์</span>
                        </button>
                      )}
                      <Link href={item.href} className="course-card__action">
                        {item.percent > 0 ? "เรียนต่อ" : "เริ่มเรียน"}
                        <Icon name="arrow_forward" size={16} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        /* —— Materials Hub View —— */
        <section className="material-hub anim-rise">
          {/* Hub Control Bar */}
          <div className="material-hub__banner panel">
            <div className="material-hub__banner-info">
              <h2>คลังไฟล์และเอกสารประกอบการเรียน</h2>
              <p>
                ดาวน์โหลดเอกสาร สไลด์ แบบฝึกหัด และไฟล์โปรเจกต์สำหรับคอร์สที่คุณมีสิทธิ์เข้าถึง (อิงตาม License Key)
              </p>
            </div>

            <div className="material-filter-bar">
              <div className="material-search-wrap">
                <Icon name="search" size={18} className="material-search-icon" />
                <input
                  type="search"
                  className="material-search-input"
                  placeholder="ค้นหาชื่อเอกสาร, บทเรียน, หรือคอร์ส..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="ค้นหาเอกสารประกอบ"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="material-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="ล้างคำค้นหา"
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>

              {/* Course filter pills */}
              <div className="material-pills" role="radiogroup" aria-label="กรองตามคอร์ส">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedCourseFilter === "all"}
                  className={`filter-chip ${selectedCourseFilter === "all" ? "filter-chip--active" : ""}`}
                  onClick={() => setSelectedCourseFilter("all")}
                >
                  ทั้งหมด ({totalMaterialsCount})
                </button>
                {items.map((course) => (
                  <button
                    key={course.courseId}
                    type="button"
                    role="radio"
                    aria-checked={selectedCourseFilter === course.courseId}
                    className={`filter-chip ${selectedCourseFilter === course.courseId ? "filter-chip--active" : ""}`}
                    onClick={() => setSelectedCourseFilter(course.courseId)}
                  >
                    {course.title} ({course.materials.length})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grouped Courses List */}
          {filteredCourses.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <Icon name="search_off" size={40} className="muted" />
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: "1.05rem" }}>
                ไม่พบไฟล์ประกอบที่ตรงกับคำค้นหา &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                style={{ marginTop: "0.5rem" }}
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCourseFilter("all");
                }}
              >
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          ) : (
            <div className="material-groups">
              {filteredCourses.map((course) => {
                const totalCourseBytes = course.materials.reduce(
                  (sum, m) => sum + (m.sizeBytes ?? 0),
                  0,
                );
                const formattedCourseSize = formatBytes(totalCourseBytes);

                return (
                  <article key={course.courseId} className="material-course-group panel">
                    {/* Course Group Header */}
                    <div className="material-course-header">
                      <div className="material-course-header__left">
                        <div className="material-course-thumb">
                          {course.coverUrl ? (
                            <CoverImage src={course.coverUrl} />
                          ) : (
                            <div className="material-course-thumb-fallback" aria-hidden>
                              {course.title.slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="material-course-title">
                            <Link href={course.href}>{course.title}</Link>
                          </h3>
                          <div className="material-course-meta">
                            <span className="license-pill">
                              <Icon name="vpn_key" size={13} />
                              {isAdmin
                                ? "สิทธิ์แอดมิน: ทุกคอร์ส"
                                : course.licenseKey
                                  ? `License: ${course.licenseKey}`
                                  : "สิทธิ์เปิดใช้งานแล้ว"}
                            </span>
                            <span className="material-count-pill">
                              {course.materials.length} ไฟล์
                              {formattedCourseSize ? ` · ${formattedCourseSize}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="material-course-header__right">
                        <Link href={course.continueHref} className="btn btn--outline btn--sm">
                          เข้าห้องเรียน <Icon name="arrow_forward" size={14} />
                        </Link>
                      </div>
                    </div>

                    {/* Materials List */}
                    {course.materials.length === 0 ? (
                      <div className="material-empty-box">
                        <Icon name="folder_open" size={24} className="muted" />
                        <span>คอร์สนี้ยังไม่มีไฟล์ประกอบในขณะนี้</span>
                      </div>
                    ) : (
                      <div className="material-list">
                        {course.materials.map((mat) => {
                          const meta = getFileTypeMeta(mat.mimeType, mat.title, mat.isExternal);
                          const formattedSize = formatBytes(mat.sizeBytes);
                          const isDownloading = downloadingId === mat.id;
                          const readyLink = readyLinks[mat.id];

                          return (
                            <div key={mat.id} className="material-row">
                              <div className="material-row__info">
                                <div className={`material-icon-box material-icon-box--${meta.kind}`}>
                                  <Icon name={meta.icon} size={22} />
                                </div>
                                <div className="material-row__titles">
                                  <div className="material-row__title-line">
                                    <span className="material-row__title">{mat.title}</span>
                                    <span className={`material-badge material-badge--${meta.kind}`}>
                                      {meta.label}
                                    </span>
                                  </div>
                                  <div className="material-row__sub">
                                    {mat.lessonOrder !== null ? (
                                      <span className="material-lesson-tag">
                                        บทที่ {mat.lessonOrder}: {mat.lessonTitle}
                                      </span>
                                    ) : (
                                      <span className="material-lesson-tag material-lesson-tag--course">
                                        <Icon name="layers" size={12} />
                                        {mat.lessonTitle || "ไฟล์รวมประจำคอร์ส"}
                                      </span>
                                    )}
                                    {formattedSize && (
                                      <span className="material-size-tag">
                                        · {formattedSize}
                                      </span>
                                    )}
                                    {mat.isExternal && (
                                      <span className="material-size-tag">
                                        · ลิงก์ภายนอก
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="material-row__actions">
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm material-download-btn"
                                  disabled={isDownloading}
                                  onClick={() => void downloadResource(mat.id)}
                                >
                                  {isDownloading ? (
                                    <>
                                      <Icon name="progress_activity" size={16} className="spin" />
                                      กำลังเตรียม...
                                    </>
                                  ) : (
                                    <>
                                      <Icon name={mat.isExternal ? "open_in_new" : "download"} size={16} />
                                      {mat.isExternal ? "เปิดลิงก์" : "ดาวน์โหลด"}
                                    </>
                                  )}
                                </button>

                                {readyLink && (
                                  <a
                                    className="btn btn--primary btn--sm"
                                    href={readyLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    เปิดไฟล์ ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
