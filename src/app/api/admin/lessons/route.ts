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
  moduleId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional().nullable(),
  streamAssetId: videoRefSchema,
  durationSec: z.number().int().optional().nullable(),
});

const reorderSchema = z.object({
  courseId: z.string().min(1),
  lessons: z
    .array(
      z.object({
        id: z.string().min(1),
        moduleId: z.string().nullable(),
      }),
    )
    .min(1),
});

async function renumberCourseLessons(courseId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { courseId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (lessons.length === 0) return;
  await prisma.$transaction(
    lessons.map((lesson, index) =>
      prisma.lesson.update({
        where: { id: lesson.id },
        data: { order: index + 1 },
      }),
    ),
  );
}

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

  const moduleId =
    parsed.data.moduleId === undefined
      ? undefined
      : parsed.data.moduleId?.trim() || null;

  if (moduleId) {
    const mod = await prisma.courseModule.findFirst({
      where: { id: moduleId, courseId: parsed.data.courseId },
      select: { id: true },
    });
    if (!mod) {
      return NextResponse.json(
        { error: "โมดูลไม่ได้อยู่ในคอร์สนี้" },
        { status: 400 },
      );
    }
  }

  const base = {
    courseId: parsed.data.courseId,
    ...(moduleId !== undefined ? { moduleId } : {}),
    title: sanitizeText(parsed.data.title, 200),
    slug: sanitizeText(parsed.data.slug, 120).toLowerCase(),
    description: sanitizeNullableText(parsed.data.description, 5000),
    streamAssetId: stream,
    durationSec: parsed.data.durationSec ?? null,
  };

  try {
    const lesson = parsed.data.id
      ? await prisma.lesson.update({
          where: { id: parsed.data.id },
          data: base,
        })
      : await prisma.$transaction(async (tx) => {
          const max = await tx.lesson.aggregate({
            where: { courseId: parsed.data.courseId },
            _max: { order: true },
          });
          return tx.lesson.create({
            data: {
              ...base,
              order: (max._max.order ?? 0) + 1,
            },
          });
        });

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

/** Reorder + assign modules: body { courseId, lessons: [{ id, moduleId }] } */
export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { courseId, lessons } = parsed.data;
  const existing = await prisma.lesson.findMany({
    where: { courseId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((l) => l.id));
  const incomingIds = lessons.map((l) => l.id);

  if (
    incomingIds.length !== existing.length ||
    incomingIds.some((id) => !existingIds.has(id)) ||
    new Set(incomingIds).size !== incomingIds.length
  ) {
    return NextResponse.json(
      { error: "รายการบทไม่ตรงกับคอร์ส — รีเฟรชแล้วลองใหม่" },
      { status: 400 },
    );
  }

  const moduleIds = [
    ...new Set(
      lessons
        .map((l) => l.moduleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (moduleIds.length > 0) {
    const mods = await prisma.courseModule.findMany({
      where: { courseId, id: { in: moduleIds } },
      select: { id: true },
    });
    if (mods.length !== moduleIds.length) {
      return NextResponse.json(
        { error: "มีโมดูลที่ไม่ได้อยู่ในคอร์สนี้" },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(
    lessons.map((item, index) =>
      prisma.lesson.update({
        where: { id: item.id },
        data: {
          order: index + 1,
          moduleId: item.moduleId,
        },
      }),
    ),
  );

  await logSecurityEvent({
    type: "LESSON_REORDER",
    message: `Reordered ${lessons.length} lessons`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { courseId, lessonIds: incomingIds },
  });

  return NextResponse.json({ ok: true });
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

  const existing = await prisma.lesson.findUnique({
    where: { id },
    select: { id: true, courseId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "ไม่พบบทเรียน" }, { status: 404 });
  }

  await prisma.lesson.delete({ where: { id } });
  await renumberCourseLessons(existing.courseId);

  await logSecurityEvent({
    type: "LESSON_DELETE",
    severity: "warn",
    message: `Deleted lesson ${id}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { lessonId: id, courseId: existing.courseId },
  });
  return NextResponse.json({ ok: true });
}
