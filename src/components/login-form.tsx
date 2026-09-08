"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { licenseLoginErrorMessage } from "@/lib/license-login-messages";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { safeReturnPath } from "@/lib/redirect-target";

export function LoginForm({ returnTo = "/library" }: { returnTo?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      const email = String(fd.get("email") ?? "");
      const licenseKey = String(fd.get("licenseKey") ?? "");

      const res = await signIn("license", {
        email,
        licenseKey,
        fingerprint: getDeviceFingerprint(),
        redirect: false,
      });
      setPending(false);
      if (!res || res.error) {
        toast.error("เข้าสู่ระบบไม่สำเร็จ", licenseLoginErrorMessage(res?.code ?? "INVALID_KEY"));
        return;
      }
      toast.ok("เข้าเรียนสำเร็จ", email);
      router.push(safeReturnPath(returnTo));
      router.refresh();
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง ข้อมูลที่กรอกยังอยู่");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        อีเมล (ผูกกับคีย์ครั้งแรกที่ใช้)
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="คุณ@email.com"
          disabled={pending}
        />
      </label>
      <label>
        คีย์จากร้าน
        <input
          name="licenseKey"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="คีย์ที่ได้หลังซื้อจากร้าน"
          disabled={pending}
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? (
          <Spinner size="sm" label="กำลังตรวจสอบ..." />
        ) : (
          "เข้าเรียน"
        )}
      </button>
    </form>
  );
}
