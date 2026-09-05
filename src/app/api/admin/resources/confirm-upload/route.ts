import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeText } from "@/lib/security";
import {
  RESOURCE_MAX_BYTES,
  getSupabaseAdmin,
  isAllowedResourceMime,
  storageBucket,
  supabaseStorageConfigured,
} from "@/lib/supabase-admin";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

const schema = z.object({
  resourceId: z.string().min(1),
  lessonId: z.string().min(1),
  title: z.string().min(1).max(200),
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

async function objectExists(storagePath: string) {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(storageBucket())
    .createSignedUrl(storagePath, 30);
  return Boolean(data?.signedUrl) && !error;
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!supabaseStorageConfigured()) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้ง Supabase Storage" },
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

  const { resourceId, lessonId, storagePath, sizeBytes } = parsed.data;
  const mime = parsed.data.mimeType;

  if (sizeBytes > RESOURCE_MAX_BYTES || !isAllowedResourceMime(mime)) {
    return NextResponse.json({ error: "ข้อมูลไฟล์ไม่ถูกต้อง" }, { status: 400 });
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, courseId: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "ไม่พบบทเรียน" }, { status: 404 });
  }

  const expectedPrefix = `${lesson.courseId}/${lesson.id}/`;
  if (
    !storagePath.startsWith(expectedPrefix) ||
    storagePath.includes("..") ||
    !storagePath.includes(resourceId)
  ) {
    return NextResponse.json({ error: "path ไม่ถูกต้อง" }, { status: 400 });
  }

  const existing = await prisma.lessonResource.findUnique({
    where: { id: resourceId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "ไฟล์นี้ถูกบันทึกแล้ว" }, { status: 409 });
  }

  let exists = await objectExists(storagePath);
  if (!exists) {
    await new Promise((r) => setTimeout(r, 600));
    exists = await objectExists(storagePath);
  }
  if (!exists) {
    return NextResponse.json(
      { error: "ยังไม่พบไฟล์ใน Storage — ลองอัปโหลดใหม่" },
      { status: 400 },
    );
  }

  const max = await prisma.lessonResource.aggregate({
    where: { lessonId: lesson.id },
    _max: { order: true },
  });

  const resource = await prisma.lessonResource.create({
    data: {
      id: resourceId,
      lessonId: lesson.id,
      title: sanitizeText(parsed.data.title, 200),
      storagePath,
      mimeType: mime,
      sizeBytes,
      order: (max._max.order ?? 0) + 1,
    },
  });

  await logSecurityEvent({
    type: "RESOURCE_UPLOAD",
    message: `Uploaded resource ${resource.title}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: {
      resourceId: resource.id,
      lessonId: lesson.id,
      storagePath,
      sizeBytes,
    },
  });

  return NextResponse.json({ resource });
}
