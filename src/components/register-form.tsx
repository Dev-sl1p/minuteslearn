"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    };

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setPending(false);
      setError(data.error ?? "สมัครไม่สำเร็จ");
      return;
    }

    const login = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });
    setPending(false);
    if (login?.error) {
      setError("สมัครสำเร็จ แต่เข้าสู่ระบบอัตโนมัติไม่สำเร็จ");
      return;
    }
    router.push("/redeem");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        ชื่อ
        <input name="name" required autoComplete="name" />
      </label>
      <label>
        อีเมล
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        รหัสผ่าน
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "กำลังสมัคร..." : "สมัครสมาชิก"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
