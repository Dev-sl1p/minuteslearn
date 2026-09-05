import { NextResponse } from "next/server";

/** Public registration disabled — learners enter via email + license key */
export async function POST() {
  return NextResponse.json(
    {
      error: "Registration disabled",
      message: "สมัครด้วยรหัสผ่านปิดแล้ว — ใช้อีเมล + คีย์ที่ /login",
    },
    { status: 403 },
  );
}
