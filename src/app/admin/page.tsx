import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin-dashboard";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/login");
  }

  return (
    <div className="shell">
      <h1 className="page-title">หลังบ้าน</h1>
      <p className="page-lead">
        เพิ่มคอร์ส ใส่ลิงก์วิดีโอในแต่ละบท ผูก Woo Product ID และจัดการ license
      </p>
      <AdminDashboard />
    </div>
  );
}
