import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userHasCourseAccess } from "@/lib/redeem";
import {
  getSupabaseAdmin,
  storageBucket,
  supabaseStorageConfigured,
} from "@/lib/supabase-admin";

type Props = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Props) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const resource = await prisma.lessonResource.findUnique({
    where: { id },
    include: {
      lesson: { select: { id: true, courseId: true } },
    },
  });

  if (!resource) {
    return NextResponse.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  }

  const allowed = await userHasCourseAccess(
    session.user.id,
    resource.lesson.courseId,
    { isAdmin: session.user.role === "ADMIN" },
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (resource.url) {
    return NextResponse.json({
      url: resource.url,
      title: resource.title,
      mode: "external" as const,
    });
  }

  if (!resource.storagePath || !supabaseStorageConfigured()) {
    return NextResponse.json(
      { error: "ไฟล์ยังไม่พร้อมดาวน์โหลด" },
      { status: 404 },
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(storageBucket())
    .createSignedUrl(resource.storagePath, 60 * 10);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: data.signedUrl,
    title: resource.title,
    mode: "storage" as const,
  });
}
