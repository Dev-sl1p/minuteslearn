import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeText } from "@/lib/security";
import {
  RESOURCE_MAX_BYTES,
  getSupabaseAdmin,
  resolveResourceMime,
  safeStorageFileName,
  storageBucket,
  supabaseStorageConfigured,
} from "@/lib/supabase-admin";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

const schema = z
  .object({
    courseId: z.string().min(1).optional(),
    lessonId: z.string().min(1).nullable().optional(),
    title: z.string().max(200).optional(),
    fileName: z.string().min(1).max(240),
    mimeType: z.string().max(120).optional().nullable(),
    sizeBytes: z.number().int().positive(),
  })
  .refine((data) => Boolean(data.courseId || data.lessonId), {
    message: "กรุณาระบุคอร์สเรียนหรือบทเรียน",
  });

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!supabaseStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "ยังไม่ได้ตั้ง Supabase Storage — ใส่ NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { fileName, sizeBytes } = parsed.data;
  const mime = resolveResourceMime(fileName, parsed.data.mimeType);

  if (sizeBytes > RESOURCE_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `ขนาดไฟล์ต้องไม่เกิน ${Math.floor(RESOURCE_MAX_BYTES / (1024 * 1024))}MB`,
      },
      { status: 400 },
    );
  }

  if (!mime) {
    return NextResponse.json(
      {
        error:
          "ชนิดไฟล์ไม่รองรับ — ใช้ PDF, ZIP, Word, PowerPoint, Excel, รูปภาพ หรือ TXT",
      },
      { status: 400 },
    );
  }

  let targetCourseId: string;
  let targetLessonId: string | null = null;

  if (parsed.data.lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: parsed.data.lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) {
      return NextResponse.json({ error: "ไม่พบบทเรียน" }, { status: 404 });
    }
    targetCourseId = lesson.courseId;
    targetLessonId = lesson.id;
  } else if (parsed.data.courseId) {
    const course = await prisma.course.findUnique({
      where: { id: parsed.data.courseId },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: "ไม่พบคอร์สเรียน" }, { status: 404 });
    }
    targetCourseId = course.id;
  } else {
    return NextResponse.json({ error: "กรุณาระบุคอร์สหรือบทเรียน" }, { status: 400 });
  }

  const title =
    sanitizeText(
      parsed.data.title?.trim() || fileName.replace(/\.[^.]+$/, ""),
      200,
    ) || "เอกสาร";
  const resourceId = randomUUID();
  const safeName = safeStorageFileName(fileName) || "file";
  const storagePath = targetLessonId
    ? `${targetCourseId}/${targetLessonId}/${resourceId}-${safeName}`
    : `${targetCourseId}/general/${resourceId}-${safeName}`;
  const bucket = storageBucket();

  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      {
        error: `สร้างลิงก์อัปโหลดไม่สำเร็จ: ${error?.message ?? "unknown"}`,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    resourceId,
    courseId: targetCourseId,
    lessonId: targetLessonId,
    title,
    mimeType: mime,
    sizeBytes,
    bucket,
    storagePath: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
