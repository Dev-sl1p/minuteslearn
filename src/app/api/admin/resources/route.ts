import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { httpsUrlSchema, sanitizeText } from "@/lib/security";
import {
  getSupabaseAdmin,
  storageBucket,
  supabaseStorageConfigured,
} from "@/lib/supabase-admin";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

const linkSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().min(1).max(200),
  url: httpsUrlSchema,
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: parsed.data.lessonId },
    select: { id: true, courseId: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "ไม่พบบทเรียน" }, { status: 404 });
  }

  const max = await prisma.lessonResource.aggregate({
    where: { lessonId: lesson.id },
    _max: { order: true },
  });

  const resource = await prisma.lessonResource.create({
    data: {
      lessonId: lesson.id,
      title: sanitizeText(parsed.data.title, 200),
      url: parsed.data.url.trim(),
      order: (max._max.order ?? 0) + 1,
    },
  });

  await logSecurityEvent({
    type: "RESOURCE_SAVE",
    message: `Linked resource ${resource.title}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { resourceId: resource.id, lessonId: lesson.id },
  });

  return NextResponse.json({ resource });
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

  const existing = await prisma.lessonResource.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  }

  if (existing.storagePath && supabaseStorageConfigured()) {
    try {
      await getSupabaseAdmin()
        .storage.from(storageBucket())
        .remove([existing.storagePath]);
    } catch {
      /* continue deleting DB row */
    }
  }

  await prisma.lessonResource.delete({ where: { id } });
  await logSecurityEvent({
    type: "RESOURCE_DELETE",
    severity: "warn",
    message: `Deleted resource ${id}`,
    actorId: session.user.id,
    actorEmail: session.user.email,
    meta: { resourceId: id, lessonId: existing.lessonId },
  });

  return NextResponse.json({ ok: true });
}
