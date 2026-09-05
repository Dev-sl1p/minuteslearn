"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { getDeviceFingerprint } from "@/lib/fingerprint";

export function RedeemForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const licenseKey = String(fd.get("licenseKey") ?? "");

    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey,
        deviceFingerprint: getDeviceFingerprint(),
      }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      toast.error("ใส่คีย์ไม่สำเร็จ", data.error);
      return;
    }

    toast.ok("เปิดคอร์สแล้ว", data.course?.title);
    router.push(`/learn/${data.course.slug}`);
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        คีย์จากร้าน
        <input
          name="licenseKey"
          placeholder="คีย์ที่ได้หลังซื้อจากร้าน"
          required
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? (
          <Spinner size="sm" label="กำลังตรวจสอบ..." />
        ) : (
          "เปิดคอร์ส"
        )}
      </button>
    </form>
  );
}
