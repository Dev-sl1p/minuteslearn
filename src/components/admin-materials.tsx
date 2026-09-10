"use client";

import { useState, useMemo, useRef } from "react";
import { Icon } from "@/components/icon";
import { formatBytes, getFileTypeMeta } from "@/components/library-view";

export type AdminLessonResource = {
  id: string;
  courseId?: string | null;
  lessonId?: string | null;
  title: string;
  storagePath: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  order: number;
};

export type AdminLesson = {
  id: string;
  title: string;
  slug: string;
  order: number;
  resources: AdminLessonResource[];
};

export type AdminCourse = {
  id: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  lessons: AdminLesson[];
  resources?: AdminLessonResource[];
};

export type AdminMaterialTarget =
  | string
  | { courseId: string; lessonId?: string | null };

type AdminMaterialsProps = {
  courses: AdminCourse[];
  initialCourseId?: string;
  onUploadResource: (
    file: File,
    target: AdminMaterialTarget,
    title?: string,
  ) => Promise<void>;
  onAddResourceLink: (
    target: AdminMaterialTarget,
    title: string,
    url: string,
  ) => Promise<void>;
  onDeleteResource: (id: string) => Promise<void>;
  onGoCurriculum: (courseId: string) => void;
  pending: boolean;
};

export function AdminMaterials({
  courses,
  initialCourseId,
  onUploadResource,
  onAddResourceLink,
  onDeleteResource,
  onGoCurriculum,
  pending,
}: AdminMaterialsProps) {
  // Course selection for adding material
  const [targetCourseId, setTargetCourseId] = useState<string>(() => {
    if (initialCourseId && courses.some((c) => c.id === initialCourseId)) {
      return initialCourseId;
    }
    return courses[0]?.id ?? "";
  });

  const activeTargetCourse = useMemo(() => {
    return courses.find((c) => c.id === targetCourseId) ?? courses[0] ?? null;
  }, [courses, targetCourseId]);

  // Choice: "lesson" (ลงในบทเรียน) vs "course" (ลงไม่ผูกกับบทเรียน)
  const [attachmentScope, setAttachmentScope] = useState<"lesson" | "course">(
    () => {
      if (activeTargetCourse && activeTargetCourse.lessons.length > 0) {
        return "lesson";
      }
      return "course";
    },
  );

  const [targetLessonId, setTargetLessonId] = useState<string>(() => {
    return activeTargetCourse?.lessons[0]?.id ?? "";
  });

  // Keep lesson selection valid when course changes
  const currentCourseLessonIds = useMemo(() => {
    return new Set(activeTargetCourse?.lessons.map((l) => l.id) ?? []);
  }, [activeTargetCourse]);

  const effectiveLessonId = currentCourseLessonIds.has(targetLessonId)
    ? targetLessonId
    : activeTargetCourse?.lessons[0]?.id ?? "";

  // Mode: upload vs link
  const [materialMode, setMaterialMode] = useState<"upload" | "link">("upload");
  const [titleInput, setTitleInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter and search state for the materials library table
  const [filterCourseId, setFilterCourseId] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<"all" | "course" | "lesson">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Flatten all materials across all courses (both course-level and lesson-level)
  const allMaterials = useMemo(() => {
    const list: Array<{
      resource: AdminLessonResource;
      courseId: string;
      courseTitle: string;
      courseSlug: string;
      lessonId: string | null;
      lessonTitle: string;
      lessonOrder: number | null;
      isCourseLevel: boolean;
    }> = [];

    for (const c of courses) {
      // 1. Course-level resources (resources attached directly without lesson)
      if (c.resources) {
        for (const r of c.resources) {
          if (!r.lessonId) {
            list.push({
              resource: r,
              courseId: c.id,
              courseTitle: c.title,
              courseSlug: c.slug,
              lessonId: null,
              lessonTitle: "ไฟล์รวมประจำคอร์ส",
              lessonOrder: null,
              isCourseLevel: true,
            });
          }
        }
      }

      // 2. Lesson-level resources
      for (const l of c.lessons) {
        for (const r of l.resources) {
          list.push({
            resource: r,
            courseId: c.id,
            courseTitle: c.title,
            courseSlug: c.slug,
            lessonId: l.id,
            lessonTitle: l.title,
            lessonOrder: l.order,
            isCourseLevel: false,
          });
        }
      }
    }
    return list;
  }, [courses]);

  // Total size across all materials
  const totalSizeBytes = useMemo(() => {
    return allMaterials.reduce((acc, m) => acc + (m.resource.sizeBytes ?? 0), 0);
  }, [allMaterials]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allMaterials.filter((item) => {
      if (filterCourseId !== "all" && item.courseId !== filterCourseId) {
        return false;
      }
      if (filterScope === "course" && !item.isCourseLevel) {
        return false;
      }
      if (filterScope === "lesson" && item.isCourseLevel) {
        return false;
      }
      if (q) {
        return (
          item.resource.title.toLowerCase().includes(q) ||
          item.courseTitle.toLowerCase().includes(q) ||
          item.lessonTitle.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allMaterials, filterCourseId, filterScope, searchQuery]);

  function handleCourseChange(newCourseId: string) {
    setTargetCourseId(newCourseId);
    const course = courses.find((c) => c.id === newCourseId);
    if (course?.lessons && course.lessons.length > 0) {
      setTargetLessonId(course.lessons[0].id);
    } else {
      setTargetLessonId("");
      setAttachmentScope("course");
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!titleInput.trim()) {
        setTitleInput(file.name.replace(/\.[^.]+$/, ""));
      }
    }
  }

  async function handleSubmitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !activeTargetCourse) return;
    if (attachmentScope === "lesson" && !effectiveLessonId) return;

    const target: AdminMaterialTarget =
      attachmentScope === "lesson"
        ? { courseId: activeTargetCourse.id, lessonId: effectiveLessonId }
        : { courseId: activeTargetCourse.id, lessonId: null };

    await onUploadResource(selectedFile, target, titleInput.trim());
    setSelectedFile(null);
    setTitleInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTargetCourse || !titleInput.trim() || !urlInput.trim()) return;
    if (attachmentScope === "lesson" && !effectiveLessonId) return;

    const target: AdminMaterialTarget =
      attachmentScope === "lesson"
        ? { courseId: activeTargetCourse.id, lessonId: effectiveLessonId }
        : { courseId: activeTargetCourse.id, lessonId: null };

    await onAddResourceLink(target, titleInput.trim(), urlInput.trim());
    setTitleInput("");
    setUrlInput("");
  }

  const isFormDisabled =
    pending ||
    !activeTargetCourse ||
    (attachmentScope === "lesson" && !effectiveLessonId);

  return (
    <div className="admin-materials-view stack">
      <div className="admin-materials-grid">
        {/* Left Column: Add Material Form */}
        <section className="panel admin-materials-form-panel">
          <div className="admin-materials-form-head">
            <div className="admin-materials-icon-badge" aria-hidden>
              <Icon name="upload_file" size={24} />
            </div>
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                เพิ่มไฟล์ประกอบ (Add Material)
              </h2>
              <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                อัปโหลดไฟล์หรือแนบลิงก์ให้ผู้เรียนดาวน์โหลด
              </p>
            </div>
          </div>

          <div className="admin-materials-form-body">
            {/* Step 1: Select Target Course */}
            <div className="admin-form-step">
              <label className="admin-field-label">
                <span className="admin-step-label">
                  <span className="admin-step-num">1</span>
                  เลือกคอร์สเรียนเป้าหมาย (Target Course) *
                </span>
                <select
                  className="admin-select"
                  value={targetCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  disabled={pending || courses.length === 0}
                >
                  {courses.length === 0 ? (
                    <option value="">ยังไม่มีคอร์สในระบบ</option>
                  ) : (
                    courses.map((c) => {
                      const courseTotal =
                        (c.resources?.filter((r) => !r.lessonId).length ?? 0) +
                        c.lessons.reduce((s, l) => s + l.resources.length, 0);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.lessons.length} บท · มีแล้ว {courseTotal} ไฟล์)
                        </option>
                      );
                    })
                  )}
                </select>
              </label>
            </div>

            {/* Step 2: Attachment Scope Choice (ลงในบทเรียน VS ลงไม่ผูกกับบทเรียน) */}
            <div className="admin-form-step">
              <label className="admin-field-label">
                <span className="admin-step-label">
                  <span className="admin-step-num">2</span>
                  เลือกการผูกบทเรียน (Attachment Scope) *
                </span>
              </label>

              <div className="admin-scope-choices" role="radiogroup" aria-label="ขอบเขตการแนบไฟล์">
                {/* Choice A: ลงในบทเรียน */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={attachmentScope === "lesson"}
                  className={`admin-scope-card ${
                    attachmentScope === "lesson" ? "admin-scope-card--selected" : ""
                  }`}
                  onClick={() => setAttachmentScope("lesson")}
                  disabled={pending}
                >
                  <div className="admin-scope-card__icon">
                    <Icon name="play_lesson" size={20} />
                  </div>
                  <div className="admin-scope-card__text">
                    <div className="admin-scope-card__title-row">
                      <span className="admin-scope-card__title">ลงในบทเรียน</span>
                      <span className="admin-scope-card__radio-dot" />
                    </div>
                    <span className="admin-scope-card__desc">
                      ผูกกับบทเรียนที่ระบุ แสดงทั้งในหน้าเรียนบทนั้นและคลังไฟล์
                    </span>
                  </div>
                </button>

                {/* Choice B: ลงไม่ผูกกับบทเรียน (ไฟล์รวมประจำคอร์ส) */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={attachmentScope === "course"}
                  className={`admin-scope-card ${
                    attachmentScope === "course" ? "admin-scope-card--selected" : ""
                  }`}
                  onClick={() => setAttachmentScope("course")}
                  disabled={pending}
                >
                  <div className="admin-scope-card__icon admin-scope-card__icon--course">
                    <Icon name="inventory_2" size={20} />
                  </div>
                  <div className="admin-scope-card__text">
                    <div className="admin-scope-card__title-row">
                      <span className="admin-scope-card__title">ลงไม่ผูกกับบทเรียน</span>
                      <span className="admin-scope-card__radio-dot" />
                    </div>
                    <span className="admin-scope-card__desc">
                      เป็นไฟล์รวมส่วนกลางของคอร์ส นักเรียนดาวน์โหลดได้จากหน้าคลังไฟล์
                    </span>
                  </div>
                </button>
              </div>

              {/* Dynamic Sub-selector based on Choice */}
              {attachmentScope === "lesson" ? (
                activeTargetCourse && activeTargetCourse.lessons.length > 0 ? (
                  <div className="admin-lesson-selector-wrap anim-rise">
                    <label className="admin-field-label">
                      <span>ระบุบทเรียนที่ต้องการแนบไฟล์ (Select Lesson) *</span>
                      <select
                        className="admin-select"
                        value={effectiveLessonId}
                        onChange={(e) => setTargetLessonId(e.target.value)}
                        disabled={pending}
                      >
                        {activeTargetCourse.lessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            บทที่ {l.order}: {l.title} (มีแล้ว {l.resources.length} ไฟล์)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="admin-notice admin-notice--warn anim-rise">
                    <Icon name="info" size={20} />
                    <div style={{ flex: 1 }}>
                      <strong>คอร์สนี้ยังไม่มีบทเรียน</strong>
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                        คุณสามารถเลือก <strong>&ldquo;ลงไม่ผูกกับบทเรียน&rdquo;</strong> เพื่อเพิ่มไฟล์ส่วนกลางประจำคอร์สได้ทันที
                        หรือไปสร้างบทเรียนในหน้าโครงสร้างบทเรียน
                      </p>
                      {activeTargetCourse && (
                        <button
                          type="button"
                          className="btn btn--outline btn--sm"
                          style={{ marginTop: "0.5rem" }}
                          onClick={() => onGoCurriculum(activeTargetCourse.id)}
                        >
                          ไปที่โครงสร้างบทเรียน ↗
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="admin-scope-callout anim-rise">
                  <Icon name="check_circle" size={18} />
                  <span>
                    จะบันทึกเป็น <strong>ไฟล์รวมประจำคอร์ส: {activeTargetCourse?.title ?? "—"}</strong>{" "}
                    (ผู้เรียนที่ปลดล็อกคอร์สนี้จะโหลดได้จากแท็บคลังไฟล์)
                  </span>
                </div>
              )}
            </div>

            {/* Step 3: Upload vs External Link Toggle & Form */}
            <div className="admin-form-step">
              <label className="admin-field-label">
                <span className="admin-step-label">
                  <span className="admin-step-num">3</span>
                  เลือกรูปแบบไฟล์ (Upload or Link) *
                </span>
              </label>

              <div className="admin-mode-toggle" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={materialMode === "upload"}
                  className={`admin-mode-btn ${
                    materialMode === "upload" ? "admin-mode-btn--active" : ""
                  }`}
                  onClick={() => setMaterialMode("upload")}
                  title="อัปโหลดไฟล์ตรงเข้า Supabase Storage (สูงสุด 150MB)"
                >
                  <Icon name="cloud_upload" size={17} />
                  <span>อัปโหลดไฟล์</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={materialMode === "link"}
                  className={`admin-mode-btn ${
                    materialMode === "link" ? "admin-mode-btn--active" : ""
                  }`}
                  onClick={() => setMaterialMode("link")}
                  title="ใส่ลิงก์ไฟล์ภายนอก เช่น Google Drive, Figma, GitHub"
                >
                  <Icon name="link" size={17} />
                  <span>แนบลิงก์</span>
                </button>
              </div>

              {materialMode === "upload" ? (
                /* Form: Upload File */
                <form className="form admin-form" onSubmit={handleSubmitUpload}>
                  <label className="admin-field-label">
                    <span>ชื่อไฟล์ / หัวข้อเอกสาร (Title)</span>
                    <input
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="เช่น เอกสารสรุปเนื้อหา / Project Starter Pack"
                      disabled={pending}
                    />
                  </label>

                  <div className="admin-file-dropzone">
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="admin-material-file"
                      className="admin-file-input-hidden"
                      onChange={handleFileSelected}
                      disabled={pending}
                    />
                    <label htmlFor="admin-material-file" className="admin-dropzone-label">
                      <div className="admin-dropzone-icon-circle">
                        <Icon name="cloud_upload" size={28} />
                      </div>
                      {selectedFile ? (
                        <div className="admin-dropzone-selected-info">
                          <p className="admin-dropzone-filename">{selectedFile.name}</p>
                          <p className="admin-dropzone-sub">
                            ขนาด: {formatBytes(selectedFile.size)} · คลิกเพื่อเปลี่ยนไฟล์
                          </p>
                        </div>
                      ) : (
                        <div className="admin-dropzone-placeholder">
                          <p className="admin-dropzone-main-text">
                            คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
                          </p>
                          <p className="admin-dropzone-sub">
                            รองรับ PDF, ZIP, PSD, AI, Word, Excel, รูปภาพ (สูงสุด 150MB)
                          </p>
                        </div>
                      )}
                    </label>
                  </div>

                  <div className="admin-form__actions" style={{ marginTop: "1rem" }}>
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={isFormDisabled || !selectedFile}
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      <Icon name="cloud_upload" size={17} />
                      {pending
                        ? "กำลังอัปโหลด..."
                        : attachmentScope === "course"
                          ? "อัปโหลดเป็นไฟล์รวมคอร์ส"
                          : "อัปโหลดเข้าบทเรียนนี้"}
                    </button>
                  </div>
                </form>
              ) : (
                /* Form: External Link */
                <form className="form admin-form" onSubmit={handleSubmitLink}>
                  <label className="admin-field-label">
                    <span>ชื่อไฟล์ / หัวข้อเอกสาร (Title) *</span>
                    <input
                      required
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="เช่น ลิงก์ Google Drive รวมไฟล์ Project"
                      disabled={pending}
                    />
                  </label>

                  <label className="admin-field-label">
                    <span>ลิงก์ภายนอก (HTTPS URL) *</span>
                    <input
                      required
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://drive.google.com/... หรือ https://github.com/..."
                      disabled={pending}
                    />
                  </label>

                  <div className="admin-form__actions" style={{ marginTop: "1rem" }}>
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={isFormDisabled || !titleInput.trim() || !urlInput.trim()}
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      <Icon name="add_link" size={17} />
                      {pending
                        ? "กำลังบันทึก..."
                        : attachmentScope === "course"
                          ? "บันทึกลิงก์เป็นไฟล์รวมคอร์ส"
                          : "บันทึกลิงก์เข้าบทเรียนนี้"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: All Materials Library Hub */}
        <section className="panel admin-materials-list-panel">
          <div className="admin-materials-list-head">
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                คลังไฟล์ประกอบทั้งหมดในระบบ
              </h2>
              <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                รวมไฟล์และเอกสารของทุกคอร์ส ทั้งไฟล์รวมและไฟล์ประจำบทเรียน
              </p>
            </div>

            {/* Quick stats pills */}
            <div className="admin-materials-stats-row">
              <div className="admin-materials-stat-pill">
                <Icon name="folder_zip" size={16} />
                <span>{allMaterials.length} ไฟล์</span>
              </div>
              {totalSizeBytes > 0 && (
                <div className="admin-materials-stat-pill">
                  <Icon name="database" size={16} />
                  <span>{formatBytes(totalSizeBytes)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="admin-materials-filter-bar">
            {/* Filter by Course */}
            <div className="admin-materials-filter-item">
              <label
                htmlFor="admin-filter-course"
                className="muted"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                คอร์ส:
              </label>
              <select
                id="admin-filter-course"
                className="admin-select admin-select--sm"
                value={filterCourseId}
                onChange={(e) => setFilterCourseId(e.target.value)}
              >
                <option value="all">ทุกคอร์ส ({allMaterials.length})</option>
                {courses.map((c) => {
                  const courseCount =
                    (c.resources?.filter((r) => !r.lessonId).length ?? 0) +
                    c.lessons.reduce((s, l) => s + l.resources.length, 0);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.title} ({courseCount})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Filter by Scope */}
            <div className="admin-materials-filter-item">
              <label
                htmlFor="admin-filter-scope"
                className="muted"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                ประเภท:
              </label>
              <select
                id="admin-filter-scope"
                className="admin-select admin-select--sm"
                value={filterScope}
                onChange={(e) =>
                  setFilterScope(e.target.value as "all" | "course" | "lesson")
                }
              >
                <option value="all">ทั้งหมด</option>
                <option value="course">📁 ไฟล์รวมคอร์ส</option>
                <option value="lesson">🎬 ในบทเรียน</option>
              </select>
            </div>

            {/* Real-time search */}
            <div className="admin-materials-search-item">
              <div className="admin-search-input-wrap">
                <Icon name="search" size={16} className="admin-search-icon" />
                <input
                  type="search"
                  className="admin-search-input"
                  placeholder="ค้นหาชื่อไฟล์, คอร์ส, หรือบทเรียน..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="ค้นหาไฟล์ประกอบ"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="admin-search-clear-btn"
                    onClick={() => setSearchQuery("")}
                    aria-label="ล้างคำค้นหา"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Materials Table / List */}
          {filteredMaterials.length === 0 ? (
            <div className="admin-materials-empty">
              <Icon name="folder_open" size={44} className="muted" />
              <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.95rem" }}>
                {searchQuery || filterCourseId !== "all" || filterScope !== "all"
                  ? "ไม่พบไฟล์ประกอบที่ตรงกับตัวกรอง"
                  : "ยังไม่มีไฟล์ประกอบในระบบ — เพิ่มไฟล์แรกได้จากฟอร์มด้านซ้าย"}
              </p>
              {(searchQuery || filterCourseId !== "all" || filterScope !== "all") && (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  style={{ marginTop: "0.75rem" }}
                  onClick={() => {
                    setFilterCourseId("all");
                    setFilterScope("all");
                    setSearchQuery("");
                  }}
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-materials-table">
                <thead>
                  <tr>
                    <th>ไฟล์ / เอกสาร</th>
                    <th>คอร์สเรียน</th>
                    <th>ตำแหน่งที่แนบ</th>
                    <th>แหล่งเก็บ / ขนาด</th>
                    <th style={{ textAlign: "right" }}>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((item) => {
                    const r = item.resource;
                    const meta = getFileTypeMeta(r.mimeType, r.title, Boolean(r.url));
                    const formattedSize = formatBytes(r.sizeBytes);

                    return (
                      <tr key={r.id} className="admin-materials-row">
                        <td>
                          <div className="admin-mat-cell">
                            <span
                              className={`material-icon-box material-icon-box--${meta.kind}`}
                              style={{ width: 36, height: 36, borderRadius: "8px" }}
                            >
                              <Icon name={meta.icon} size={19} />
                            </span>
                            <div>
                              <div className="admin-mat-title-line">
                                <span className="admin-mat-title">{r.title}</span>
                                <span
                                  className={`material-badge material-badge--${meta.kind}`}
                                >
                                  {meta.label}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className="admin-tag admin-tag--course"
                            title={item.courseTitle}
                          >
                            {item.courseTitle}
                          </span>
                        </td>
                        <td>
                          {item.isCourseLevel ? (
                            <span
                              className="admin-tag admin-tag--course-wide"
                              title="ไฟล์รวมประจำคอร์ส (ไม่ผูกกับบทเรียน)"
                            >
                              <Icon name="layers" size={12} />
                              ไฟล์รวมคอร์ส
                            </span>
                          ) : (
                            <span
                              className="admin-tag admin-tag--lesson"
                              title={`บทที่ ${item.lessonOrder}: ${item.lessonTitle}`}
                            >
                              <Icon name="play_lesson" size={12} />
                              บทที่ {item.lessonOrder}: {item.lessonTitle}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="muted" style={{ fontSize: "0.82rem" }}>
                            {r.storagePath ? "Supabase Storage" : "ลิงก์ภายนอก"}
                            {formattedSize ? ` · ${formattedSize}` : ""}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="admin-mat-actions">
                            {r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--ghost btn--sm"
                                title="เปิดลิงก์ภายนอก"
                              >
                                <Icon name="open_in_new" size={15} />
                              </a>
                            ) : (
                              <a
                                href={`/api/learn/resources/${r.id}/download`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--ghost btn--sm"
                                title="ดาวน์โหลดไฟล์"
                              >
                                <Icon name="download" size={15} />
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              title="ลบไฟล์นี้"
                              disabled={pending}
                              onClick={() => void onDeleteResource(r.id)}
                            >
                              <Icon name="delete" size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
