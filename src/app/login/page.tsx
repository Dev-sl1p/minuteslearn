import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/library");

  return (
    <div className="shell">
      <h1 className="page-title">เข้าเรียน</h1>
      <p className="page-lead">
        ใส่อีเมล + license key จากร้าน — ครั้งแรกจะผูกคีย์กับอีเมลนั้นถาวร
        ครั้งต่อไปใช้คู่เดิมเพื่อเข้าเรียน ไม่ต้องสมัครแยก
      </p>
      <div className="panel">
        <LoginForm />
      </div>
      <p className="muted" style={{ marginTop: "1rem" }}>
        {process.env.WP_LICENSE_MODE === "mock" && (
          <>
            ทดสอบ: <code>DEMO-COURSE-001</code> + อีเมลอะไรก็ได้ที่ยังไม่ถูกใช้กับคีย์อื่น
          </>
        )}
      </p>
    </div>
  );
}
