import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DevicesPanel } from "@/components/devices-panel";

export default async function DevicesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/devices");

  return (
    <div className="shell">
      <h1 className="page-title">อุปกรณ์ที่ผูก</h1>
      <p className="page-lead">
        จำกัดจำนวนเครื่องต่อบัญชี หากเต็ม ให้ปลดเครื่องเก่าก่อนใช้งานเครื่องใหม่
      </p>
      <DevicesPanel />
    </div>
  );
}
