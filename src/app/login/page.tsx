import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await auth();
  if (session?.user) redirect("/library");

  return (
    <div className="shell shell--narrow page-enter auth-shell">
      <div className="auth-card panel anim-rise">
        <h1 className="page-title">เข้าเรียน</h1>
        <p className="page-lead">
          โปรดเลือกใช้อีเมลที่ท่านใช้งานเป็นประจํา
          เนื่องจากคีย์เพื่อเข้าเรียนจะถูกเชื่อมกับอีเมลของท่านอย่างถาวร
        </p>
        <LoginForm returnTo={next} />
        <p className="muted" style={{ marginTop: "1.25rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
          หาคีย์ไม่พบ หรือลืมคีย์?{" "}
          <a
            href="https://minutessharing.com/"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline", color: "var(--red)" }}
          >
            ตรวจสอบในอีเมลคำสั่งซื้อ หรือติดต่อร้านค้า
          </a>
        </p>
      </div>
    </div>
  );
}
