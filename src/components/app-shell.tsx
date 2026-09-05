"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

type Props = {
  userName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
};

const learnerLinks = [
  { href: "/library", label: "คอร์สของฉัน", icon: "menu_book" },
  { href: "/redeem", label: "เพิ่มคีย์", icon: "vpn_key" },
  { href: "/devices", label: "อุปกรณ์", icon: "devices" },
];

export function AppShell({
  userName,
  userEmail,
  isAdmin,
  signOutAction,
  children,
}: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const greeting = userName?.trim() || userEmail?.split("@")[0] || "ผู้เรียน";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  const links = (
    <>
      {learnerLinks.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`app-shell__link ${active ? "is-active" : ""}`}
            onClick={closeMenu}
          >
            <span className="app-shell__icon" aria-hidden>
              <Icon name={link.icon} />
            </span>
            {link.label}
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          className={`app-shell__link ${pathname.startsWith("/admin") ? "is-active" : ""}`}
          onClick={closeMenu}
        >
          <span className="app-shell__icon" aria-hidden>
            <Icon name="admin_panel_settings" />
          </span>
          หลังบ้าน
        </Link>
      )}
    </>
  );

  return (
    <div className="app-shell">
      <aside className="app-shell__aside">
        <div className="app-shell__brand">
          <Image
            src="/logo-minutes-sharing.png"
            alt=""
            width={36}
            height={36}
            className="app-shell__logo"
          />
          <div>
            <p className="app-shell__brand-name">MinutesLearn</p>
            <p className="app-shell__brand-sub">พื้นที่เรียน</p>
          </div>
        </div>

        <nav className="app-shell__nav" aria-label="เมนูหลัก">
          {links}
        </nav>

        <div className="app-shell__foot">
          <form action={signOutAction}>
            <button
              type="submit"
              className="app-shell__link app-shell__link--ghost"
            >
              <span className="app-shell__icon" aria-hidden>
                <Icon name="logout" />
              </span>
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>

      <div className="app-shell__main">
        <header className="app-shell__top">
          <div className="app-shell__top-brand">
            <Image
              src="/logo-minutes-sharing.png"
              alt=""
              width={28}
              height={28}
              className="app-shell__logo"
            />
            <span>MinutesLearn</span>
          </div>

          <div className="app-shell__user">
            <span className="app-shell__user-name">{greeting}</span>
            <span className="app-shell__avatar" aria-hidden>
              {greeting.slice(0, 1).toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            className="app-shell__nav-menu"
            aria-label={menuOpen ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={menuOpen}
            aria-controls="app-shell-nav-drawer"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </header>

        {menuOpen && (
          <>
            <button
              type="button"
              className="app-shell__nav-backdrop"
              aria-label="ปิดเมนู"
              onClick={closeMenu}
            />
            <nav
              id="app-shell-nav-drawer"
              className="app-shell__nav-drawer"
              aria-label="เมนูมือถือ"
            >
              <div className="app-shell__nav-drawer-head">
                <p className="app-shell__brand-name">เมนู</p>
                <p className="app-shell__brand-sub">{greeting}</p>
              </div>
              <div className="app-shell__nav-drawer-links">{links}</div>
              <div className="app-shell__foot">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="app-shell__link app-shell__link--ghost"
                  >
                    <span className="app-shell__icon" aria-hidden>
                      <Icon name="logout" />
                    </span>
                    ออกจากระบบ
                  </button>
                </form>
              </div>
            </nav>
          </>
        )}

        <div className="app-shell__content">{children}</div>
      </div>
    </div>
  );
}
