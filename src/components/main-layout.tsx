"use client";

import { useSidebar } from "./sidebar-context";
import { usePathname } from "next/navigation";
import { PanelLeftOpen } from "lucide-react";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isDesktopCollapsed, toggleDesktopSidebar } = useSidebar();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return (
      <main className="flex-1 min-h-screen flex flex-col w-full min-w-0 overflow-x-hidden">
        {children}
      </main>
    );
  }

  return (
    <main
      className={`flex-1 min-h-screen flex flex-col w-full min-w-0 overflow-x-hidden transition-all duration-300 ease-in-out ${
        isDesktopCollapsed ? "lg:ml-0" : "lg:ml-64"
      }`}
    >
      {/* Floating Re-Open Sidebar Button for Desktop when Collapsed */}
      {isDesktopCollapsed && (
        <button
          onClick={toggleDesktopSidebar}
          type="button"
          aria-label="Show sidebar navigation (Ctrl+B)"
          title="Show sidebar navigation (Ctrl+B)"
          className="hidden lg:inline-flex fixed top-3.5 left-4 z-40 items-center gap-2 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-white rounded-xl shadow-lg border border-slate-700/80 active:scale-95 transition-all text-xs font-bold cursor-pointer backdrop-blur-md hover:ring-2 hover:ring-blue-500/40 group animate-in fade-in slide-in-from-left-2 duration-200"
        >
          <PanelLeftOpen size={16} className="text-cyan-400 group-hover:text-white transition-colors" />
          <span className="tracking-wide">Show Menu</span>
          <kbd className="hidden xl:inline text-[10px] bg-slate-800 px-1 py-0.2 rounded text-slate-400 border border-slate-700 font-mono">
            Ctrl+B
          </kbd>
        </button>
      )}

      <div
        className={`px-3.5 py-4 sm:p-6 lg:p-8 w-full mx-auto page-enter flex-1 min-w-0 transition-all duration-300 ${
          isDesktopCollapsed ? "max-w-[1700px] lg:pl-36" : "max-w-[1440px]"
        }`}
      >
        {children}
      </div>
    </main>
  );
}
