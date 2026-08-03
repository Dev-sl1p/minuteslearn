import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  sanitizeNullableText,
  sanitizeText,
  slugSchema,
  videoRefSchema,
} from "@/lib/security";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

const schema = z.object({
  id: z.string().optional(),
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional().nullable(),
  order: z.number().int().optional(),
  streamAssetId: videoRefSchema,
  durationSec: z.number().int().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
  });
  if (!course) {
    return NextResponse.json({ error: "ไม่พบคอร์ส" }, { status: 404 });
  }

  const stream = parsed.data.streamAssetId?.trim() || null;

  const data = {
    courseId: parsed.data.courseId,
    title: sanitizeText(parsed.data.title, 200),
    slug: sanitizeText(parsed.data.slug, 120).toLowerCase(),
    description: sanitizeNullableText(parsed.data.description, 5000),
    order: parsed.data.order ?? 0,
    streamAssetId: stream,
    durationSec: parsed.data.durationSec ?? null,
  };

  try {
    const lesson = parsed.data.id
      ? await prisma.lesson.update({ where: { id: parsed.data.id }, data })
      : await prisma.lesson.create({ data });

    await logSecurityEvent({
      type: "LESSON_SAVE",
      message: `${parsed.data.id ? "Updated" : "Created"} lesson ${lesson.slug}`,
      actorId: session.user.id,
      actorEmail: session.user.email,
      meta: { lessonId: lesson.id, courseId: lesson.courseId },
    });

    return NextResponse.json({ lesson });
  } catch {
    return NextResponse.json(
      { error: "บันทึกบทไม่สำเร็จ — slug ในคอร์สนี้อาจซ้ำ" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.lesson.delete({ where: { id } });
  await logSecurityEvent({
    type: "LESSON_DELETE",
    severity: "warn",
    message: `Deleted lesson ${id}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { lessonId: id },
  });
  return NextResponse.json({ ok: true });
}
