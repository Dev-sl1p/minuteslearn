"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { licenseLoginErrorMessage } from "@/lib/license-login-messages";

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const licenseKey = String(fd.get("licenseKey") ?? "");

    const check = await fetch("/api/license-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, licenseKey }),
    });
    const data = await check.json();
    if (!check.ok) {
      setPending(false);
      toast.error(
        "เข้าสู่ระบบไม่สำเร็จ",
        data.error
          ? licenseLoginErrorMessage(data.error, data.message)
          : undefined,
      );
      return;
    }

    const res = await signIn("license", {
      email,
      licenseKey,
      redirect: false,
    });
    setPending(false);
    if (res?.error) {
      toast.error("เข้าสู่ระบบไม่สำเร็จ");
      return;
    }
    toast.ok("เข้าเรียนสำเร็จ", email);
    router.push("/library");
    router.refresh();
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
