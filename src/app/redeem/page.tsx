import { redirect } from "next/navigation";
import { LearnerShell } from "@/components/learner-shell";
import { RedeemForm } from "@/components/redeem-form";
import { auth } from "@/lib/auth";

export default async function RedeemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/redeem");

  return (
    <LearnerShell>
      <div className="dash page-enter">
        <h1 className="page-title">เพิ่มคีย์คอร์ส</h1>
        <p className="page-lead">
          ซื้อคอร์สเพิ่มแล้วได้คีย์ใหม่ — ใส่ที่นี่เพื่อผูกกับอีเมล{" "}
          <strong>{session.user.email}</strong>
        </p>
        <div className="panel anim-rise" style={{ maxWidth: 480 }}>
          <RedeemForm />
        </div>
      </div>
    </LearnerShell>
  );
}
