import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeText } from "@/lib/security";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

const upsertSchema = z.object({
  id: z.string().optional(),
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  order: z.number().int().optional(),
});

const reorderSchema = z.object({
  courseId: z.string().min(1),
  moduleIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
    select: { id: true },
  });
  if (!course) {
    return NextResponse.json({ error: "ไม่พบคอร์ส" }, { status: 404 });
  }

  const title = sanitizeText(parsed.data.title, 200);

  const mod = parsed.data.id
    ? await prisma.courseModule.update({
        where: { id: parsed.data.id },
        data: {
          title,
          ...(parsed.data.order != null ? { order: parsed.data.order } : {}),
        },
      })
    : await prisma.$transaction(async (tx) => {
        const max = await tx.courseModule.aggregate({
          where: { courseId: parsed.data.courseId },
          _max: { order: true },
        });
        return tx.courseModule.create({
          data: {
            courseId: parsed.data.courseId,
            title,
            order: parsed.data.order ?? (max._max.order ?? 0) + 1,
          },
        });
      });

  await logSecurityEvent({
    type: "MODULE_SAVE",
    message: `${parsed.data.id ? "Updated" : "Created"} module ${mod.title}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { moduleId: mod.id, courseId: mod.courseId },
  });

  return NextResponse.json({ module: mod });
}

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

  const existing = await prisma.courseModule.findMany({
    where: { courseId: parsed.data.courseId },
    select: { id: true },
  });
  const set = new Set(existing.map((m) => m.id));
  if (
    parsed.data.moduleIds.length !== existing.length ||
    parsed.data.moduleIds.some((id) => !set.has(id))
  ) {
    return NextResponse.json(
      { error: "รายการโมดูลไม่ตรง — รีเฟรชแล้วลองใหม่" },
      { status: 400 },
    );
  }

  await prisma.$transaction(
    parsed.data.moduleIds.map((id, index) =>
      prisma.courseModule.update({
        where: { id },
        data: { order: index + 1 },
      }),
    ),
  );

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

  await prisma.lesson.updateMany({
    where: { moduleId: id },
    data: { moduleId: null },
  });
  await prisma.courseModule.delete({ where: { id } });

  await logSecurityEvent({
    type: "MODULE_DELETE",
    severity: "warn",
    message: `Deleted module ${id}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { moduleId: id },
  });

  return NextResponse.json({ ok: true });
}
