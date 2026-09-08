// Binding and login now happen once in Auth.js authorize, behind its CSRF check.
export async function POST() {
  return Response.json(
    { error: "LOGIN_UPDATED", message: "กรุณารีเฟรชหน้าเข้าสู่ระบบแล้วลองใหม่" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
