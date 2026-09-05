"use client";

import { usePathname } from "next/navigation";

const HIDDEN_PREFIXES = [
  "/library",
  "/redeem",
  "/devices",
  "/admin",
  "/learn",
];

function shouldHideChrome(pathname: string) {
  return HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Hide legacy top header on app-shell / learn / admin routes */
export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const hide = shouldHideChrome(pathname);

  return (
    <>
      {!hide && header}
      <main>{children}</main>
      {!hide && footer}
    </>
  );
}
