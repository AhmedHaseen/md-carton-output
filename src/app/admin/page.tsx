"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  ScrollText,
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
} from "lucide-react";

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detailsJson: any;
  createdAt: string;
}

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

  const [activeTab, setActiveTab] = useState<"shifts" | "settings" | "users" | "audit">("shifts");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // System Settings state
  const [showOverrideBadge, setShowOverrideBadge] = useState<boolean>(true);
  const [enforce30MinLock, setEnforce30MinLock] = useState<boolean>(true);
  const [updatingSetting, setUpdatingSetting] = useState<boolean>(false);
  const [updatingLockSetting, setUpdatingLockSetting] = useState<boolean>(false);

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
      if (tab === "users" || tab === "audit" || tab === "shifts" || tab === "settings") {
        setActiveTab(tab);
      }
    }
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?type=settings");
      const data = await res.json();
      if (data?.settings) {
        if (typeof data.settings.showOverrideBadge === "boolean") {
          setShowOverrideBadge(data.settings.showOverrideBadge);
        }
        if (typeof data.settings.enforce30MinLock === "boolean") {
          setEnforce30MinLock(data.settings.enforce30MinLock);
        }
      }
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOverrideBadge = async (newValue: boolean) => {
    setUpdatingSetting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_SETTING",
          key: "SHOW_OVERRIDE_BADGE",
          value: String(newValue),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowOverrideBadge(newValue);
        toast.success(
          newValue
            ? "Target Override badges are now visible in Daily Input"
            : "Target Override badges are now hidden in Daily Input"
        );
      } else {
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      toast.error("Network error updating setting");
    } finally {
      setUpdatingSetting(false);
    }
  };

  const handleToggleLockSetting = async (newValue: boolean) => {
    setUpdatingLockSetting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_SETTING",
          key: "ENFORCE_30MIN_LOCK",
          value: String(newValue),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEnforce30MinLock(newValue);
        toast.success(
          newValue
            ? "30-Minute Entry Lock is now ENFORCED (operators must submit within 30m of slot end)"
            : "30-Minute Entry Lock is now DISABLED (operators can enter output anytime)"
        );
      } else {
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      toast.error("Network error updating setting");
    } finally {
      setUpdatingLockSetting(false);
    }
  };

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

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?type=audit&limit=100");
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch {
      toast.error("Failed to load audit logs");
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
    else if (activeTab === "settings") fetchSettings();
    else if (activeTab === "audit") fetchAuditLogs();
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
      SUPERVISOR: "bg-amber-100 text-amber-700",
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
          User access management, privilege roles, and system audit logs
        </p>
      </div>

      {/* Tabs (Responsive segmented control) */}
      <div className="w-full sm:w-fit grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-200/80 rounded-2xl p-1 mb-6">
        <button
          onClick={() => setActiveTab("shifts")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "shifts"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <CalendarDays size={16} className="shrink-0" />
          <span className="truncate">Shift Duties</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "settings"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sliders size={16} className="shrink-0" />
          <span className="truncate">System Settings</span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "users"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users size={16} className="shrink-0" />
          <span className="truncate">Users &amp; Roles</span>
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[42px] cursor-pointer ${
            activeTab === "audit"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ScrollText size={16} className="shrink-0" />
          <span className="truncate">Activity Logs</span>
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
                    The factory operates 2 shifts: <strong>Morning (05:30 – 13:30)</strong> and <strong>Evening (13:30 – 21:30)</strong>.
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
                          Morning Shift (05:30 – 13:30)
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
                          Evening Shift (13:30 – 21:30)
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

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4 sm:px-6">Week Range</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Morning Duty (05:30 – 13:30)</th>
                    <th className="py-3 px-4">Evening Duty (13:30 – 21:30)</th>
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

      {/* ─── System Settings Tab ───────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50/50 border border-blue-200/80 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center text-blue-700 shrink-0 mt-0.5">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  System Preferences &amp; Daily Input Configuration
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 max-w-2xl">
                  Configure operational display behaviors and operator interface indicators for the MD Carton line.
                </p>
              </div>
            </div>
          </div>

          {/* Setting Card: Target Override Display Toggle */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-slate-900 text-base sm:text-lg">
                    Show Target Override Badge in Daily Input
                  </h4>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      showOverrideBadge
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {showOverrideBadge ? "Shown (Active)" : "Hidden (Clean Mode)"}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xl">
                  When a target has been modified (override), an amber <strong>Override</strong> tag normally appears next to the target in the Daily Input table and cards. As an administrator, you can turn off this display option so operators only see standard clean numbers.
                </p>
              </div>

              {/* Interactive Toggle Switch */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  id="toggle-override-badge-btn"
                  onClick={() => handleToggleOverrideBadge(!showOverrideBadge)}
                  disabled={updatingSetting}
                  className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    showOverrideBadge ? "bg-emerald-600" : "bg-slate-300"
                  } ${updatingSetting ? "opacity-60 cursor-wait" : ""}`}
                  role="switch"
                  aria-checked={showOverrideBadge}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      showOverrideBadge ? "translate-x-8" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-xs font-bold text-slate-700 min-w-[55px]">
                  {updatingSetting ? "Saving..." : showOverrideBadge ? "Visible" : "Hidden"}
                </span>
              </div>
            </div>

            {/* Live Visual Comparison Box */}
            <div className="mt-5 pt-1">
              <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                Live Preview: How Daily Input Slots Appear to Operators
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Preview Box */}
                <div
                  className={`p-4 rounded-xl border-2 transition-all ${
                    showOverrideBadge
                      ? "border-emerald-500/80 bg-emerald-50/20 shadow-xs"
                      : "border-blue-500/80 bg-blue-50/20 shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${showOverrideBadge ? "bg-emerald-500" : "bg-blue-500"}`}></span>
                      Current Operator View
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Slot #1 (05:30 – 06:30)</span>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Target
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-lg font-black text-slate-800">140</span>
                        {showOverrideBadge && (
                          <span className="badge badge-override text-[10px] py-0 px-1.5 animate-fade-in">
                            Override
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Actual
                      </span>
                      <span className="text-base font-black text-slate-800">142</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Variance
                      </span>
                      <span className="text-sm font-black text-emerald-600">+2</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {showOverrideBadge
                      ? "The amber 'Override' badge is currently displayed to indicate this slot target was modified."
                      : "The target is displayed cleanly as 140 cartons with NO override badge shown."}
                  </p>
                </div>

                {/* Explanation Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
                  <div>
                    <h6 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
                      <CheckCircle2 size={14} className="text-blue-600 shrink-0" />
                      Guaranteed Calculation Integrity
                    </h6>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Turning off the override badge only affects the visual badge tag on the Daily Input page.
                      The customized target (e.g. 140), hourly variance, efficiency calculations, and shift cumulative performance remain completely intact and accurate.
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Quick action:</span>
                    <button
                      onClick={() => handleToggleOverrideBadge(!showOverrideBadge)}
                      disabled={updatingSetting}
                      className="text-blue-600 hover:text-blue-700 font-bold hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {showOverrideBadge ? "Hide Override Badge" : "Show Override Badge"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Setting Card: 30-Minute Entry Lock Window Toggle */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-sm mt-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-extrabold text-slate-900 text-base sm:text-lg">
                    30-Minute Output Entry Lock Window
                  </h4>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      enforce30MinLock
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {enforce30MinLock ? "Enforced (Active)" : "Disabled (Open Access)"}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xl">
                  Require carton counts for each hourly slot to be submitted within <strong>30 minutes</strong> of slot completion. After 30 minutes, slots automatically lock to prevent back-dated alterations. Admins and Managers retain override access to update any slot.
                </p>
              </div>

              {/* Interactive Toggle Switch */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  id="toggle-lock-window-btn"
                  onClick={() => handleToggleLockSetting(!enforce30MinLock)}
                  disabled={updatingLockSetting}
                  className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    enforce30MinLock ? "bg-emerald-600" : "bg-slate-300"
                  } ${updatingLockSetting ? "opacity-60 cursor-wait" : ""}`}
                  role="switch"
                  aria-checked={enforce30MinLock}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      enforce30MinLock ? "translate-x-8" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-xs font-bold text-slate-700 min-w-[65px]">
                  {updatingLockSetting ? "Saving..." : enforce30MinLock ? "Enforced" : "Disabled"}
                </span>
              </div>
            </div>

            {/* Informational Guidance Box */}
            <div className="mt-5 pt-1">
              <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                Operator Experience & Safeguards
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-1.5 text-slate-800 font-bold text-xs">
                    <Clock size={15} className="text-blue-600" />
                    <span>Countdown Timer for Active Slots</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    When a slot ends (e.g. at 06:30), operators see a live countdown badge: <strong>&ldquo;Closes in 28m&rdquo;</strong>, giving them a clear visual deadline to log the carton count before it locks at 07:00.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-1.5 text-slate-800 font-bold text-xs">
                    <Lock size={15} className="text-amber-600" />
                    <span>Admin & Manager Override</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    If an input is delayed due to network failure, machine stoppage, or supervisor review, Admins and Managers can edit locked slots at any time. The system transparently logs each override in the audit log.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Audit Logs Tab ───────────────────────────────────────────── */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <ScrollText size={18} className="text-blue-600" />
              <span>System Activity Log</span>
            </h2>
            <button
              onClick={fetchAuditLogs}
              className="p-2 hover:bg-slate-200/60 rounded-xl transition-colors text-slate-500 hover:text-slate-800"
              title="Refresh logs"
            >
              <RefreshCcw size={16} />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ScrollText size={36} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No activity events recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto touch-scroll">
              <table className="data-table text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-slate-500 whitespace-nowrap font-medium">
                        {format(
                          new Date(log.createdAt),
                          "MMM d, yyyy h:mm a"
                        )}
                      </td>
                      <td>{getActionBadge(log.action)}</td>
                      <td>
                        <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200/60">
                          {log.entityType}
                        </span>
                      </td>
                      <td className="text-slate-600 max-w-xs truncate">
                        {log.detailsJson
                          ? JSON.stringify(log.detailsJson)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                    <option value="OPERATOR">Operator (Input Only)</option>
                    <option value="SUPERVISOR">Supervisor (Input + Overrides)</option>
                    <option value="MANAGER">Manager (Full Access)</option>
                    <option value="ADMIN">Admin (Full Access)</option>
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
                <table className="data-table text-xs sm:text-sm">
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
    </div>
  );
}
