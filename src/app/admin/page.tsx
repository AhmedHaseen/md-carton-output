"use client";

import { useState, useEffect } from "react";
import { format, subMonths } from "date-fns";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  UserPlus,
  X,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  UserMinus,
  Eye,
  EyeOff,
  Copy,
  Check,
  CalendarDays,
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  Sliders,
  Lock,
  Clock,
  Target,
  Database,
  AlertTriangle,
  HardDrive,
  Search,
  AlertCircle,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  username: string;
  displayPassword?: string;
  role: string;
  createdAt: string;
}

interface ShiftSchedule {
  morningTeam: "A" | "B";
  eveningTeam: "A" | "B";
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  diffWeeks: number;
  isCurrentWeek?: boolean;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"shifts" | "users" | "cleanup">("shifts");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Shift Rotation Settings state
  const [schedules, setSchedules] = useState<ShiftSchedule[]>([]);
  const [existingDays, setExistingDays] = useState<any[]>([]);
  const [swappingWeek, setSwappingWeek] = useState<string | null>(null);
  const [overrideDate, setOverrideDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [overrideMorningTeam, setOverrideMorningTeam] = useState<"A" | "B">("A");
  const [applyingOverride, setApplyingOverride] = useState(false);

  // Password visibility & copy state
  const [hiddenPasswords, setHiddenPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User creation form
  const [showUserForm, setShowUserForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formRole, setFormRole] = useState("OPERATOR");
  const [creating, setCreating] = useState(false);

  // User deletion state
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Data Retention / Cleanup state
  const [cleanupStartDate, setCleanupStartDate] = useState("2026-01-01");
  const [cleanupEndDate, setCleanupEndDate] = useState("2026-08-31");
  const [scanningRecords, setScanningRecords] = useState(false);
  const [purgePreview, setPurgePreview] = useState<{
    workDaysCount: number;
    entriesCount: number;
    overridesCount: number;
    earliestDate: string | null;
    latestDate: string | null;
  } | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    message: string;
    deletedDays: number;
    deletedEntries: number;
  } | null>(null);

  const handleScanRange = async () => {
    if (!cleanupStartDate || !cleanupEndDate) {
      toast.error("Please select both start date and end date");
      return;
    }
    if (cleanupStartDate > cleanupEndDate) {
      toast.error("Start date cannot be after end date");
      return;
    }
    setScanningRecords(true);
    setPurgeResult(null);
    try {
      const res = await fetch(`/api/admin?type=purge_preview&startDate=${cleanupStartDate}&endDate=${cleanupEndDate}`);
      const data = await res.json();
      if (res.ok && data.preview) {
        setPurgePreview(data.preview);
        if (data.preview.workDaysCount === 0) {
          toast.success("Scan complete: No stored records found in this date range.");
        } else {
          toast.success(`Found ${data.preview.workDaysCount} work day(s) and ${data.preview.entriesCount} output records.`);
        }
      } else {
        toast.error(data.error || "Failed to scan database");
      }
    } catch {
      toast.error("Network error scanning database");
    } finally {
      setScanningRecords(false);
    }
  };

  const handleExecutePurge = async () => {
    if (purgeConfirmText !== "DELETE") {
      toast.error("Please type DELETE in capital letters to confirm");
      return;
    }
    setPurging(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PURGE_DATE_RANGE",
          startDate: cleanupStartDate,
          endDate: cleanupEndDate,
          confirmation: "DELETE",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Database cleaned successfully!");
        setPurgeResult({
          message: data.message,
          deletedDays: data.deletedDays,
          deletedEntries: data.deletedEntries,
        });
        setPurgePreview(null);
        setShowPurgeModal(false);
        setPurgeConfirmText("");
      } else {
        toast.error(data.error || "Failed to purge database");
      }
    } catch {
      toast.error("Network error purging database");
    } finally {
      setPurging(false);
    }
  };

  const setPresetRange = (preset: "jan_aug_2026" | "3_months" | "6_months" | "year_2025") => {
    setPurgeResult(null);
    setPurgePreview(null);
    const today = new Date();
    if (preset === "jan_aug_2026") {
      setCleanupStartDate("2026-01-01");
      setCleanupEndDate("2026-08-31");
    } else if (preset === "3_months") {
      setCleanupStartDate("2025-01-01");
      setCleanupEndDate(format(subMonths(today, 3), "yyyy-MM-dd"));
    } else if (preset === "6_months") {
      setCleanupStartDate("2025-01-01");
      setCleanupEndDate(format(subMonths(today, 6), "yyyy-MM-dd"));
    } else if (preset === "year_2025") {
      setCleanupStartDate("2025-01-01");
      setCleanupEndDate("2025-12-31");
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role !== "ADMIN" && role !== "MANAGER") {
        toast.error("Access restricted: Admin or Manager role required.");
        router.replace("/");
      }
    }
  }, [session, status, router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "users" || tab === "shifts" || tab === "cleanup") {
        setActiveTab(tab);
      }
    }
  }, []);

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?type=shifts");
      const data = await res.json();
      setSchedules(data.schedules || []);
      setExistingDays(data.existingDays || []);
    } catch {
      toast.error("Failed to load shift rotation schedule");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?type=users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "shifts") fetchShifts();
    else fetchUsers();
  }, [activeTab]);

  const handleSwapWeek = async (weekStart: string, weekEnd: string, currentMorning: "A" | "B") => {
    const newMorning = currentMorning === "A" ? "B" : "A";
    setSwappingWeek(weekStart);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "shifts",
          action: "SWAP_WEEK",
          weekStart,
          weekEnd,
          morningTeam: newMorning,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update shift schedule");
        return;
      }
      toast.success(
        `Week updated! Morning is now Shift ${newMorning}, Evening is Shift ${newMorning === "A" ? "B" : "A"}`
      );
      await fetchShifts();
    } catch {
      toast.error("Failed to update shift schedule");
    } finally {
      setSwappingWeek(null);
    }
  };

  const handleApplyDayOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideDate) {
      toast.error("Please select a date");
      return;
    }
    setApplyingOverride(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "shifts",
          action: "OVERRIDE_DAY",
          date: overrideDate,
          morningTeam: overrideMorningTeam,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to override day");
        return;
      }
      toast.success(
        `Day ${overrideDate} set to Morning Shift ${overrideMorningTeam} • Evening Shift ${overrideMorningTeam === "A" ? "B" : "A"}`
      );
      await fetchShifts();
    } catch {
      toast.error("Failed to override day");
    } finally {
      setApplyingOverride(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formUsername || !formPassword) {
      toast.error("All fields are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          username: formUsername,
          password: formPassword,
          role: formRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create user");
        return;
      }
      toast.success(`User "${formUsername}" created!`);
      setShowUserForm(false);
      setFormName("");
      setFormUsername("");
      setFormPassword("");
      setShowFormPassword(false);
      setFormRole("OPERATOR");
      fetchUsers();
    } catch {
      toast.error("Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to remove user");
        return;
      }
      toast.success(`User "${username}" removed successfully`);
      setUserToDelete(null);
      fetchUsers();
    } catch {
      toast.error("Network error while removing user");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyPassword = (id: string, pass: string) => {
    navigator.clipboard.writeText(pass);
    setCopiedId(id);
    toast.success("Password copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleHidePassword = (id: string) => {
    setHiddenPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: "bg-emerald-100 text-emerald-700",
      UPDATE: "bg-blue-100 text-blue-700",
      DELETE: "bg-red-100 text-red-700",
      OVERRIDE: "bg-amber-100 text-amber-700",
      RESET: "bg-slate-100 text-slate-700",
    };
    return (
      <span className={`badge ${colors[action] || "bg-slate-100 text-slate-600"}`}>
        {action}
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      ADMIN: "bg-red-100 text-red-700",
      MANAGER: "bg-purple-100 text-purple-700",
      OPERATOR: "bg-blue-100 text-blue-700",
    };
    return (
      <span className={`badge ${colors[role] || "bg-slate-100 text-slate-600"}`}>
        {role}
      </span>
    );
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const role = session?.user?.role;
  if (status === "authenticated" && role !== "ADMIN" && role !== "MANAGER") {
    return (
      <div className="py-20 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          Only Admin and Manager accounts are authorized to access this page. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full pb-10">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
          Admin Control Center
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          User access management, privilege roles, and system settings
        </p>
      </div>

      {/* Tabs (Responsive segmented control) */}
      <div className="w-full sm:w-fit grid grid-cols-1 sm:grid-cols-3 gap-1 bg-slate-200/80 rounded-2xl p-1 mb-6">
        <button
          onClick={() => setActiveTab("shifts")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "shifts"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <CalendarDays size={16} className="shrink-0" />
          <span className="truncate">Shift Duties</span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "users"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users size={16} className="shrink-0" />
          <span className="truncate">Users &amp; Roles</span>
        </button>
        <button
          onClick={() => setActiveTab("cleanup")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "cleanup"
              ? "bg-white text-amber-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Database size={16} className="shrink-0 text-amber-600" />
          <span className="truncate">Data Cleanup &amp; Storage</span>
        </button>
      </div>

      {/* ─── Shift Duty Settings Tab ───────────────────────────────────── */}
      {activeTab === "shifts" && (
        <div className="space-y-6">
          {/* Top Policy Notice */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50/60 to-purple-50/40 border border-blue-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center text-blue-700 shrink-0 mt-0.5">
                  <CalendarDays size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Weekly Shift Duty Rotation Policy
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5 max-w-2xl">
                    The factory operates 2 shifts: <strong>Morning (05:30 AM – 01:30 PM)</strong> and <strong>Evening (01:30 PM – 09:30 PM)</strong>.
                    Duties alternate weekly between <strong>Shift A</strong> and <strong>Shift B</strong>.
                    The system automatically sets defaults for all current and upcoming weeks.
                  </p>
                </div>
              </div>
              <button
                onClick={fetchShifts}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer self-start sm:self-auto"
                title="Refresh schedule"
              >
                <RefreshCcw size={14} className={loading ? "animate-spin text-blue-600" : ""} />
                <span>Refresh Schedule</span>
              </button>
            </div>
          </div>

          {/* Current Active Week Hero Card */}
          {(() => {
            const currentWeek = schedules.find((s) => s.isCurrentWeek) || schedules[1] || schedules[0];
            if (!currentWeek) return null;

            return (
              <div className="bg-white rounded-2xl p-5 border-2 border-blue-500/80 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-blue-600 text-white text-[11px] font-black uppercase px-4 py-1 rounded-bl-xl tracking-wider shadow-xs">
                  Active Current Week
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-1">
                      Current Factory Duty
                    </span>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                      {currentWeek.weekLabel}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Monday to Sunday • MD Carton Output Line
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {/* Morning Card */}
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200">
                      <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                        AM
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                          Morning Shift (05:30 AM – 01:30 PM)
                        </p>
                        <p className="text-base font-black text-slate-900">
                          Shift {currentWeek.morningTeam}
                        </p>
                      </div>
                    </div>

                    {/* Evening Card */}
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200">
                      <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                        PM
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                          Evening Shift (01:30 PM – 09:30 PM)
                        </p>
                        <p className="text-base font-black text-slate-900">
                          Shift {currentWeek.eveningTeam}
                        </p>
                      </div>
                    </div>

                    {/* Swap Button */}
                    <button
                      type="button"
                      disabled={swappingWeek === currentWeek.weekStart}
                      onClick={() =>
                        handleSwapWeek(currentWeek.weekStart, currentWeek.weekEnd, currentWeek.morningTeam)
                      }
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <ArrowLeftRight size={14} />
                      <span>
                        {swappingWeek === currentWeek.weekStart ? "Updating..." : "Swap This Week (A ⇄ B)"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Weekly Rotation Schedule Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                  <CalendarDays size={18} className="text-blue-600" />
                  <span>Rotation Calendar (Upcoming Weeks)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Weekly alternating duties automatically calculated by the system
                </p>
              </div>
            </div>

            <div className="overflow-x-auto touch-scroll">
              <table className="w-full min-w-[640px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4 sm:px-6">Week Range</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Morning Duty (05:30 AM – 01:30 PM)</th>
                    <th className="py-3 px-4">Evening Duty (01:30 PM – 09:30 PM)</th>
                    <th className="py-3 px-4 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {schedules.map((item) => {
                    const isCurrent = !!item.isCurrentWeek;
                    const isSwapping = swappingWeek === item.weekStart;

                    return (
                      <tr
                        key={item.weekStart}
                        className={`transition-colors ${
                          isCurrent
                            ? "bg-blue-50/40 font-semibold"
                            : "hover:bg-slate-50/60"
                        }`}
                      >
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="font-bold text-slate-900">{item.weekLabel}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {item.weekStart} to {item.weekEnd}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-600 text-white shadow-xs">
                              <CheckCircle2 size={11} /> Current
                            </span>
                          ) : item.diffWeeks > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              Upcoming
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                              Past Week
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black shadow-xs ${
                              item.morningTeam === "A"
                                ? "bg-blue-600 text-white"
                                : "bg-indigo-600 text-white"
                            }`}
                          >
                            Shift {item.morningTeam}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black shadow-xs ${
                              item.eveningTeam === "A"
                                ? "bg-blue-600 text-white"
                                : "bg-indigo-600 text-white"
                            }`}
                          >
                            Shift {item.eveningTeam}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            disabled={isSwapping}
                            onClick={() =>
                              handleSwapWeek(item.weekStart, item.weekEnd, item.morningTeam)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all shadow-xs hover:shadow cursor-pointer disabled:opacity-50"
                            title={`Swap week to Morning ${item.morningTeam === "A" ? "B" : "A"}`}
                          >
                            <ArrowLeftRight size={13} />
                            <span>{isSwapping ? "Swapping..." : `Swap to Shift ${item.morningTeam === "A" ? "B" : "A"}`}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Single Day Custom Override Section */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={18} className="text-amber-600" />
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                Custom Single-Day Duty Override
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 max-w-xl">
              Need to adjust shift teams for a specific date due to factory holidays or special schedules? Choose a date and set its morning duty.
            </p>

            <form onSubmit={handleApplyDayOverride} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Target Date</label>
                <input
                  type="date"
                  value={overrideDate}
                  onChange={(e) => setOverrideDate(e.target.value)}
                  className="px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-xs"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Morning Duty Assignment</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideMorningTeam("A")}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      overrideMorningTeam === "A"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Morning: Shift A (Evening: B)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideMorningTeam("B")}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      overrideMorningTeam === "B"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Morning: Shift B (Evening: A)
                  </button>
                </div>
              </div>

              <div className="self-end sm:self-auto pt-0 sm:pt-5">
                <button
                  type="submit"
                  disabled={applyingOverride}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer min-h-[38px] flex items-center justify-center gap-1.5"
                >
                  {applyingOverride ? "Applying..." : "Apply Override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Users Tab ───────────────────────────────────────────────── */}
      {activeTab === "users" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <Users size={18} className="text-blue-600" />
              <span>User Directory</span>
            </h2>
            <button
              onClick={() => setShowUserForm(!showUserForm)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              {showUserForm ? (
                <>
                  <X size={14} /> <span>Cancel</span>
                </>
              ) : (
                <>
                  <UserPlus size={14} /> <span>Add User</span>
                </>
              )}
            </button>
          </div>

          {/* Create User Form (Responsive Grid) */}
          {showUserForm && (
            <div className="p-4 sm:p-6 border-b border-slate-200/80 bg-blue-50/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-3">
                Create New System Account
              </h3>
              <form
                onSubmit={handleCreateUser}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., John Doe"
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="e.g., johnd"
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full h-10 pl-3 pr-9 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                      title={showFormPassword ? "Hide password" : "Show password"}
                      aria-label={showFormPassword ? "Hide password" : "Show password"}
                    >
                      {showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Role
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="OPERATOR">Operator / Staff (Daily Input & Operations)</option>
                    <option value="MANAGER">Manager (Full Access)</option>
                    <option value="ADMIN">Admin (Full System Access)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Save User"}
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ─── MOBILE USER CARDS (< 640px) ─────────────────────────── */}
              <div className="block sm:hidden p-3 space-y-3 bg-slate-50/50">
                {users.map((user) => {
                  const isCurrentUser =
                    session?.user?.id === user.id ||
                    session?.user?.username === user.username;
                  const isConfirming = userToDelete?.id === user.id;
                  const isHidden = hiddenPasswords[user.id];

                  return (
                    <div
                      key={user.id}
                      className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{user.name}</h4>
                          <p className="font-mono text-xs text-slate-500 mt-0.5">
                            @{user.username}
                          </p>
                        </div>
                        <div>{getRoleBadge(user.role)}</div>
                      </div>

                      {/* Password pill */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Password:
                          </span>
                          <code className="font-mono text-xs font-bold text-slate-800 select-all tracking-wider">
                            {isHidden ? "••••••••" : (user.displayPassword || "••••••••")}
                          </code>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleHidePassword(user.id)}
                            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                            title={isHidden ? "Show password" : "Hide password"}
                            aria-label={isHidden ? "Show password" : "Hide password"}
                          >
                            {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          {user.displayPassword && (
                            <button
                              type="button"
                              onClick={() => handleCopyPassword(user.id, user.displayPassword!)}
                              className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                              title="Copy password"
                              aria-label="Copy password"
                            >
                              {copiedId === user.id ? (
                                <Check size={16} className="text-emerald-600" />
                              ) : (
                                <Copy size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Footer: Date & Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
                        <span>Created {format(new Date(user.createdAt), "MMM d, yyyy")}</span>
                        <div>
                          {isCurrentUser ? (
                            <span className="text-xs text-slate-400 italic">Active Account</span>
                          ) : isConfirming ? (
                            <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-xl border border-red-200 shadow-xs">
                              <span className="text-[11px] font-bold text-red-700 pl-1">
                                Delete?
                              </span>
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                disabled={deletingId === user.id}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer min-h-[32px]"
                              >
                                {deletingId === user.id ? "Deleting..." : "Confirm"}
                              </button>
                              <button
                                onClick={() => setUserToDelete(null)}
                                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer min-h-[32px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs border border-red-200/80 active:scale-95 cursor-pointer min-h-[34px]"
                            >
                              <Trash2 size={13} />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ─── DESKTOP/TABLET TABLE (>= 640px) ─────────────────────── */}
              <div className="hidden sm:block overflow-x-auto touch-scroll">
                <table className="data-table text-xs sm:text-sm min-w-[580px]">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Password</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                <tbody>
                  {users.map((user) => {
                    const isCurrentUser =
                      session?.user?.id === user.id ||
                      session?.user?.username === user.username;
                    const isConfirming = userToDelete?.id === user.id;
                    const isHidden = hiddenPasswords[user.id];

                    return (
                      <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="font-semibold text-slate-800">
                          <span>{user.name}</span>
                        </td>
                        <td className="font-mono font-medium text-slate-600">
                          @{user.username}
                        </td>
                        <td>
                          <div className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/70 px-2.5 py-1 rounded-lg border border-slate-200/80 transition-colors">
                            <code className="font-mono text-xs font-bold text-slate-800 select-all tracking-wider">
                              {isHidden ? "••••••••" : (user.displayPassword || "••••••••")}
                            </code>
                            <button
                              type="button"
                              onClick={() => toggleHidePassword(user.id)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors cursor-pointer"
                              title={isHidden ? "Show password" : "Hide password"}
                            >
                              {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            {user.displayPassword && (
                              <button
                                type="button"
                                onClick={() => handleCopyPassword(user.id, user.displayPassword!)}
                                className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition-colors cursor-pointer"
                                title="Copy password"
                              >
                                {copiedId === user.id ? (
                                  <Check size={13} className="text-emerald-600" />
                                ) : (
                                  <Copy size={13} />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{getRoleBadge(user.role)}</td>
                        <td className="text-slate-500 whitespace-nowrap">
                          {format(new Date(user.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="text-center whitespace-nowrap">
                          {isCurrentUser ? (
                            <span className="text-xs text-slate-400 italic">
                              Active Account
                            </span>
                          ) : isConfirming ? (
                            <div className="inline-flex items-center gap-1.5 bg-red-50 p-1 rounded-xl border border-red-200 shadow-xs animate-fade-in">
                              <span className="text-[11px] font-bold text-red-700 pl-1">
                                Delete?
                              </span>
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                disabled={deletingId === user.id}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                                id={`confirm-delete-${user.username}`}
                              >
                                {deletingId === user.id ? "Deleting..." : "Confirm"}
                              </button>
                              <button
                                onClick={() => setUserToDelete(null)}
                                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 transition-colors text-xs font-bold border border-red-200/80 shadow-xs active:scale-95 cursor-pointer"
                              title={`Remove user ${user.username}`}
                              id={`delete-user-${user.username}`}
                            >
                              <Trash2 size={13} />
                              <span>Remove</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>
      )}

      {/* ─── Data Cleanup & Storage Retention Tab ─────────────────────────── */}
      {activeTab === "cleanup" && (
        <div className="space-y-6">
          {/* Neon Cloud Optimization & Usage Policy Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50/60 to-red-50/40 border border-amber-200/80 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                <Database size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Database Retention &amp; Storage Cleanup
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                    Neon Free Tier (0.5 GB Storage / 5 GB Transfer)
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
                  To keep PostgreSQL storage and monthly network egress far below Neon free tier thresholds, use this panel to permanently delete historical completed periods (e.g. past months).
                  Deleting a work day automatically cascades and purges all associated hourly carton entries and target overrides cleanly from the database.
                </p>
              </div>
            </div>
          </div>

          {/* Purge Success Banner */}
          {purgeResult && (
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3 shadow-xs animate-fade-in">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Database Cleanup Successful!</h4>
                <p className="text-xs sm:text-sm text-emerald-800 mt-0.5">{purgeResult.message}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs font-bold text-emerald-700">
                  <span>✓ {purgeResult.deletedDays} work day(s) permanently deleted</span>
                  <span>✓ ~{purgeResult.deletedEntries} hourly carton records freed</span>
                </div>
              </div>
            </div>
          )}

          {/* Period Selector Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <Calendar size={18} className="text-blue-600" />
                  <span>Select Historical Period to Clean</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select start and end dates to scan records and purge them from the database
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400 font-semibold mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => setPresetRange("jan_aug_2026")}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Jan – Aug 2026
                </button>
                <button
                  type="button"
                  onClick={() => setPresetRange("3_months")}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Older than 3 Mo
                </button>
                <button
                  type="button"
                  onClick={() => setPresetRange("6_months")}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Older than 6 Mo
                </button>
                <button
                  type="button"
                  onClick={() => setPresetRange("year_2025")}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Year 2025
                </button>
              </div>
            </div>

            {/* Date Inputs Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  From Date (Start of Range)
                </label>
                <input
                  type="date"
                  value={cleanupStartDate}
                  onChange={(e) => {
                    setCleanupStartDate(e.target.value);
                    setPurgePreview(null);
                    setPurgeResult(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  To Date (End of Range)
                </label>
                <input
                  type="date"
                  value={cleanupEndDate}
                  onChange={(e) => {
                    setCleanupEndDate(e.target.value);
                    setPurgePreview(null);
                    setPurgeResult(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleScanRange}
                  disabled={scanningRecords}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50 cursor-pointer min-h-[42px]"
                >
                  <Search size={16} className={scanningRecords ? "animate-spin" : ""} />
                  <span>{scanningRecords ? "Scanning Database..." : "Scan Database Records"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Scan Results Card */}
          {purgePreview && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <HardDrive size={18} className="text-amber-600" />
                    <span>Scan Results for Selected Period</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Range: <strong className="text-slate-700">{cleanupStartDate}</strong> to <strong className="text-slate-700">{cleanupEndDate}</strong>
                  </p>
                </div>

                {purgePreview.workDaysCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPurgeConfirmText("");
                      setShowPurgeModal(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-xs transition-all cursor-pointer"
                  >
                    <Trash2 size={16} />
                    <span>Delete All Data in this Period</span>
                  </button>
                )}
              </div>

              {purgePreview.workDaysCount === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Data Found in This Range</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    There are no working days or carton records stored between {cleanupStartDate} and {cleanupEndDate}.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                      <span className="text-xs font-semibold text-amber-700 block mb-1">Working Days to Delete</span>
                      <span className="text-2xl font-black text-amber-900">{purgePreview.workDaysCount}</span>
                      <span className="text-xs text-amber-600 font-medium block mt-1">Full production days</span>
                    </div>

                    <div className="p-4 rounded-xl bg-red-50/70 border border-red-200">
                      <span className="text-xs font-semibold text-red-700 block mb-1">Production Hourly Entries</span>
                      <span className="text-2xl font-black text-red-900">{purgePreview.entriesCount.toLocaleString()}</span>
                      <span className="text-xs text-red-600 font-medium block mt-1">Hourly slot carton rows</span>
                    </div>

                    <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200">
                      <span className="text-xs font-semibold text-purple-700 block mb-1">Target Overrides</span>
                      <span className="text-2xl font-black text-purple-900">{purgePreview.overridesCount}</span>
                      <span className="text-xs text-purple-600 font-medium block mt-1">Audit override records</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-800">
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Clicking <strong>Delete All Data in this Period</strong> will permanently erase these {purgePreview.workDaysCount} days and ~{purgePreview.entriesCount.toLocaleString()} hourly carton records from your Neon database, freeing storage immediately.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Safety Confirmation Modal for Permanent Purge ─── */}
      {showPurgeModal && purgePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-red-200 animate-scale-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Permanently Delete Selected Period Data?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This action cannot be undone. Historical records will be erased completely.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1.5 mb-4">
              <p className="font-bold">
                You are about to delete:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li><strong>{purgePreview.workDaysCount}</strong> working days</li>
                <li><strong>~{purgePreview.entriesCount.toLocaleString()}</strong> hourly carton output entries</li>
                <li><strong>{purgePreview.overridesCount}</strong> target override records</li>
                <li>From <strong>{cleanupStartDate}</strong> to <strong>{cleanupEndDate}</strong></li>
              </ul>
              <p className="font-semibold text-red-900 pt-1">
                This will free database storage on your Neon PostgreSQL free plan.
              </p>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Type <span className="font-mono text-red-600 bg-red-50 px-1 py-0.5 rounded border border-red-200">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tracking-wider focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:border-red-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowPurgeModal(false);
                  setPurgeConfirmText("");
                }}
                disabled={purging}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePurge}
                disabled={purgeConfirmText !== "DELETE" || purging}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
              >
                <Trash2 size={16} className={purging ? "animate-spin" : ""} />
                <span>{purging ? "Deleting Records..." : "Permanently Purge Records"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
