"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  isAdmin?: boolean;
  signedIn: boolean;
  signOutAction: () => Promise<void>;
};

export function SiteNav({ isAdmin, signedIn, signOutAction }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = signedIn ? (
    <>
      <Link href="/library" onClick={() => setOpen(false)}>
        คอร์สของฉัน
      </Link>
      <Link href="/redeem" onClick={() => setOpen(false)}>
        เพิ่มคีย์
      </Link>
      <Link href="/devices" onClick={() => setOpen(false)}>
        อุปกรณ์
      </Link>
      {isAdmin && (
        <Link href="/admin" onClick={() => setOpen(false)}>
          Admin
        </Link>
      )}
      <form action={signOutAction}>
        <button type="submit" className="btn btn--ghost">
          ออกจากระบบ
        </button>
      </form>
    </>
  ) : (
    <Link
      href="/login"
      className="btn btn--primary"
      onClick={() => setOpen(false)}
    >
      อีเมล + License key
    </Link>
  );

  return (
    <>
      <nav className="nav nav--desktop">{links}</nav>

      <button
        type="button"
        className="nav-burger"
        aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="nav-backdrop"
            aria-label="ปิดเมนู"
            onClick={() => setOpen(false)}
          />
          <nav className="nav nav--drawer" aria-label="เมนูมือถือ">
            {links}
          </nav>
        </>
      )}
    </>
  );
}
