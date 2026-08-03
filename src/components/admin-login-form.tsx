"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("admin", {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      redirect: false,
    });
    setPending(false);
    if (res?.error) {
      setError("อีเมลหรือรหัสผ่านแอดมินไม่ถูกต้อง");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Admin email
        <input name="email" type="email" required defaultValue="admin@minutessharing.com" />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={6} />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "..." : "เข้า Admin"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
