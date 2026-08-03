"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { licenseLoginErrorMessage } from "@/lib/license-login-messages";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const licenseKey = String(fd.get("licenseKey") ?? "");

    // Preflight so we can show Thai error messages (Auth.js only returns generic failure)
    const check = await fetch("/api/license-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, licenseKey }),
    });
    const data = await check.json();
    if (!check.ok) {
      setPending(false);
      setError(
        data.error
          ? licenseLoginErrorMessage(data.error, data.message)
          : "เข้าสู่ระบบไม่สำเร็จ",
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
      setError("เข้าสู่ระบบไม่สำเร็จ");
      return;
    }
    router.push("/library");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        อีเมล (จะถูกผูกกับคีย์ถาวร)
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="คุณ@email.com"
        />
      </label>
      <label>
        License key
        <input
          name="licenseKey"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="เช่น DEMO-COURSE-001"
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "กำลังตรวจสอบ..." : "เข้าเรียนด้วยอีเมล + คีย์"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
