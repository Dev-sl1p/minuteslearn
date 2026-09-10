"use client";

import { useState, useMemo, useRef } from "react";
import { Icon } from "@/components/icon";
import { formatBytes, getFileTypeMeta } from "@/components/library-view";

export type AdminLessonResource = {
  id: string;
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
};

type AdminMaterialsProps = {
  courses: AdminCourse[];
  initialCourseId?: string;
  onUploadResource: (file: File, lessonId: string, title?: string) => Promise<void>;
  onAddResourceLink: (lessonId: string, title: string, url: string) => Promise<void>;
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
  // Course and lesson selection for adding material
  const [targetCourseId, setTargetCourseId] = useState<string>(() => {
    if (initialCourseId && courses.some((c) => c.id === initialCourseId)) {
      return initialCourseId;
    }
    return courses[0]?.id ?? "";
  });

  const activeTargetCourse = useMemo(() => {
    return courses.find((c) => c.id === targetCourseId) ?? courses[0] ?? null;
  }, [courses, targetCourseId]);

  const [targetLessonId, setTargetLessonId] = useState<string>(() => {
    return activeTargetCourse?.lessons[0]?.id ?? "";
  });

  // When active course changes, auto-select its first lesson if current targetLessonId is not in it
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
  const [searchQuery, setSearchQuery] = useState("");

  // Flatten all materials across all courses with their course/lesson context
  const allMaterials = useMemo(() => {
    const list: Array<{
      resource: AdminLessonResource;
      courseId: string;
      courseTitle: string;
      courseSlug: string;
      lessonId: string;
      lessonTitle: string;
      lessonOrder: number;
    }> = [];

    for (const c of courses) {
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
          });
        }
      }
    }
    return list;
  }, [courses]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allMaterials.filter((item) => {
      if (filterCourseId !== "all" && item.courseId !== filterCourseId) {
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
  }, [allMaterials, filterCourseId, searchQuery]);

  function handleCourseChange(newCourseId: string) {
    setTargetCourseId(newCourseId);
    const course = courses.find((c) => c.id === newCourseId);
    if (course?.lessons[0]) {
      setTargetLessonId(course.lessons[0].id);
    } else {
      setTargetLessonId("");
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
    if (!selectedFile || !effectiveLessonId) return;
    await onUploadResource(selectedFile, effectiveLessonId, titleInput.trim());
    setSelectedFile(null);
    setTitleInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveLessonId || !titleInput.trim() || !urlInput.trim()) return;
    await onAddResourceLink(effectiveLessonId, titleInput.trim(), urlInput.trim());
    setTitleInput("");
    setUrlInput("");
  }

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
                เลือกคอร์สเรียนและบทเรียนที่ต้องการแนบไฟล์
              </p>
            </div>
          </div>

          <div className="admin-materials-form-body">
            {/* Step 1: Select Course */}
            <label className="admin-field-label">
              <span>เลือกคอร์สเรียน (Select Course)</span>
              <select
                className="admin-select"
                value={targetCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                disabled={pending || courses.length === 0}
              >
                {courses.length === 0 ? (
                  <option value="">ยังไม่มีคอร์สในระบบ</option>
                ) : (
                  courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.lessons.length} บท)
                    </option>
                  ))
                )}
              </select>
            </label>

            {/* Step 2: Select Lesson in Course */}
            {activeTargetCourse && activeTargetCourse.lessons.length > 0 ? (
              <label className="admin-field-label">
                <span>เลือกบทเรียนที่แนบ (Select Lesson)</span>
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
            ) : (
              <div className="admin-notice admin-notice--warn">
                <Icon name="warning" size={18} />
                <div style={{ flex: 1 }}>
                  <strong>คอร์สนี้ยังไม่มีบทเรียน</strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                    ไฟล์ประกอบจำเป็นต้องผูกกับบทเรียน กรุณาเพิ่มบทเรียนแรกในโครงสร้างหลักสูตรก่อน
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
            )}

            {/* Mode Selector Tabs */}
            {activeTargetCourse && activeTargetCourse.lessons.length > 0 && (
              <>
                <div className="admin-mode-toggle" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={materialMode === "upload"}
                    className={`admin-mode-btn ${materialMode === "upload" ? "admin-mode-btn--active" : ""}`}
                    onClick={() => setMaterialMode("upload")}
                  >
                    <Icon name="cloud_upload" size={18} />
                    <span>อัปโหลดไฟล์ไป Storage</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={materialMode === "link"}
                    className={`admin-mode-btn ${materialMode === "link" ? "admin-mode-btn--active" : ""}`}
                    onClick={() => setMaterialMode("link")}
                  >
                    <Icon name="link" size={18} />
                    <span>ใส่ลิงก์ภายนอก (HTTPS)</span>
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
                        placeholder="เช่น ไฟล์แบบฝึกหัดบทที่ 1 (Worksheet)"
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
                        <Icon name="attach_file" size={32} />
                        {selectedFile ? (
                          <div>
                            <p className="admin-dropzone-filename">{selectedFile.name}</p>
                            <p className="muted" style={{ fontSize: "0.82rem", margin: "0.2rem 0 0" }}>
                              ขนาด: {formatBytes(selectedFile.size)} · กดเพื่อเปลี่ยนไฟล์
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>คลิกเพื่อเลือกไฟล์ที่ต้องการอัปโหลด</p>
                            <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
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
                        disabled={pending || !selectedFile || !effectiveLessonId}
                      >
                        <Icon name="cloud_upload" size={16} />
                        {pending ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์ไปยังคอร์สนี้"}
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
                        placeholder="เช่น Google Drive Project Files"
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
                        placeholder="https://drive.google.com/... หรือ https://figma.com/..."
                        disabled={pending}
                      />
                    </label>

                    <div className="admin-form__actions" style={{ marginTop: "1rem" }}>
                      <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={pending || !titleInput.trim() || !urlInput.trim() || !effectiveLessonId}
                      >
                        <Icon name="add_link" size={16} />
                        {pending ? "กำลังบันทึก..." : "เพิ่มลิงก์ไฟล์ไปยังคอร์สนี้"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </section>

        {/* Right Column: All Materials Library */}
        <section className="panel admin-materials-list-panel">
          <div className="admin-materials-list-head">
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                คลังไฟล์ประกอบทั้งหมดในระบบ
              </h2>
              <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                รวมไฟล์และเอกสารของทุกคอร์ส ({allMaterials.length} รายการ)
              </p>
            </div>

            {/* Quick stats badge */}
            <div className="admin-materials-stat-pill">
              <Icon name="folder_zip" size={16} />
              <span>{allMaterials.length} ไฟล์</span>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="admin-materials-filter-bar">
            <div className="admin-materials-filter-item">
              <label htmlFor="admin-filter-course" className="muted" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                กรองตามคอร์ส:
              </label>
              <select
                id="admin-filter-course"
                className="admin-select admin-select--sm"
                value={filterCourseId}
                onChange={(e) => setFilterCourseId(e.target.value)}
              >
                <option value="all">คอร์สทั้งหมด ({allMaterials.length})</option>
                {courses.map((c) => {
                  const count = c.lessons.reduce((s, l) => s + l.resources.length, 0);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.title} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

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
              </div>
            </div>
          </div>

          {/* Materials Table */}
          {filteredMaterials.length === 0 ? (
            <div className="admin-materials-empty">
              <Icon name="folder_open" size={40} className="muted" />
              <p className="muted" style={{ margin: "0.5rem 0 0" }}>
                {searchQuery || filterCourseId !== "all"
                  ? "ไม่พบไฟล์ประกอบที่ตรงกับตัวกรอง"
                  : "ยังไม่มีไฟล์ประกอบในระบบ — เพิ่มไฟล์แรกได้จากฟอร์มด้านซ้าย"}
              </p>
              {(searchQuery || filterCourseId !== "all") && (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() => {
                    setFilterCourseId("all");
                    setSearchQuery("");
                  }}
                >
                  ล้างตัวกรอง
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
                    <th>บทเรียน</th>
                    <th>ขนาด / แหล่งเก็บ</th>
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
                            <span className={`material-icon-box material-icon-box--${meta.kind}`} style={{ width: 34, height: 34 }}>
                              <Icon name={meta.icon} size={18} />
                            </span>
                            <div>
                              <div className="admin-mat-title-line">
                                <span className="admin-mat-title">{r.title}</span>
                                <span className={`material-badge material-badge--${meta.kind}`}>
                                  {meta.label}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="admin-tag admin-tag--course" title={item.courseTitle}>
                            {item.courseTitle}
                          </span>
                        </td>
                        <td>
                          <span className="admin-tag admin-tag--lesson">
                            บทที่ {item.lessonOrder}: {item.lessonTitle}
                          </span>
                        </td>
                        <td>
                          <span className="muted" style={{ fontSize: "0.82rem" }}>
                            {r.storagePath ? "Storage" : "ลิงก์ภายนอก"}
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
