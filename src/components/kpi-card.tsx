"use client";

import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  color?: "blue" | "green" | "red" | "amber" | "cyan" | "slate";
  badge?: string;
  badgeColor?: "blue" | "indigo" | "amber" | "emerald" | "slate";
}

const colorMap = {
  blue: {
    bg: "bg-blue-50/70",
    icon: "bg-blue-600",
    text: "text-blue-700",
    shadow: "shadow-blue-500/20",
    border: "border-blue-100",
  },
  green: {
    bg: "bg-emerald-50/70",
    icon: "bg-emerald-600",
    text: "text-emerald-700",
    shadow: "shadow-emerald-500/20",
    border: "border-emerald-100",
  },
  red: {
    bg: "bg-red-50/70",
    icon: "bg-red-600",
    text: "text-red-700",
    shadow: "shadow-red-500/20",
    border: "border-red-100",
  },
  amber: {
    bg: "bg-amber-50/70",
    icon: "bg-amber-500",
    text: "text-amber-700",
    shadow: "shadow-amber-500/20",
    border: "border-amber-100",
  },
  cyan: {
    bg: "bg-cyan-50/70",
    icon: "bg-cyan-600",
    text: "text-cyan-700",
    shadow: "shadow-cyan-500/20",
    border: "border-cyan-100",
  },
  slate: {
    bg: "bg-slate-50",
    icon: "bg-slate-600",
    text: "text-slate-700",
    shadow: "shadow-slate-500/20",
    border: "border-slate-200",
  },
};

export default function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "blue",
  badge,
  badgeColor = "blue",
}: KpiCardProps) {
  const colors = colorMap[color];

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-200/90 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <div
          className={`w-9 h-9 sm:w-11 sm:h-11 ${colors.icon} rounded-xl flex items-center justify-center shadow-md ${colors.shadow} shrink-0`}
        >
          <Icon size={19} className="text-white sm:w-5 sm:h-5" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span
              className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full shadow-xs tracking-tight ${
                badgeColor === "indigo"
                  ? "bg-indigo-600 text-white"
                  : badgeColor === "amber"
                  ? "bg-amber-500 text-white"
                  : badgeColor === "emerald"
                  ? "bg-emerald-600 text-white"
                  : badgeColor === "slate"
                  ? "bg-slate-700 text-white"
                  : "bg-blue-600 text-white"
              }`}
            >
              {badge}
            </span>
          )}
          {trend && (
            <span
              className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                trend === "up"
                  ? "bg-emerald-100 text-emerald-700"
                  : trend === "down"
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1 truncate">
          {title}
        </p>
        <p className={`text-xl sm:text-2xl font-extrabold ${colors.text} tracking-tight leading-tight`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1 font-medium truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
