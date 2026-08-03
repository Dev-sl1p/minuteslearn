import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminLoginForm } from "@/components/admin-login-form";

export default async function AdminLoginPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin");

  return (
    <div className="shell">
      <h1 className="page-title">Admin login</h1>
      <p className="page-lead">เข้าด้วยรหัสผ่านแอดมิน (แยกจากการล็อกอินด้วย license key)</p>
      <div className="panel">
        <AdminLoginForm />
      </div>
    </div>
  );
}
