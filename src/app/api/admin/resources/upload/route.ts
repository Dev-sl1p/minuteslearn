import { NextResponse } from "next/server";

/**
 * Legacy multipart upload through Vercel is capped (~4.5MB) and returns 413.
 * Use prepare-upload → direct Supabase → confirm-upload instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "อัปโหลดผ่านเซิร์ฟเวอร์ถูกปิดแล้ว — รีเฟรชหน้าแล้วลองใหม่ (ระบบจะอัปโหลดตรงไป Supabase)",
    },
    { status: 410 },
  );
}
