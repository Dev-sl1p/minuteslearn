import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RedeemForm } from "@/components/redeem-form";

export default async function RedeemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/redeem");

  return (
    <div className="shell">
      <h1 className="page-title">เพิ่ม license key</h1>
      <p className="page-lead">
        ซื้อคอร์สเพิ่มแล้วได้คีย์ใหม่ — ใส่ที่นี่เพื่อผูกกับอีเมล{" "}
        <strong>{session.user.email}</strong> (คีย์ใหม่จะผูกกับอีเมลนี้ถาวร)
      </p>
      <div className="panel">
        <RedeemForm />
      </div>
    </div>
  );
}
