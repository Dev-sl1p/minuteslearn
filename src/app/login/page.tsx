import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/library");

  return (
    <div className="shell shell--narrow page-enter auth-shell">
      <div className="auth-card panel anim-rise">
        <h1 className="page-title">เข้าเรียน</h1>
        <p className="page-lead">
          ใช้อีเมลกับคีย์จากร้านเพื่อเข้าเรียน ครั้งแรกจะผูกคีย์กับอีเมลนั้นถาวร
          ครั้งต่อไปใช้คู่เดิมได้เลย
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
