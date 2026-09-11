"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminAnalytics } from "@/components/admin-analytics";
import { AdminMaterials } from "@/components/admin-materials";
import { AdminOverview } from "@/components/admin-overview";
import { Icon } from "@/components/icon";
import { LoadingBlock, LoadingOverlay, Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { fetchWithTimeout as fetch } from "@/lib/client-fetch";

type LessonResource = {
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

type CourseModule = {
  id: string;
  title: string;
  order: number;
};

type Lesson = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  moduleId: string | null;
  streamAssetId: string | null;
  durationSec: number | null;
  resources: LessonResource[];
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
  modules: CourseModule[];
  lessons: Lesson[];
  resources?: LessonResource[];
  _count: { entitlements: number; licenses: number };
};

type License = {
  id: string;
  key: string;
  status: string;
  expiresAt: string | null;
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

type Tab =
  | "dashboard"
  | "analytics"
  | "courses"
  | "videos"
  | "materials"
  | "licenses"
  | "security";

type AnalyticsPayload = {
  overview: {
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
  redeemByDay: { key: string; label: string; count: number }[];
  courseStats: {
    id: string;
    title: string;
    slug: string;
    published: boolean;
    learners: number;
    lessons: number;
    licenses: number;
    completedLessonEvents: number;
    completionRate: number;
  }[];
  topStudents: {
    userId: string;
    email: string;
    name: string | null;
    courses: number;
    completedLessons: number;
    totalLessons: number;
  }[];
  recentEnrollments: {
    id: string;
    email: string | null;
    name: string | null;
    courseTitle: string;
    status: string;
    redeemedAt: string;
  }[];
  recentActivity: {
    id: string;
    type: string;
    message: string;
    at: string;
    status?: string;
  }[];
};

function slugify(input: string) {
  return input
    .normalize("NFC")
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

/** Guess a lesson title from a video URL / asset id */
function guessTitleFromVideoRef(input: string, order: number) {
  const v = input.trim();
  if (!v) return "";
  if (/drive\.google\.com|docs\.google\.com/i.test(v)) {
    return `บทที่ ${order}`;
  }
  try {
    const u = new URL(v);
    const last = decodeURIComponent(
      u.pathname.split("/").filter(Boolean).pop() ?? "",
    );
    const name = last
      .replace(/\.(mp4|webm|m3u8|mov|mkv)(\?.*)?$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length >= 2 && name.length <= 120) return name;
  } catch {
    /* not a URL */
  }
  return `บทที่ ${order}`;
}

/** Read duration from a direct media URL (MP4 etc.). Drive/Mux IDs return null. */
function probeVideoDurationSec(url: string): Promise<number | null> {
  const v = url.trim();
  if (!/^https:\/\//i.test(v)) return Promise.resolve(null);
  if (/drive\.google\.com|docs\.google\.com/i.test(v)) {
    return Promise.resolve(null);
  }
  if (/youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(v)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const finish = (sec: number | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(sec);
    };

    const timer = setTimeout(() => finish(null), 10_000);
    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(Number.isFinite(d) && d > 0 ? Math.round(d) : null);
    };
    video.onerror = () => finish(null);
    video.src = v;
  });
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
  moduleId: "",
  title: "",
  slug: "",
  description: "",
  order: 1,
  streamAssetId: "",
  durationMin: "",
  durationSec: "",
};

export function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [courses, setCourses] = useState<Course[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [courseForm, setCourseForm] = useState(emptyCourseForm);
  const [lessonForm, setLessonForm] = useState(emptyLessonForm);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("กำลังบันทึก...");
  const [durationHint, setDurationHint] = useState<string | null>(null);
  const [dragLessonIds, setDragLessonIds] = useState<string[]>([]);
  const [dragModuleId, setDragModuleId] = useState<string | null>(null);
  const [dropLessonId, setDropLessonId] = useState<string | null>(null);
  const [dropModuleId, setDropModuleId] = useState<string | null>(null);
  const [dropUnassigned, setDropUnassigned] = useState(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [collapsedModules, setCollapsedModules] = useState<
    Record<string, boolean>
  >({});
  const [moduleTitle, setModuleTitle] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [materialCourseId, setMaterialCourseId] = useState<string>("");
  const [licenseSearch, setLicenseSearch] = useState("");
  const [licenseStatusFilter, setLicenseStatusFilter] = useState<
    "ALL" | "ACTIVE" | "REVOKED"
  >("ALL");
  const [securitySearch, setSecuritySearch] = useState("");
  const [securitySeverityFilter, setSecuritySeverityFilter] = useState("ALL");
  const dragLessonIdsRef = useRef<string[]>([]);
  const dragModuleIdRef = useRef<string | null>(null);
  const lastClickedLessonRef = useRef<string | null>(null);
  const reorderBusy = useRef(false);
  const persistQueue = useRef(Promise.resolve());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredLicenses = useMemo(() => {
    const q = licenseSearch.trim().toLowerCase();
    return licenses.filter((l) => {
      if (licenseStatusFilter !== "ALL" && l.status !== licenseStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        l.key.toLowerCase().includes(q) ||
        (l.user.email?.toLowerCase().includes(q) ?? false) ||
        (l.user.name?.toLowerCase().includes(q) ?? false) ||
        (l.course?.title.toLowerCase().includes(q) ?? false)
      );
    });
  }, [licenses, licenseSearch, licenseStatusFilter]);

  const filteredSecurityEvents = useMemo(() => {
    const q = securitySearch.trim().toLowerCase();
    return securityEvents.filter((e) => {
      if (
        securitySeverityFilter !== "ALL" &&
        e.severity !== securitySeverityFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        e.message.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.actorEmail?.toLowerCase().includes(q) ?? false) ||
        (e.ip?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [securityEvents, securitySearch, securitySeverityFilter]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const selectedLessonSet = useMemo(
    () => new Set(selectedLessonIds),
    [selectedLessonIds],
  );

  const editingLesson = useMemo(
    () =>
      lessonForm.id
        ? (courses
            .flatMap((c) => c.lessons)
            .find((l) => l.id === lessonForm.id) ?? null)
        : null,
    [courses, lessonForm.id],
  );

  const nextLessonOrder = (selectedCourse?.lessons.length ?? 0) + 1;

  async function refresh(opts?: {
    silent?: boolean;
    /** Default: all scopes. Prefer narrow scopes after mutations. */
    scopes?: Array<"courses" | "licenses" | "security" | "analytics">;
  }) {
    const scopes = opts?.scopes ?? [
      "courses",
      "licenses",
      "security",
      "analytics",
    ];
    if (!opts?.silent) setLoading(true);
    try {
      const tasks: Promise<void>[] = [];

      if (scopes.includes("courses")) {
        tasks.push(
          (async () => {
            const c = await fetch("/api/admin/courses").then((r) => r.json());
            if (c.error) {
              toast.error("โหลดคอร์สไม่สำเร็จ", c.error);
              return;
            }
            if (!c.courses) return;
            setCourses(
              (c.courses as Course[]).map((course) => ({
                ...course,
                modules: course.modules ?? [],
                lessons: (course.lessons ?? []).map((lesson) => ({
                  ...lesson,
                  moduleId: lesson.moduleId ?? null,
                  resources: lesson.resources ?? [],
                })),
              })),
            );
            if (!selectedCourseId && c.courses[0]) {
              const first = c.courses[0] as Course;
              setSelectedCourseId(first.id);
              setLessonForm({
                ...emptyLessonForm,
                courseId: first.id,
                order: first.lessons?.length ? first.lessons.length + 1 : 1,
              });
            }
          })(),
        );
      }

      if (scopes.includes("licenses")) {
        tasks.push(
          (async () => {
            const l = await fetch("/api/admin/licenses").then((r) => r.json());
            if (l.error) {
              toast.error("โหลดคีย์ไม่สำเร็จ", l.error);
              return;
            }
            if (l.licenses) setLicenses(l.licenses);
          })(),
        );
      }

      if (scopes.includes("security")) {
        tasks.push(
          (async () => {
            const s = await fetch("/api/admin/security").then((r) => r.json());
            if (s.error) {
              toast.error("โหลดความปลอดภัยไม่สำเร็จ", s.error);
              return;
            }
            if (s.events) setSecurityEvents(s.events);
          })(),
        );
      }

      if (scopes.includes("analytics")) {
        tasks.push(
          (async () => {
            const a = await fetch("/api/admin/analytics").then((r) => r.json());
            if (a.error) {
              toast.error("โหลดวิเคราะห์ไม่สำเร็จ", a.error);
              return;
            }
            if (a.overview) setAnalytics(a as AnalyticsPayload);
          })(),
        );
      }

      await Promise.all(tasks);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ", "ตรวจอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Show UI after courses load; pull the rest in the background.
    void (async () => {
      await refresh({ scopes: ["courses"] });
      void refresh({
        silent: true,
        scopes: ["licenses", "security", "analytics"],
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCourse(courseId: string) {
    if (courseId === selectedCourseId) return true;
    if ((lessonForm.id || lessonForm.title || lessonForm.streamAssetId || lessonForm.description)
      && !confirm("สลับคอร์สและปิดฟอร์มบทเรียนนี้? การแก้ไขที่ยังไม่บันทึกจะถูกยกเลิก")) return false;
    const course = courses.find((item) => item.id === courseId);
    setSelectedCourseId(courseId);
    setSelectedLessonIds([]);
    lastClickedLessonRef.current = null;
    setLessonForm({ ...emptyLessonForm, courseId, order: (course?.lessons.length ?? 0) + 1 });
    setResourceTitle("");
    setResourceUrl("");
    return true;
  }

  function editCourse(course: Course) {
    if (!selectCourse(course.id)) return;
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
      moduleId: lesson.moduleId ?? "",
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description ?? "",
      order: lesson.order,
      streamAssetId: lesson.streamAssetId ?? "",
      durationMin: total ? String(Math.floor(total / 60)) : "",
      durationSec: total ? String(total % 60) : "",
    });
    setResourceTitle("");
    setResourceUrl("");
    setTab("videos");
  }

  function resetLessonForm() {
    setDurationHint(null);
    setResourceTitle("");
    setResourceUrl("");
    setLessonForm({
      ...emptyLessonForm,
      courseId: selectedCourseId,
      order: selectedCourse ? selectedCourse.lessons.length + 1 : 1,
    });
  }

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    setPendingLabel("กำลังบันทึกคอร์ส...");
    setPending(true);
    try {
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
    if (!res.ok) {
      toast.error("บันทึกคอร์สไม่สำเร็จ", data.error);
      return;
    }
    toast.ok(courseForm.id ? "อัปเดตคอร์สแล้ว" : "สร้างคอร์สแล้ว", data.course?.title);
    selectCourse(data.course.id);
    resetCourseForm();
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function deleteCourse(id: string) {
    if (!confirm("ลบคอร์สและบทเรียนทั้งหมด?")) return;
    setPendingLabel("กำลังลบคอร์ส...");
    setPending(true);
    try {
    const res = await fetch(`/api/admin/courses?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบคอร์สไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("ลบคอร์สแล้ว");
    if (selectedCourseId === id) {
      setSelectedCourseId("");
      setSelectedLessonIds([]);
      lastClickedLessonRef.current = null;
    }
    if (courseForm.id === id) resetCourseForm();
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  function renumberLessons(lessons: Lesson[]): Lesson[] {
    return lessons.map((l, i) => ({ ...l, order: i + 1 }));
  }

  /** Group lessons by module order (visual curriculum order). */
  function buildCurriculumLessons(
    modules: CourseModule[],
    lessons: Lesson[],
  ): Lesson[] {
    const sortedMods = [...modules].sort((a, b) => a.order - b.order);
    const modIds = new Set(sortedMods.map((m) => m.id));
    const byModule = new Map<string | null, Lesson[]>();
    for (const mod of sortedMods) byModule.set(mod.id, []);
    byModule.set(null, []);

    const sorted = [...lessons].sort((a, b) => a.order - b.order);
    for (const lesson of sorted) {
      const key =
        lesson.moduleId && modIds.has(lesson.moduleId) ? lesson.moduleId : null;
      byModule.get(key)!.push(lesson);
    }

    const out: Lesson[] = [];
    for (const mod of sortedMods) {
      for (const lesson of byModule.get(mod.id)!) {
        out.push({ ...lesson, moduleId: mod.id });
      }
    }
    for (const lesson of byModule.get(null)!) {
      out.push({ ...lesson, moduleId: null });
    }
    return renumberLessons(out);
  }

  function persistCurriculum(courseId: string, lessons: Lesson[]) {
    const payload = lessons.map((l) => ({
      id: l.id,
      moduleId: l.moduleId,
    }));
    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(async () => {
        reorderBusy.current = true;
        try {
          const res = await fetch("/api/admin/lessons", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId, lessons: payload }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            toast.error("เรียงหลักสูตรไม่สำเร็จ", data.error);
            await refresh({ silent: true, scopes: ["courses"] });
          }
        } catch {
          toast.error("เรียงหลักสูตรไม่สำเร็จ");
          await refresh({ silent: true, scopes: ["courses"] });
        } finally {
          reorderBusy.current = false;
        }
      });
  }

  function computeLessonRearrange(
    course: Course,
    args: {
      fromIds: string[];
      targetModuleId: string | null;
      beforeLessonId?: string | null;
    },
  ): Lesson[] | null {
    const fromIds = [...new Set(args.fromIds)].filter(Boolean);
    const { targetModuleId, beforeLessonId = null } = args;
    if (fromIds.length === 0) return null;
    if (fromIds.length === 1 && fromIds[0] === beforeLessonId) return null;

    const movingSet = new Set(fromIds);
    if (beforeLessonId && movingSet.has(beforeLessonId)) return null;

    const sortedMods = [...course.modules].sort((a, b) => a.order - b.order);
    const modIds = new Set(sortedMods.map((m) => m.id));
    const groups = new Map<string | null, Lesson[]>();
    for (const mod of sortedMods) groups.set(mod.id, []);
    groups.set(null, []);

    const moving: Lesson[] = [];
    const sorted = [...course.lessons].sort((a, b) => a.order - b.order);
    for (const lesson of sorted) {
      if (movingSet.has(lesson.id)) {
        moving.push(lesson);
        continue;
      }
      const key =
        lesson.moduleId && modIds.has(lesson.moduleId)
          ? lesson.moduleId
          : null;
      groups.get(key)!.push(lesson);
    }
    if (moving.length === 0) return null;

    const destKey =
      targetModuleId && modIds.has(targetModuleId) ? targetModuleId : null;
    const dest = groups.get(destKey)!;
    const moved = moving.map((lesson) => ({
      ...lesson,
      moduleId: destKey,
    }));

    if (beforeLessonId) {
      const idx = dest.findIndex((l) => l.id === beforeLessonId);
      dest.splice(idx >= 0 ? idx : dest.length, 0, ...moved);
    } else {
      dest.push(...moved);
    }

    const next: Lesson[] = [];
    for (const mod of sortedMods) {
      for (const lesson of groups.get(mod.id)!) {
        next.push({ ...lesson, moduleId: mod.id });
      }
    }
    for (const lesson of groups.get(null)!) {
      next.push({ ...lesson, moduleId: null });
    }
    return renumberLessons(next);
  }

  function rearrangeLessons(args: {
    fromIds: string[];
    targetModuleId: string | null;
    beforeLessonId?: string | null;
  }) {
    if (!selectedCourseId) return;
    const course = courses.find((c) => c.id === selectedCourseId);
    if (!course) return;
    const renumbered = computeLessonRearrange(course, args);
    if (!renumbered) return;

    setCourses((prev) =>
      prev.map((c) =>
        c.id === course.id ? { ...c, lessons: renumbered } : c,
      ),
    );
    persistCurriculum(course.id, renumbered);
    setSelectedLessonIds([]);
    lastClickedLessonRef.current = null;
  }

  function resolveDragLessonIds(primaryId: string): string[] {
    if (selectedLessonSet.has(primaryId) && selectedLessonIds.length > 1) {
      const course = courses.find((c) => c.id === selectedCourseId);
      if (!course) return [primaryId];
      const ordered = buildCurriculumLessons(
        course.modules,
        course.lessons,
      ).map((l) => l.id);
      return ordered.filter((id) => selectedLessonSet.has(id));
    }
    return [primaryId];
  }

  function moveLessonsOntoLesson(fromIds: string[], toId: string) {
    if (!selectedCourseId || fromIds.includes(toId)) return;
    const course = courses.find((c) => c.id === selectedCourseId);
    const target = course?.lessons.find((l) => l.id === toId);
    if (!target) return;
    rearrangeLessons({
      fromIds,
      targetModuleId: target.moduleId,
      beforeLessonId: toId,
    });
  }

  function moveLessonsIntoModule(fromIds: string[], moduleId: string | null) {
    if (!selectedCourseId || fromIds.length === 0) return;
    rearrangeLessons({
      fromIds,
      targetModuleId: moduleId,
      beforeLessonId: null,
    });
  }

  function toggleLessonSelection(
    lessonId: string,
    e?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  ) {
    const course = courses.find((c) => c.id === selectedCourseId);
    if (!course) return;
    const ordered = buildCurriculumLessons(
      course.modules,
      course.lessons,
    ).map((l) => l.id);

    if (e?.shiftKey && lastClickedLessonRef.current) {
      const a = ordered.indexOf(lastClickedLessonRef.current);
      const b = ordered.indexOf(lessonId);
      if (a >= 0 && b >= 0) {
        const [start, end] = a < b ? [a, b] : [b, a];
        setSelectedLessonIds(ordered.slice(start, end + 1));
        return;
      }
    }

    if (e?.metaKey || e?.ctrlKey) {
      setSelectedLessonIds((prev) =>
        prev.includes(lessonId)
          ? prev.filter((id) => id !== lessonId)
          : [...prev, lessonId],
      );
      lastClickedLessonRef.current = lessonId;
      return;
    }

    setSelectedLessonIds((prev) =>
      prev.length === 1 && prev[0] === lessonId ? [] : [lessonId],
    );
    lastClickedLessonRef.current = lessonId;
  }

  function moveModule(fromId: string, toId: string) {
    if (!selectedCourseId || fromId === toId) return;
    const course = courses.find((c) => c.id === selectedCourseId);
    if (!course) return;

    const mods = [...course.modules].sort((a, b) => a.order - b.order);
    const from = mods.findIndex((m) => m.id === fromId);
    const to = mods.findIndex((m) => m.id === toId);
    if (from < 0 || to < 0) return;

    const [item] = mods.splice(from, 1);
    mods.splice(to, 0, item);
    const nextModules = mods.map((m, i) => ({ ...m, order: i + 1 }));
    const nextLessons = buildCurriculumLessons(nextModules, course.lessons);
    const courseId = course.id;

    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? { ...c, modules: nextModules, lessons: nextLessons }
          : c,
      ),
    );

    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(async () => {
        reorderBusy.current = true;
        try {
          const modRes = await fetch("/api/admin/modules", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              courseId,
              moduleIds: nextModules.map((m) => m.id),
            }),
          });
          if (!modRes.ok) {
            const data = await modRes.json().catch(() => ({}));
            toast.error("เรียงโมดูลไม่สำเร็จ", data.error);
            await refresh({ silent: true, scopes: ["courses"] });
            return;
          }
          const lessonRes = await fetch("/api/admin/lessons", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              courseId,
              lessons: nextLessons.map((l) => ({
                id: l.id,
                moduleId: l.moduleId,
              })),
            }),
          });
          if (!lessonRes.ok) {
            const data = await lessonRes.json().catch(() => ({}));
            toast.error("เรียงหลักสูตรไม่สำเร็จ", data.error);
            await refresh({ silent: true, scopes: ["courses"] });
          }
        } catch {
          toast.error("เรียงหลักสูตรไม่สำเร็จ");
          await refresh({ silent: true, scopes: ["courses"] });
        } finally {
          reorderBusy.current = false;
        }
      });
  }

  function readDragPayload(e: React.DragEvent) {
    const raw = e.dataTransfer.getData("text/plain") || "";
    if (raw.startsWith("lessons:")) {
      const ids = raw
        .slice("lessons:".length)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length) return { kind: "lessons" as const, ids };
    }
    if (raw.startsWith("lesson:")) {
      return {
        kind: "lessons" as const,
        ids: [raw.slice("lesson:".length)],
      };
    }
    if (raw.startsWith("module:")) {
      return { kind: "module" as const, id: raw.slice("module:".length) };
    }
    if (dragLessonIdsRef.current.length > 0) {
      return { kind: "lessons" as const, ids: [...dragLessonIdsRef.current] };
    }
    if (dragModuleIdRef.current) {
      return { kind: "module" as const, id: dragModuleIdRef.current };
    }
    return null;
  }

  function startNewLessonInModule(moduleId: string) {
    setDurationHint(null);
    setResourceTitle("");
    setResourceUrl("");
    setLessonForm({
      ...emptyLessonForm,
      courseId: selectedCourseId,
      moduleId,
      order: (selectedCourse?.lessons.length ?? 0) + 1,
    });
  }

  function clearDragState() {
    dragLessonIdsRef.current = [];
    dragModuleIdRef.current = null;
    setDragLessonIds([]);
    setDragModuleId(null);
    setDropLessonId(null);
    setDropModuleId(null);
    setDropUnassigned(false);
  }

  function beginLessonDrag(e: React.DragEvent, lessonId: string) {
    const ids = resolveDragLessonIds(lessonId);
    dragLessonIdsRef.current = ids;
    dragModuleIdRef.current = null;
    setDragLessonIds(ids);
    setDragModuleId(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `lessons:${ids.join(",")}`);
  }

  async function applyVideoLink(raw: string) {
    const value = raw.trim();
    const order = lessonForm.id
      ? Number(lessonForm.order) || 1
      : nextLessonOrder;

    setLessonForm((f) => {
      const next = { ...f, streamAssetId: raw };
      // Auto title/slug only when creating a new lesson and title is still empty
      if (!f.id && !f.title.trim() && value) {
        const title = guessTitleFromVideoRef(value, order);
        next.title = title;
        next.slug = slugify(title);
      }
      return next;
    });

    if (!value || !/^https:\/\//i.test(value)) {
      setDurationHint(null);
      return;
    }
    if (/drive\.google\.com|docs\.google\.com/i.test(value)) {
      setDurationHint(
        "Google Drive: ใส่ความยาวเองได้ (หรือปล่อยว่าง — ระบบใช้ความยาวตอนเล่นจริง)",
      );
      return;
    }
    if (/youtube\.com|youtu\.be/i.test(value)) {
      setDurationHint(
        "YouTube: ใส่ความยาวเองได้ (หรือปล่อยว่าง — ระบบใช้ความยาวจากตอนเล่นจริง)",
      );
      return;
    }

    setDurationHint("กำลังอ่านความยาวคลิป...");
    const total = await probeVideoDurationSec(value);
    if (total == null) {
      setDurationHint(
        "อ่านความยาวอัตโนมัติไม่ได้ — ใส่นาที/วินาทีเอง หรือปล่อยว่างได้",
      );
      return;
    }
    setLessonForm((f) => ({
      ...f,
      durationMin: String(Math.floor(total / 60)),
      durationSec: String(total % 60),
    }));
    setDurationHint(`ดึงความยาวจากคลิปแล้ว · ${formatDuration(total)}`);
  }

  async function saveLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!lessonForm.courseId) {
      toast.error("เลือกคอร์สก่อน");
      return;
    }
    setPendingLabel("กำลังบันทึกวิดีโอ...");
    setPending(true);
    try {
    const mins = Number(lessonForm.durationMin || 0);
    const secs = Number(lessonForm.durationSec || 0);
    const durationSec =
      mins > 0 || secs > 0 ? Math.max(0, mins * 60 + secs) : null;

    const title =
      lessonForm.title.trim() ||
      guessTitleFromVideoRef(
        lessonForm.streamAssetId,
        lessonForm.id ? Number(lessonForm.order) || 1 : nextLessonOrder,
      );
    const slug =
      slugify(lessonForm.slug || title) ||
      `lesson-${Date.now().toString(36)}`;

    const res = await fetch("/api/admin/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: lessonForm.id || undefined,
        courseId: lessonForm.courseId,
        moduleId: lessonForm.moduleId || null,
        title,
        slug,
        description: lessonForm.description || null,
        streamAssetId: lessonForm.streamAssetId || null,
        durationSec,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("บันทึกวิดีโอไม่สำเร็จ", data.error);
      return;
    }
    toast.ok(lessonForm.id ? "อัปเดตวิดีโอแล้ว" : "เพิ่มวิดีโอแล้ว", title);
    resetLessonForm();
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function saveModule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourseId) {
      toast.error("เลือกคอร์สก่อน");
      return;
    }
    const title = moduleTitle.trim();
    if (!title) {
      toast.error("ใส่ชื่อโมดูล");
      return;
    }
    setPendingLabel("กำลังบันทึกโมดูล...");
    setPending(true);
    try {
    const res = await fetch("/api/admin/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: selectedCourseId, title }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("บันทึกโมดูลไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("เพิ่มโมดูลแล้ว", title);
    setModuleTitle("");
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function deleteModule(id: string) {
    if (!confirm("ลบโมดูลนี้? บทเรียนจะย้ายไปกลุ่มไม่มีโมดูล")) return;
    setPendingLabel("กำลังลบโมดูล...");
    setPending(true);
    try {
    const res = await fetch(`/api/admin/modules?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบโมดูลไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("ลบโมดูลแล้ว");
    setLessonForm((f) =>
      f.moduleId === id ? { ...f, moduleId: "" } : f,
    );
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function addResourceLink(
    eOrTarget?:
      | React.FormEvent
      | string
      | { courseId?: string; lessonId?: string | null },
    maybeTitle?: string,
    maybeUrl?: string,
  ) {
    let targetLessonId: string | null = null;
    let targetCourseId: string | undefined;
    let title = "";
    let url = "";

    if (eOrTarget && typeof eOrTarget === "object" && "preventDefault" in eOrTarget) {
      eOrTarget.preventDefault();
      targetLessonId = lessonForm.id;
      title = resourceTitle.trim();
      url = resourceUrl.trim();
    } else if (typeof eOrTarget === "object" && eOrTarget !== null) {
      targetCourseId = eOrTarget.courseId;
      targetLessonId = eOrTarget.lessonId ?? null;
      title = (maybeTitle || "").trim();
      url = (maybeUrl || "").trim();
    } else {
      targetLessonId = typeof eOrTarget === "string" ? eOrTarget : lessonForm.id;
      title = (maybeTitle || resourceTitle).trim();
      url = (maybeUrl || resourceUrl).trim();
    }

    if (!targetLessonId && !targetCourseId) {
      toast.error("เลือกบทเรียนหรือคอร์สก่อน");
      return;
    }
    if (!title || !url) {
      toast.error("ใส่ชื่อและลิงก์ไฟล์");
      return;
    }
    setPendingLabel("กำลังเพิ่มลิงก์ไฟล์...");
    setPending(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: targetCourseId,
          lessonId: targetLessonId || undefined,
          title,
          url,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("เพิ่มลิงก์ไม่สำเร็จ", data.error);
        return;
      }
      toast.ok("เพิ่มลิงก์ไฟล์แล้ว", title);
      setResourceTitle("");
      setResourceUrl("");
      await refresh({ silent: true, scopes: ["courses"] });
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function readApiJson(res: Response) {
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (res.status === 413) {
        return {
          error:
            "ไฟล์ใหญ่เกินขีดจำกัดเซิร์ฟเวอร์ — ระบบจะอัปโหลดตรงไป Supabase แทน (รีเฟรชหน้าแล้วลองใหม่)",
        };
      }
      return {
        error: snippet || `อัปโหลดล้มเหลว (${res.status})`,
      };
    }
  }

  async function uploadResource(
    file: File,
    target?: string | { courseId?: string; lessonId?: string | null },
    overrideTitle?: string,
  ) {
    let lessonId: string | null = null;
    let courseId: string | undefined;

    if (typeof target === "object" && target !== null) {
      courseId = target.courseId;
      lessonId = target.lessonId ?? null;
    } else if (typeof target === "string") {
      lessonId = target;
    } else {
      lessonId = lessonForm.id;
    }

    if (!lessonId && !courseId) {
      toast.error("เลือกบทเรียนหรือคอร์สก่อน แล้วค่อยอัปโหลด");
      return;
    }

    setPendingLabel("กำลังเตรียมอัปโหลด...");
    setPending(true);

    try {
      const prepRes = await fetch("/api/admin/resources/prepare-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          lessonId: lessonId || undefined,
          title: (overrideTitle || resourceTitle).trim() || file.name,
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
        }),
      });
      const prep = await readApiJson(prepRes);
      if (!prepRes.ok) {
        toast.error("อัปโหลดไม่สำเร็จ", String(prep.error ?? "เตรียมลิงก์ไม่สำเร็จ"));
        return;
      }

      const signedUrl = String(prep.signedUrl ?? "");
      const token = String(prep.token ?? "");
      const storagePath = String(prep.storagePath ?? "");
      const bucket = String(prep.bucket ?? "course-materials");
      const resourceId = String(prep.resourceId ?? "");
      const title = String(prep.title ?? file.name);
      const mime = String(
        prep.mimeType || file.type || "application/octet-stream",
      );

      if (!signedUrl || !token || !storagePath || !resourceId) {
        toast.error("อัปโหลดไม่สำเร็จ", "ลิงก์อัปโหลดไม่ครบ");
        return;
      }

      setPendingLabel("กำลังอัปโหลดไป Supabase...");

      const typedFile =
        file.type === mime
          ? file
          : new File([file], file.name, { type: mime });

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      let uploadError: string | null = null;

      if (supabaseUrl && supabaseAnon) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(supabaseUrl, supabaseAnon, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error } = await sb.storage
          .from(bucket)
          .uploadToSignedUrl(storagePath, token, typedFile, {
            contentType: mime,
            upsert: false,
          });
        if (error) uploadError = error.message;
      } else {
        const uploadUrl = new URL(signedUrl);
        if (!uploadUrl.searchParams.get("token") && token) {
          uploadUrl.searchParams.set("token", token);
        }
        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", typedFile);
        const putRes = await fetch(uploadUrl.toString(), {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: form,
        });
        if (!putRes.ok) {
          uploadError =
            (await putRes.text()).slice(0, 200) ||
            `Supabase ตอบ ${putRes.status}`;
        }
      }

      if (uploadError) {
        toast.error("อัปโหลดไม่สำเร็จ", uploadError);
        return;
      }

      setPendingLabel("กำลังบันทึกไฟล์...");
      const confirmRes = await fetch("/api/admin/resources/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId,
          courseId,
          lessonId: lessonId || undefined,
          title,
          storagePath,
          mimeType: mime,
          sizeBytes: file.size,
        }),
      });
      const confirmed = await readApiJson(confirmRes);
      if (!confirmRes.ok) {
        toast.error(
          "อัปโหลดไม่สำเร็จ",
          String(confirmed.error ?? "บันทึกข้อมูลไฟล์ไม่สำเร็จ"),
        );
        return;
      }

      toast.ok("อัปโหลดไฟล์แล้ว", title);
      setResourceTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh({ silent: true, scopes: ["courses"] });
    } catch (err) {
      toast.error(
        "อัปโหลดไม่สำเร็จ",
        err instanceof Error ? err.message : "เครือข่ายขัดข้องหรือไฟล์ใหญ่เกินไป",
      );
    } finally {
      setPending(false);
    }
  }

  async function deleteResource(id: string) {
    if (!confirm("ลบไฟล์แนบนี้?")) return;
    setPendingLabel("กำลังลบไฟล์...");
    setPending(true);
    try {
    const res = await fetch(`/api/admin/resources?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบไฟล์ไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("ลบไฟล์แล้ว");
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function deleteLesson(id: string) {
    if (!confirm("ลบบทเรียนนี้?")) return;
    setPendingLabel("กำลังลบบทเรียน...");
    setPending(true);
    try {
    const res = await fetch(`/api/admin/lessons?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ลบบทไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("ลบบทเรียนแล้ว");
    if (lessonForm.id === id) resetLessonForm();
    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  async function revoke(licenseId: string) {
    if (!confirm("ระงับคีย์และสิทธิ์เรียนของบัญชีนี้?")) return;
    setPendingLabel("กำลังระงับคีย์...");
    setPending(true);
    try {
    const res = await fetch("/api/admin/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseId, revokeDevices: true }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error("ระงับไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("ระงับคีย์แล้ว");
    await refresh({ silent: true, scopes: ["licenses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="กำลังโหลดหลังบ้าน..." />;
  }

  const adminNav: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "ภาพรวม", icon: "dashboard" },
    { id: "courses", label: "คอร์สเรียน", icon: "library_books" },
    { id: "videos", label: "โครงสร้างบทเรียน", icon: "video_library" },
    { id: "materials", label: "ไฟล์ประกอบ", icon: "folder_zip" },
    { id: "licenses", label: "จัดการคีย์", icon: "vpn_key" },
    { id: "analytics", label: "วิเคราะห์ผู้เรียน", icon: "analytics" },
    { id: "security", label: "ความปลอดภัย", icon: "shield" },
  ];

  return (
    <div className="admin-shell">
      <aside className="admin-shell__aside">
        <div className="app-shell__brand">
          <Image
            src="/logo-minutes-sharing.png"
            alt=""
            width={40}
            height={40}
            className="app-shell__logo"
          />
          <div>
            <p className="app-shell__brand-name">หลังบ้าน</p>
            <p className="app-shell__brand-sub">MinutesLearn</p>
          </div>
        </div>
        <nav className="app-shell__nav" aria-label="เมนูแอดมิน">
          {adminNav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-shell__link ${tab === item.id ? "is-active" : ""}`}
              onClick={() => setTab(item.id)}
              disabled={pending}
            >
              <span className="app-shell__icon" aria-hidden>
                <Icon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="app-shell__foot">
          <button
            type="button"
            className="btn btn--primary app-shell__create"
            onClick={() => {
              setTab("courses");
              resetCourseForm();
            }}
            disabled={pending}
          >
            <Icon name="add" size={18} />
            สร้างคอร์สใหม่
          </button>
          <Link href="/library" className="app-shell__link app-shell__link--ghost">
            <span className="app-shell__icon" aria-hidden>
              <Icon name="arrow_back" />
            </span>
            กลับหน้าเรียน
          </Link>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__top">
          <div className="admin-tabs admin-tabs--mobile">
            {adminNav.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-tab ${tab === item.id ? "admin-tab--active" : ""}`}
                onClick={() => setTab(item.id)}
                disabled={pending}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <div className="admin-shell__content admin-cms stack">
          <LoadingOverlay show={pending} label={pendingLabel} />

      {tab === "dashboard" && (
        <AdminOverview
          overview={analytics?.overview ?? null}
          redeemByDay={analytics?.redeemByDay ?? []}
          recentEnrollments={analytics?.recentEnrollments ?? []}
          recentActivity={analytics?.recentActivity ?? []}
          onGoCourses={() => setTab("courses")}
          onGoAnalytics={() => setTab("analytics")}
          onGoLicenses={() => setTab("licenses")}
        />
      )}

      {tab === "analytics" && (
        <AdminAnalytics
          overview={analytics?.overview ?? null}
          courseStats={analytics?.courseStats ?? []}
          topStudents={analytics?.topStudents ?? []}
          redeemByDay={analytics?.redeemByDay ?? []}
          onGoCourses={() => setTab("courses")}
        />
      )}

      {tab === "courses" && (
        <div className="admin-grid">
          <section className="panel">
            <h2 className="admin-section-title">
              {courseForm.id ? "แก้ไขคอร์ส" : "เพิ่มคอร์สใหม่"}
            </h2>
            {courseForm.id && (
              <div className="admin-editing-banner">
                <div>
                  <span className="admin-editing-banner__label">กำลังแก้ไข:</span>
                  <strong>{courseForm.title || "คอร์สนี้"}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0.25rem 0.65rem", fontSize: "0.82rem" }}
                  onClick={resetCourseForm}
                >
                  ✕ ยกเลิกแก้ไข (สร้างใหม่)
                </button>
              </div>
            )}
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
                  placeholder="https://... หรือลิงก์ Supabase Storage"
                />
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  รองรับลิงก์นอก (https) และไฟล์ใน Supabase Storage
                </span>
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
                    placeholder="เช่น 119 หรือ 119, 120"
                  />
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    ID สินค้าตัวเลขจาก WooCommerce (คั่นด้วยจุลภาคได้)
                  </span>
                </label>
                <label>
                  Woo SKU
                  <input
                    value={courseForm.wooSku}
                    onChange={(e) =>
                      setCourseForm((f) => ({ ...f, wooSku: e.target.value }))
                    }
                    placeholder="เช่น davinci-course"
                  />
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    รหัส SKU สินค้าจากร้าน (เช่น davinci-course)
                  </span>
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
                เผยแพร่คอร์ส
              </label>
              <div className="admin-form__actions">
                <button className="btn btn--primary" type="submit" disabled={pending}>
                  {pending ? (
                    <Spinner size="sm" label="กำลังบันทึก..." />
                  ) : courseForm.id ? (
                    "บันทึกการแก้ไข"
                  ) : (
                    "สร้างคอร์ส"
                  )}
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
                    onClick={() => selectCourse(c.id)}
                  >
                    <strong>{c.title}</strong>
                    <span className="muted">/{c.slug}</span>
                    <span className="admin-course-card__meta">
                      {c.lessons.length} บท · คีย์ {c._count.licenses} ·{" "}
                      {c.published ? (
                        <span className="badge badge--ok">เผยแพร่แล้ว</span>
                      ) : (
                        <span className="badge">ฉบับร่าง</span>
                      )}
                    </span>
                    {c.wooProductId || c.wooSku ? (
                      <span className="muted" style={{ fontSize: "0.82rem" }}>
                        Woo: ID {c.wooProductId ?? "—"} / SKU {c.wooSku ?? "—"}
                      </span>
                    ) : c.published ? (
                      <span
                        className="badge badge--warn"
                        style={{ fontSize: "0.75rem", alignSelf: "flex-start" }}
                      >
                        ยังไม่ผูกสินค้า Woo
                      </span>
                    ) : null}
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
                        selectCourse(c.id);
                        setTab("videos");
                      }}
                    >
                      จัดบทเรียน ({c.lessons.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      title="จัดการและเพิ่มไฟล์ประกอบของคอร์สนี้"
                      onClick={() => {
                        setMaterialCourseId(c.id);
                        setTab("materials");
                      }}
                    >
                      ไฟล์ประกอบ (
                        {(c.resources?.length ?? 0) +
                          c.lessons.reduce(
                            (s, l) => s + (l.resources?.length ?? 0),
                            0,
                          )}
                      )
                    </button>
                    <Link
                      href={`/learn/${c.slug}`}
                      target="_blank"
                      className="btn btn--ghost"
                      title="เปิดดูหน้าคอร์สในมุมมองผู้เรียน"
                    >
                      ดูหน้าเรียน ↗
                    </Link>
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
            {lessonForm.id && (
              <div className="admin-editing-banner">
                <div>
                  <span className="admin-editing-banner__label">กำลังแก้ไข:</span>
                  <strong>{lessonForm.title || "บทเรียนนี้"}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: "0.25rem 0.65rem", fontSize: "0.82rem" }}
                  onClick={resetLessonForm}
                >
                  ✕ ยกเลิกแก้ไข (เพิ่มบทใหม่)
                </button>
              </div>
            )}
            <p className="muted" style={{ marginTop: 0 }}>
              วางลิงก์วิดีโอก่อน — ระบบจะลองใส่ชื่อบทและความยาวให้อัตโนมัติ
            </p>
            <form className="form admin-form" onSubmit={saveLesson}>
              <label>
                คอร์ส
                <select
                  required
                  value={lessonForm.courseId}
                  disabled={Boolean(lessonForm.id) || pending}
                  onChange={(e) => {
                    selectCourse(e.target.value);
                    setLessonForm((f) => ({
                      ...f,
                      courseId: e.target.value,
                      moduleId: "",
                    }));
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
                โมดูล (กลุ่มบท เช่น บทที่ 1)
                <select
                  value={lessonForm.moduleId}
                  onChange={(e) =>
                    setLessonForm((f) => ({ ...f, moduleId: e.target.value }))
                  }
                >
                  <option value="">— ไม่จัดกลุ่ม —</option>
                  {(
                    courses.find((c) => c.id === lessonForm.courseId)?.modules ??
                    []
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.order}. {m.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ลิงก์วิดีโอ (YouTube / Google Drive / MP4 / HLS / Mux)
                <input
                  value={lessonForm.streamAssetId}
                  onChange={(e) => void applyVideoLink(e.target.value)}
                  onBlur={(e) => void applyVideoLink(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  YouTube: ตั้งเป็น Unlisted + อนุญาตฝังบนโดเมน · Drive: “Anyone with the link”
                </span>
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
                  placeholder="ใส่ลิงก์แล้วจะเติมให้อัตโนมัติ (แก้ได้)"
                />
              </label>
              <label>
                Slug (URL)
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
              <div className="admin-form__row">
                <label>
                  นาที
                  <input
                    type="number"
                    min={0}
                    value={lessonForm.durationMin}
                    onChange={(e) => {
                      setDurationHint(null);
                      setLessonForm((f) => ({
                        ...f,
                        durationMin: e.target.value,
                      }));
                    }}
                  />
                </label>
                <label>
                  วินาที
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={lessonForm.durationSec}
                    onChange={(e) => {
                      setDurationHint(null);
                      setLessonForm((f) => ({
                        ...f,
                        durationSec: e.target.value,
                      }));
                    }}
                  />
                </label>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                ลากบทเข้าโมดูลได้ทางขวา · นาที/วินาที = ความยาวที่แสดง (ไม่บังคับ)
                {durationHint ? ` · ${durationHint}` : ""}
              </p>
              <div className="admin-form__actions">
                <button className="btn btn--primary" type="submit" disabled={pending}>
                  {pending ? (
                    <Spinner size="sm" label="กำลังบันทึก..." />
                  ) : lessonForm.id ? (
                    "บันทึกวิดีโอ"
                  ) : (
                    "เพิ่มวิดีโอ"
                  )}
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

            {lessonForm.id && (
              <div className="admin-resources" style={{ marginTop: "1.25rem" }}>
                <h3 className="admin-section-title" style={{ fontSize: "1rem" }}>
                  ไฟล์แนบของบทนี้
                </h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  อัปโหลดเข้า Supabase Storage โดยตรง (สูงสุด 150MB) หรือใส่ลิงก์ HTTPS
                </p>
                {(editingLesson?.resources ?? []).length > 0 && (
                  <ul className="admin-resource-list">
                    {(editingLesson?.resources ?? []).map((r) => (
                      <li key={r.id} className="admin-resource-row">
                        <span>
                          <strong>{r.title}</strong>
                          <span className="muted">
                            {" "}
                            · {r.storagePath ? "Storage" : "ลิงก์"}
                            {r.sizeBytes
                              ? ` · ${(r.sizeBytes / 1024).toFixed(0)} KB`
                              : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn btn--danger"
                          onClick={() => void deleteResource(r.id)}
                        >
                          ลบ
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form className="form admin-form" onSubmit={addResourceLink}>
                  <label>
                    ชื่อไฟล์
                    <input
                      value={resourceTitle}
                      onChange={(e) => setResourceTitle(e.target.value)}
                      placeholder="Worksheet.pdf"
                    />
                  </label>
                  <label>
                    ลิงก์ภายนอก (ถ้าไม่ได้อัปโหลด)
                    <input
                      value={resourceUrl}
                      onChange={(e) => setResourceUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <div className="admin-form__actions">
                    <button
                      className="btn btn--ghost"
                      type="submit"
                      disabled={pending}
                    >
                      เพิ่มลิงก์
                    </button>
                    <label className="btn btn--primary" style={{ cursor: "pointer" }}>
                      อัปโหลดไฟล์
                      <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadResource(file);
                        }}
                      />
                    </label>
                  </div>
                </form>
              </div>
            )}
          </section>

          <section className="panel curriculum-panel">
            <div className="admin-sidebar-head">
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                โครงสร้างหลักสูตร
              </h2>
              <select
                value={selectedCourseId}
                onChange={(e) => selectCourse(e.target.value)}
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
                <div className="curriculum-toolbar">
                  <p className="muted" style={{ margin: 0 }}>
                    {selectedCourse.lessons.length} บท ·{" "}
                    {selectedCourse.modules.length} โมดูล · ลากโมดูล/บทเพื่อจัดกลุ่ม
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
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={pending}
                    onClick={() => {
                      const title = moduleTitle.trim() || `โมดูล ${selectedCourse.modules.length + 1}`;
                      setModuleTitle(title);
                      void (async () => {
                        setPendingLabel("กำลังบันทึกโมดูล...");
                        setPending(true);
    try {
                        const res = await fetch("/api/admin/modules", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            courseId: selectedCourseId,
                            title,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          toast.error("บันทึกโมดูลไม่สำเร็จ", data.error);
                          return;
                        }
                        toast.ok("เพิ่มโมดูลแล้ว", title);
                        setModuleTitle("");
                        await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  })();
                    }}
                  >
                    + เพิ่มโมดูล
                  </button>
                </div>

                <form
                  className="admin-module-add"
                  onSubmit={saveModule}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.85rem",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    value={moduleTitle}
                    onChange={(e) => setModuleTitle(e.target.value)}
                    placeholder="ชื่อโมดูลใหม่ (หรือกด + เพิ่มโมดูล)"
                    style={{ flex: "1 1 12rem" }}
                  />
                </form>

                <p className="muted curriculum-select-hint">
                  เลือกหลายบทได้ด้วยช่องติ๊ก / Ctrl+คลิก / Shift+คลิกช่วง แล้วลากพร้อมกัน
                  {selectedLessonIds.length > 0 && (
                    <>
                      {" "}
                      · เลือกแล้ว {selectedLessonIds.length} บท{" "}
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ padding: "0.15rem 0.5rem" }}
                        onClick={() => {
                          setSelectedLessonIds([]);
                          lastClickedLessonRef.current = null;
                        }}
                      >
                        ยกเลิกการเลือก
                      </button>
                    </>
                  )}
                </p>

                <div className="curriculum-builder">
                  {[...selectedCourse.modules]
                    .sort((a, b) => a.order - b.order)
                    .map((m) => {
                      const moduleLessons = selectedCourse.lessons
                        .filter((l) => l.moduleId === m.id)
                        .sort((a, b) => a.order - b.order);
                      const collapsed = Boolean(collapsedModules[m.id]);
                      return (
                        <div
                          key={m.id}
                          className={[
                            "curriculum-module",
                            dragModuleId === m.id ? "is-dragging" : "",
                            dropModuleId === m.id ? "is-drop-target" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (dragModuleIdRef.current && dragModuleIdRef.current !== m.id) {
                              setDropModuleId(m.id);
                              setDropLessonId(null);
                              setDropUnassigned(false);
                            } else if (dragLessonIdsRef.current.length > 0) {
                              setDropModuleId(m.id);
                              setDropLessonId(null);
                              setDropUnassigned(false);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const payload = readDragPayload(e);
                            clearDragState();
                            if (payload?.kind === "lessons") {
                              moveLessonsIntoModule(payload.ids, m.id);
                            } else if (payload?.kind === "module") {
                              moveModule(payload.id, m.id);
                            }
                          }}
                        >
                          <div className="curriculum-module__head">
                            <button
                              type="button"
                              className="admin-lesson-drag"
                              draggable
                              aria-label={`ลากโมดูล ${m.title}`}
                              title="ลากเพื่อเรียงโมดูล"
                              onDragStart={(e) => {
                                dragModuleIdRef.current = m.id;
                                dragLessonIdsRef.current = [];
                                setDragModuleId(m.id);
                                setDragLessonIds([]);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", `module:${m.id}`);
                              }}
                              onDragEnd={clearDragState}
                            >
                              <Icon name="drag_indicator" size={18} />
                            </button>
                            <div className="curriculum-module__title">
                              <input
                                className="curriculum-module__input"
                                defaultValue={m.title}
                                key={`${m.id}:${m.title}`}
                                aria-label="ชื่อโมดูล"
                                placeholder="ชื่อโมดูล"
                                onBlur={(e) => {
                                  const title = e.target.value.trim();
                                  if (!title || title === m.title) {
                                    e.target.value = m.title;
                                    return;
                                  }
                                  void (async () => {
                                    setPendingLabel("กำลังแก้ชื่อโมดูล...");
                                    setPending(true);
    try {
                                    const res = await fetch("/api/admin/modules", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        id: m.id,
                                        courseId: selectedCourseId,
                                        title,
                                      }),
                                    });
                                    const data = await res.json();
                                    if (!res.ok) {
                                      toast.error("แก้ชื่อโมดูลไม่สำเร็จ", data.error);
                                      e.target.value = m.title;
                                      return;
                                    }
                                    toast.ok("อัปเดตโมดูลแล้ว");
                                    await refresh({ silent: true, scopes: ["courses"] });

    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง");
    } finally {
      setPending(false);
    }
  })();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              aria-label="ลบโมดูล"
                              onClick={() => void deleteModule(m.id)}
                            >
                              ลบ
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost"
                              aria-expanded={!collapsed}
                              onClick={() =>
                                setCollapsedModules((prev) => ({
                                  ...prev,
                                  [m.id]: !prev[m.id],
                                }))
                              }
                            >
                              {collapsed ? "▸" : "▾"}
                            </button>
                          </div>

                          {!collapsed && (
                            <div className="curriculum-module__body">
                              {moduleLessons.map((l) => (
                                <div
                                  key={l.id}
                                  className={[
                                    "curriculum-lesson",
                                    selectedLessonSet.has(l.id) ? "is-selected" : "",
                                    dragLessonIds.includes(l.id) ? "is-dragging" : "",
                                    dropLessonId === l.id ? "is-drop-target" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  onClick={(e) => {
                                    const target = e.target as HTMLElement;
                                    if (
                                      target.closest(
                                        "button, a, input, label, textarea",
                                      )
                                    ) {
                                      return;
                                    }
                                    toggleLessonSelection(l.id, e);
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (
                                      dragLessonIdsRef.current.length > 0 &&
                                      !dragLessonIdsRef.current.includes(l.id)
                                    ) {
                                      setDropLessonId(l.id);
                                      setDropModuleId(null);
                                      setDropUnassigned(false);
                                    }
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const payload = readDragPayload(e);
                                    clearDragState();
                                    if (payload?.kind === "lessons") {
                                      moveLessonsOntoLesson(payload.ids, l.id);
                                    }
                                  }}
                                >
                                  <label
                                    className="curriculum-lesson__check"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedLessonSet.has(l.id)}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        if (checked) {
                                          setSelectedLessonIds((prev) =>
                                            prev.includes(l.id)
                                              ? prev
                                              : [...prev, l.id],
                                          );
                                        } else {
                                          setSelectedLessonIds((prev) =>
                                            prev.filter((id) => id !== l.id),
                                          );
                                        }
                                        lastClickedLessonRef.current = l.id;
                                      }}
                                      aria-label={`เลือก ${l.title}`}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="admin-lesson-drag"
                                    draggable
                                    aria-label={`ลากบท ${l.title}`}
                                    title="ลากเข้าโมดูลอื่นหรือเรียงลำดับ"
                                    onDragStart={(e) => beginLessonDrag(e, l.id)}
                                    onDragEnd={clearDragState}
                                  >
                                    <Icon name="drag_indicator" size={18} />
                                  </button>
                                  <span className="curriculum-lesson__icon" aria-hidden>
                                    <Icon name="play_arrow" size={18} />
                                  </span>
                                  <div className="curriculum-lesson__body">
                                    <strong>{l.title}</strong>
                                    <span className="muted">
                                      {l.streamAssetId
                                        ? `วิดีโอ (${formatDuration(l.durationSec)})`
                                        : "ยังไม่มีวิดีโอ"}
                                      {(l.resources?.length ?? 0) > 0
                                        ? ` · ไฟล์ ${l.resources.length}`
                                        : ""}
                                    </span>
                                  </div>
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
                                    onClick={() => void deleteLesson(l.id)}
                                  >
                                    ลบ
                                  </button>
                                </div>
                              ))}

                              <button
                                type="button"
                                className="curriculum-add-lesson"
                                onClick={() => startNewLessonInModule(m.id)}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (dragLessonIdsRef.current.length > 0) {
                                    setDropModuleId(m.id);
                                    setDropLessonId(null);
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const payload = readDragPayload(e);
                                  clearDragState();
                                  if (payload?.kind === "lessons") {
                                    moveLessonsIntoModule(payload.ids, m.id);
                                  }
                                }}
                              >
                                + เพิ่มบทเรียนใหม่
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  <div
                    className={[
                      "curriculum-module",
                      "curriculum-module--unassigned",
                      dropUnassigned ? "is-drop-target" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragLessonIdsRef.current.length > 0) {
                        setDropUnassigned(true);
                        setDropModuleId(null);
                        setDropLessonId(null);
                      }
                    }}
                    onDragLeave={() => setDropUnassigned(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const payload = readDragPayload(e);
                      clearDragState();
                      if (payload?.kind === "lessons") {
                        moveLessonsIntoModule(payload.ids, null);
                      }
                    }}
                  >
                    <div className="curriculum-module__head">
                      <div className="curriculum-module__title">
                        <span className="curriculum-module__label">ยังไม่จัดกลุ่ม</span>
                        <strong>บทเรียนนอกโมดูล</strong>
                        <span className="muted" style={{ fontSize: "0.85rem" }}>
                          ลากบทมาที่นี่ หรือลากเข้าโมดูลด้านบน
                        </span>
                      </div>
                    </div>
                    <div className="curriculum-module__body">
                      {selectedCourse.lessons
                        .filter(
                          (l) =>
                            !l.moduleId ||
                            !selectedCourse.modules.some((m) => m.id === l.moduleId),
                        )
                        .sort((a, b) => a.order - b.order)
                        .map((l) => (
                          <div
                            key={l.id}
                            className={[
                              "curriculum-lesson",
                              selectedLessonSet.has(l.id) ? "is-selected" : "",
                              dragLessonIds.includes(l.id) ? "is-dragging" : "",
                              dropLessonId === l.id ? "is-drop-target" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (
                                target.closest(
                                  "button, a, input, label, textarea",
                                )
                              ) {
                                return;
                              }
                              toggleLessonSelection(l.id, e);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                dragLessonIdsRef.current.length > 0 &&
                                !dragLessonIdsRef.current.includes(l.id)
                              ) {
                                setDropLessonId(l.id);
                                setDropUnassigned(false);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const payload = readDragPayload(e);
                              clearDragState();
                              if (payload?.kind === "lessons") {
                                moveLessonsOntoLesson(payload.ids, l.id);
                              }
                            }}
                          >
                            <label
                              className="curriculum-lesson__check"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedLessonSet.has(l.id)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  if (checked) {
                                    setSelectedLessonIds((prev) =>
                                      prev.includes(l.id)
                                        ? prev
                                        : [...prev, l.id],
                                    );
                                  } else {
                                    setSelectedLessonIds((prev) =>
                                      prev.filter((id) => id !== l.id),
                                    );
                                  }
                                  lastClickedLessonRef.current = l.id;
                                }}
                                aria-label={`เลือก ${l.title}`}
                              />
                            </label>
                            <button
                              type="button"
                              className="admin-lesson-drag"
                              draggable
                              aria-label={`ลากบท ${l.title}`}
                              onDragStart={(e) => beginLessonDrag(e, l.id)}
                              onDragEnd={clearDragState}
                            >
                              <Icon name="drag_indicator" size={18} />
                            </button>
                            <span className="curriculum-lesson__icon" aria-hidden>
                              <Icon name="play_arrow" size={18} />
                            </span>
                            <div className="curriculum-lesson__body">
                              <strong>{l.title}</strong>
                              <span className="muted">
                                {l.streamAssetId
                                  ? `วิดีโอ (${formatDuration(l.durationSec)})`
                                  : "ยังไม่มีวิดีโอ"}
                              </span>
                            </div>
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
                              onClick={() => void deleteLesson(l.id)}
                            >
                              ลบ
                            </button>
                          </div>
                        ))}
                      {selectedCourse.lessons.filter((l) => !l.moduleId).length ===
                        0 &&
                        selectedCourse.modules.length > 0 && (
                          <p className="muted" style={{ margin: 0 }}>
                            ไม่มีบทนอกโมดูล — ลากบทมาวางที่นี่ได้
                          </p>
                        )}
                      {selectedCourse.lessons.length === 0 && (
                        <p className="muted" style={{ margin: 0 }}>
                          ยังไม่มีบท — เพิ่มวิดีโอทางซ้าย หรือกด + ในโมดูล
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <p className="muted" style={{ marginBottom: "1rem" }}>
                  ยังไม่มีคอร์สเรียน กรุณาสร้างคอร์สก่อนจัดการโครงสร้างบทเรียน
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setTab("courses")}
                >
                  + ไปหน้าคอร์สเพื่อสร้างคอร์สใหม่
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "materials" && (
        <AdminMaterials
          courses={courses}
          initialCourseId={materialCourseId || selectedCourseId}
          onUploadResource={uploadResource}
          onAddResourceLink={async (lessonId, title, url) => {
            await addResourceLink(lessonId, title, url);
          }}
          onDeleteResource={deleteResource}
          onGoCurriculum={(courseId) => {
            selectCourse(courseId);
            setTab("videos");
          }}
          pending={pending}
        />
      )}

      {tab === "licenses" && (
        <section className="panel" style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                คีย์ทั้งหมด ({licenses.length})
              </h2>
              <p
                className="muted"
                style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem" }}
              >
                ค้นหาและจัดการสิทธิ์การเข้าถึงคอร์สของผู้เรียน
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void refresh({ silent: true, scopes: ["licenses"] })}
              disabled={pending || loading}
            >
              {loading ? <Spinner size="sm" label="กำลังโหลด..." /> : "รีเฟรช"}
            </button>
          </div>

          <div className="admin-filter-bar">
            <div style={{ flex: "1 1 240px" }}>
              <input
                type="search"
                className="admin-search-input"
                placeholder="ค้นหาคีย์, อีเมล, ชื่อผู้เรียน, หรือชื่อคอร์ส..."
                value={licenseSearch}
                onChange={(e) => setLicenseSearch(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`admin-filter-btn ${
                  licenseStatusFilter === "ALL" ? "is-active" : ""
                }`}
                onClick={() => setLicenseStatusFilter("ALL")}
              >
                ทั้งหมด ({licenses.length})
              </button>
              <button
                type="button"
                className={`admin-filter-btn ${
                  licenseStatusFilter === "ACTIVE" ? "is-active" : ""
                }`}
                onClick={() => setLicenseStatusFilter("ACTIVE")}
              >
                ใช้งานอยู่ (
                {licenses.filter((l) => l.status === "ACTIVE").length})
              </button>
              <button
                type="button"
                className={`admin-filter-btn ${
                  licenseStatusFilter === "REVOKED" ? "is-active" : ""
                }`}
                onClick={() => setLicenseStatusFilter("REVOKED")}
              >
                ระงับแล้ว (
                {licenses.filter((l) => l.status === "REVOKED").length})
              </button>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>คีย์</th>
                <th>ผู้ใช้</th>
                <th>คอร์ส</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredLicenses.map((l) => (
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
                      {l.status === "ACTIVE"
                        ? "ใช้งาน"
                        : l.status === "REVOKED"
                          ? "ระงับแล้ว"
                          : l.status}
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
              {filteredLicenses.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="muted"
                    style={{ textAlign: "center", padding: "2rem 1rem" }}
                  >
                    {licenses.length === 0
                      ? "ยังไม่มีคีย์ที่ถูกใช้"
                      : "ไม่พบคีย์ที่ตรงกับเงื่อนไขการค้นหา"}
                    {(licenseSearch || licenseStatusFilter !== "ALL") && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          style={{ fontSize: "0.8125rem" }}
                          onClick={() => {
                            setLicenseSearch("");
                            setLicenseStatusFilter("ALL");
                          }}
                        >
                          ล้างตัวกรอง
                        </button>
                      </div>
                    )}
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
              marginBottom: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>
                เหตุการณ์ความปลอดภัย ({securityEvents.length})
              </h2>
              <p
                className="muted"
                style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem" }}
              >
                บันทึกการเข้าสู่ระบบ / ใส่คีย์ / งานแอดมิน — ตั้ง
                SECURITY_WEBHOOK_URL เพื่อแจ้งเตือนระดับเตือนและวิกฤต
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void refresh({ silent: true, scopes: ["security"] })}
              disabled={pending || loading}
            >
              {loading ? <Spinner size="sm" label="กำลังโหลด..." /> : "รีเฟรช"}
            </button>
          </div>

          <div className="admin-filter-bar">
            <div style={{ flex: "1 1 240px" }}>
              <input
                type="search"
                className="admin-search-input"
                placeholder="ค้นหาข้อความ, ประเภท, อีเมล, หรือ IP..."
                value={securitySearch}
                onChange={(e) => setSecuritySearch(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`admin-filter-btn ${
                  securitySeverityFilter === "ALL" ? "is-active" : ""
                }`}
                onClick={() => setSecuritySeverityFilter("ALL")}
              >
                ทั้งหมด ({securityEvents.length})
              </button>
              <button
                type="button"
                className={`admin-filter-btn ${
                  securitySeverityFilter === "critical" ? "is-active" : ""
                }`}
                onClick={() => setSecuritySeverityFilter("critical")}
              >
                วิกฤต (
                {securityEvents.filter((e) => e.severity === "critical").length})
              </button>
              <button
                type="button"
                className={`admin-filter-btn ${
                  securitySeverityFilter === "warn" ? "is-active" : ""
                }`}
                onClick={() => setSecuritySeverityFilter("warn")}
              >
                เตือน ({securityEvents.filter((e) => e.severity === "warn").length}
                )
              </button>
              <button
                type="button"
                className={`admin-filter-btn ${
                  securitySeverityFilter === "info" ? "is-active" : ""
                }`}
                onClick={() => setSecuritySeverityFilter("info")}
              >
                ทั่วไป ({securityEvents.filter((e) => e.severity === "info").length}
                )
              </button>
            </div>
          </div>

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
              {filteredSecurityEvents.map((e) => (
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
              {filteredSecurityEvents.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="muted"
                    style={{ textAlign: "center", padding: "2rem 1rem" }}
                  >
                    {securityEvents.length === 0
                      ? "ยังไม่มีเหตุการณ์"
                      : "ไม่พบเหตุการณ์ที่ตรงกับเงื่อนไขการค้นหา"}
                    {(securitySearch || securitySeverityFilter !== "ALL") && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          style={{ fontSize: "0.8125rem" }}
                          onClick={() => {
                            setSecuritySearch("");
                            setSecuritySeverityFilter("ALL");
                          }}
                        >
                          ล้างตัวกรอง
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
        </div>
      </div>
    </div>
  );
}
