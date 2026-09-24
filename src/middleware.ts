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

  const isRestrictedApi =
    pathname.startsWith("/api/admin") ||
    (pathname.startsWith("/api/targets") && req.method === "PATCH");

  // 1. Not logged in -> return 401 for API, or redirect to login page for Web pages
  if (!isLoggedIn) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to continue." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Role-based authorization checks:
  // Operators / Staff are kept strictly to Daily Input (/) and MD Operations (/md-operations)
  // to avoid hitting Neon 5GB network transfer limits on heavy analytical queries.
  // Analysis (/daily-analysis, /weekly-analysis), Targets (/targets), and Admin (/admin) are reserved for Managers and Admins.
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";
  const isManagerOrAdminPage =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/targets") ||
    pathname.startsWith("/daily-analysis") ||
    pathname.startsWith("/weekly-analysis");

  if (!isAdminOrManager) {
    if (isRestrictedApi) {
      return NextResponse.json(
        { error: "Access denied. Admin or Manager role required." },
        { status: 403 }
      );
    }
    if (isManagerOrAdminPage) {
      // Redirect operator/staff users back to the daily input dashboard
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
