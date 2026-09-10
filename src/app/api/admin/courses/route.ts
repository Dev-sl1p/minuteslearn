import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  coverUrlSchema,
  sanitizeNullableText,
  sanitizeText,
  slugSchema,
} from "@/lib/security";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

const upsertSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional().nullable(),
  coverUrl: z
    .union([coverUrlSchema, z.literal(""), z.null()])
    .optional(),
  wooProductId: z.string().max(64).optional().nullable(),
  wooSku: z.string().max(120).optional().nullable(),
  published: z.boolean().optional(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courses = await prisma.course.findMany({
    include: {
      modules: { orderBy: { order: "asc" } },
      resources: { orderBy: { order: "asc" } },
      lessons: {
        orderBy: { order: "asc" },
        include: {
          resources: { orderBy: { order: "asc" } },
        },
      },
      _count: { select: { entitlements: true, licenses: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ courses });
}

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

  const cover = parsed.data.coverUrl?.trim() || null;

  const data = {
    title: sanitizeText(parsed.data.title, 200),
    slug: sanitizeText(parsed.data.slug, 120).toLowerCase(),
    description: sanitizeNullableText(parsed.data.description, 5000),
    coverUrl: cover,
    wooProductId: sanitizeNullableText(parsed.data.wooProductId, 64),
    wooSku: sanitizeNullableText(parsed.data.wooSku, 120),
    published: parsed.data.published ?? false,
  };

  try {
    const course = parsed.data.id
      ? await prisma.course.update({
          where: { id: parsed.data.id },
          data,
          include: {
            modules: { orderBy: { order: "asc" } },
            resources: { orderBy: { order: "asc" } },
            lessons: {
              orderBy: { order: "asc" },
              include: { resources: { orderBy: { order: "asc" } } },
            },
            _count: { select: { entitlements: true, licenses: true } },
          },
        })
      : await prisma.course.create({
          data,
          include: {
            modules: { orderBy: { order: "asc" } },
            resources: { orderBy: { order: "asc" } },
            lessons: {
              orderBy: { order: "asc" },
              include: { resources: { orderBy: { order: "asc" } } },
            },
            _count: { select: { entitlements: true, licenses: true } },
          },
        });

    await logSecurityEvent({
      type: "COURSE_SAVE",
      message: `${parsed.data.id ? "Updated" : "Created"} course ${course.slug}`,
      actorId: session.user.id,
      actorEmail: session.user.email,
      meta: { courseId: course.id },
    });

    return NextResponse.json({ course });
  } catch {
    return NextResponse.json(
      { error: "บันทึกไม่สำเร็จ — slug อาจซ้ำ" },
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

  await prisma.course.delete({ where: { id } });
  await logSecurityEvent({
    type: "COURSE_DELETE",
    severity: "warn",
    message: `Deleted course ${id}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { courseId: id },
  });
  return NextResponse.json({ ok: true });
}
