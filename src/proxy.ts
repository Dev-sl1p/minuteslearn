import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Always allow the admin login page (page itself redirects if already ADMIN)
  if (pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  // Guard /api/admin endpoints
  if (pathname.startsWith("/api/admin")) {
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  const needsAuth =
    pathname.startsWith("/library") ||
    pathname.startsWith("/redeem") ||
    pathname.startsWith("/devices") ||
    pathname.startsWith("/learn") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (needsAuth && !session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    session?.user?.role !== "ADMIN"
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/library/:path*",
    "/redeem/:path*",
    "/devices/:path*",
    "/learn/:path*",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
