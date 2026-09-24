"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  BarChart3,
  CalendarRange,
  Target,
  Shield,
  LogOut,
  Package,
  Menu,
  X,
  Warehouse,
  User,
  Monitor,
  PanelLeftClose,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSidebar } from "./sidebar-context";

interface NavItem {
  label: string;
  href: string;
  icon: any;
  description: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    label: "Daily Input",
    href: "/",
    icon: LayoutDashboard,
    description: "Enter hourly carton output",
  },
  {
    label: "MD Operations",
    href: "/md-operations",
    icon: Monitor,
    description: "Per-line operations analysis",
  },
  {
    label: "Daily Analysis",
    href: "/daily-analysis",
    icon: BarChart3,
    description: "Analyze daily performance",
    adminOnly: true,
  },
  {
    label: "Weekly Analysis",
    href: "/weekly-analysis",
    icon: CalendarRange,
    description: "Weekly performance trends",
    adminOnly: true,
  },
  {
    label: "Target Settings",
    href: "/targets",
    icon: Target,
    description: "Manage targets & overrides",
    adminOnly: true,
  },

  {
    label: "Admin",
    href: "/admin",
    icon: Shield,
    description: "Users & system settings",
    adminOnly: true,
  },
];

export default function Navigation() {
  const pathname = usePathname();
  const { isDesktopCollapsed, toggleDesktopSidebar } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDate, setActiveDate] = useState<string>("");
  const { data: session, status } = useSession();

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent background body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileOpen]);

  // Track active working date across pages
  useEffect(() => {
    const updateActiveDate = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("md_carton_selected_date");
        if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
          setActiveDate(stored);
        }
      }
    };
    updateActiveDate();
    window.addEventListener("storage", updateActiveDate);
    window.addEventListener("focus", updateActiveDate);
    window.addEventListener("md_carton_date_change", updateActiveDate);
    return () => {
      window.removeEventListener("storage", updateActiveDate);
      window.removeEventListener("focus", updateActiveDate);
      window.removeEventListener("md_carton_date_change", updateActiveDate);
    };
  }, [pathname]);

  // Don't show nav on login page (MUST be called AFTER all hooks)
  if (pathname === "/login") return null;

  // Role-based visibility:
  // Operators only see Daily Input and MD Operations (saving Neon transfer bandwidth)
  // Managers and Admins see Analysis, Target Settings & Admin
  const userRole = session?.user?.role;
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly) {
      return status === "authenticated" && isAdminOrManager;
    }
    return true;
  });

  const currentItem =
    navItems.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    ) || navItems[0];

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "ADMIN":
        return (
          <span className="text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">
            Admin
          </span>
        );
      case "MANAGER":
        return (
          <span className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
            Manager
          </span>
        );
      case "OPERATOR":
      default:
        return (
          <span className="text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
            Operator
          </span>
        );
    }
  };

  return (
    <>
      {/* ─── Mobile Sticky Top Header (Hidden on Desktop) ─────────────── */}
      <header className="lg:hidden sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 shadow-md w-full">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Hamburger button (touch target >= 44px) */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-800 text-white border border-slate-700/60 active:scale-95 transition-all"
            aria-label="Toggle Navigation Menu"
            id="mobile-menu-btn"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* Logo & Page Context */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/30">
              <Package size={18} className="text-white" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white">
                  MD Carton
                </span>
                {userRole && getRoleBadge(userRole)}
              </div>
              <p className="text-[11px] text-slate-400 font-medium line-clamp-1">
                {currentItem.label}
              </p>
            </div>
          </div>

          {/* Quick Shift / Plant Indicator */}
          <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800/60 border border-slate-700/40 text-slate-400">
            <Warehouse size={18} className="text-cyan-400" />
          </div>
        </div>
      </header>

      {/* ─── Mobile Drawer Backdrop ──────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 transition-opacity duration-300 animate-fade-in"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── Sidebar Navigation (Drawer on Mobile, Fixed on Desktop) ─── */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-72 sm:w-80 lg:w-64 bg-slate-900 text-white
          flex flex-col shadow-2xl transition-all duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          ${isDesktopCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0 lg:shadow-none"}
        `}
      >
        {/* Logo area */}
        <div className="px-5 py-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Package size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">MD Carton</h1>
              <p className="text-xs text-slate-400 font-medium">Output System</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Desktop collapse button */}
            <button
              onClick={toggleDesktopSidebar}
              type="button"
              className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 active:scale-95 transition-all cursor-pointer"
              aria-label="Hide navigation (expand screen)"
              title="Hide navigation to expand screen (Ctrl+B)"
            >
              <PanelLeftClose size={18} />
            </button>

            {/* Close button for mobile drawer */}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navigation links with generous tap targets */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Main Operations</span>
            {isAdminOrManager && (
              <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                Full Access
              </span>
            )}
          </div>

          {visibleNavItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const targetHref =
              item.href === "/"
                ? activeDate
                  ? `/?date=${activeDate}`
                  : "/"
                : activeDate && (item.href === "/daily-analysis" || item.href === "/weekly-analysis" || item.href === "/targets")
                ? `${item.href}?date=${activeDate}`
                : item.href;

            return (
              <Link
                key={item.href}
                href={targetHref}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium
                  min-h-[46px] active:scale-[0.98]
                  ${
                    isActive
                      ? "bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/30"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }
                `}
                id={`nav-link-${item.href.replace("/", "") || "home"}`}
              >
                <Icon size={20} className={isActive ? "text-white" : "text-slate-400"} />
                <div className="flex-1 flex items-center justify-between">
                  <span>{item.label}</span>
                  {item.adminOnly && (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/80 font-mono">
                      Admin
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer info & User profile card & Logout */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50">
          {/* Active User Card */}
          {session?.user && (
            <div className="px-3 py-2.5 mb-3 bg-slate-800/70 rounded-xl border border-slate-700/60 shadow-inner">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <User size={13} />
                  </div>
                  <p className="text-xs text-slate-200 font-bold truncate">
                    {session.user.name || session.user.username}
                  </p>
                </div>
                {getRoleBadge(session.user.role)}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>@{session.user.username}</span>
                <span>•</span>
                <span className="text-slate-500">FGWH</span>
              </div>
            </div>
          )}

          {/* Quick collapse option for desktop */}
          <button
            onClick={toggleDesktopSidebar}
            type="button"
            className="hidden lg:flex items-center justify-between w-full px-3 py-2 mb-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800 transition-all cursor-pointer group"
            title="Hide navigation to expand screen (Ctrl+B)"
          >
            <span className="flex items-center gap-2">
              <PanelLeftClose size={15} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
              <span>Hide Sidebar</span>
            </span>
            <kbd className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700 font-mono">
              Ctrl+B
            </kbd>
          </button>

          <button
            className="flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-sm font-medium border border-red-500/20 active:scale-98 min-h-[44px] cursor-pointer"
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.removeItem("md_carton_selected_date");
              }
              signOut({ callbackUrl: "/login" });
            }}
            id="signout-btn"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
