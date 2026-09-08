import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminLoginForm } from "@/components/admin-login-form";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin");

  return (
    <div className="shell">
      <h1 className="page-title">เข้าหลังบ้าน</h1>
      <p className="page-lead">
        ใช้รหัสผ่านแอดมิน (แยกจากการเข้าเรียนด้วยอีเมล + คีย์)
      </p>
      <div className="panel">
        <AdminLoginForm returnTo={next} />
      </div>
    </div>
  );
}
