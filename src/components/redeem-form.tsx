"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceFingerprint } from "@/lib/fingerprint";

export function RedeemForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setOk(null);
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
      setError(data.error ?? "Redeem ไม่สำเร็จ");
      return;
    }

    setOk(`เปิดคอร์ส "${data.course.title}" สำเร็จ`);
    router.push(`/learn/${data.course.slug}`);
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        License key
        <input
          name="licenseKey"
          placeholder="เช่น DEMO-COURSE-001"
          required
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "กำลังตรวจสอบ..." : "Redeem และผูกบัญชี"}
      </button>
      {error && <p className="form-error">{error}</p>}
      {ok && <p className="form-ok">{ok}</p>}
    </form>
  );
}
