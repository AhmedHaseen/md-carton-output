// Middleware for route protection and role-based access control
// Only Admin and Manager users can access /admin and /targets

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role;
  const pathname = nextUrl.pathname;

  const isRestrictedPage =
    pathname.startsWith("/admin") || pathname.startsWith("/targets");
  const isRestrictedApi =
    pathname.startsWith("/api/admin") ||
    (pathname.startsWith("/api/targets") && req.method === "PATCH");

  // 1. Not logged in -> redirect to login page
  if (!isLoggedIn) {
    if (isRestrictedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Role-based authorization check: Only ADMIN and MANAGER have access
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";
  if (!isAdminOrManager) {
    if (isRestrictedApi) {
      return NextResponse.json(
        { error: "Access denied. Admin or Manager role required." },
        { status: 403 }
      );
    }
    if (isRestrictedPage) {
      // Redirect non-admin/manager users back to the daily input dashboard
      return NextResponse.redirect(new URL("/", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, api/seed, and static files
    "/((?!login|api/auth|api/seed|_next/static|_next/image|favicon.ico).*)",
  ],
};
