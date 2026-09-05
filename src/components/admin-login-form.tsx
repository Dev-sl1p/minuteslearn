"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";

export function AdminLoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("admin", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      redirect: false,
    });
    setPending(false);
    if (res?.error) {
      toast.error("เข้าหลังบ้านไม่สำเร็จ", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    toast.ok("เข้าสู่ระบบแอดมินแล้ว");
    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        อีเมลแอดมิน
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="admin@..."
          disabled={pending}
        />
      </label>
      <label>
        รหัสผ่าน
        <input
          name="password"
          type="password"
          required
          minLength={6}
          disabled={pending}
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? <Spinner size="sm" label="กำลังเข้าสู่ระบบ..." /> : "เข้าหลังบ้าน"}
      </button>
    </form>
  );
}
