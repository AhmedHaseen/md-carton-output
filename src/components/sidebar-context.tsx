"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface SidebarContextType {
  isDesktopCollapsed: boolean;
  toggleDesktopSidebar: () => void;
  setDesktopCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isDesktopCollapsed: false,
  toggleDesktopSidebar: () => {},
  setDesktopCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

  // Restore stored preference from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("md_carton_sidebar_collapsed");
      if (stored === "true") {
        setIsDesktopCollapsed(true);
      }
    }
  }, []);

  const toggleDesktopSidebar = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_sidebar_collapsed", String(next));
      }
      return next;
    });
  };

  const setDesktopCollapsed = (val: boolean) => {
    setIsDesktopCollapsed(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_sidebar_collapsed", String(val));
    }
  };

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleDesktopSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        isDesktopCollapsed,
        toggleDesktopSidebar,
        setDesktopCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
