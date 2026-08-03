import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  const needsAuth =
    pathname.startsWith("/library") ||
    pathname.startsWith("/redeem") ||
    pathname.startsWith("/devices") ||
    pathname.startsWith("/learn") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (needsAuth && !token) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    token?.role !== "ADMIN"
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/library/:path*",
    "/redeem/:path*",
    "/devices/:path*",
    "/learn/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
