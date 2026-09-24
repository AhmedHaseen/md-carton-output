"use client";

import { SessionProvider } from "next-auth/react";
import { SidebarProvider } from "./sidebar-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </SessionProvider>
  );
}
