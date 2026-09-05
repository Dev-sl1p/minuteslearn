import { redirect } from "next/navigation";
import { DevicesPanel } from "@/components/devices-panel";
import { LearnerShell } from "@/components/learner-shell";
import { auth } from "@/lib/auth";

export default async function DevicesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/devices");

  return (
    <LearnerShell>
      <div className="dash page-enter">
        <h1 className="page-title">ความปลอดภัยและอุปกรณ์</h1>
        <p className="page-lead">
          จัดการอุปกรณ์ที่ใช้งานบัญชีของคุณ — หากเต็ม ให้ปลดเครื่องเก่าก่อนใช้เครื่องใหม่
        </p>
        <DevicesPanel />
      </div>
    </LearnerShell>
  );
}
