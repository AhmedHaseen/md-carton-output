"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Target, RotateCcw, History, AlertTriangle, Clock, Edit2, ShieldAlert, Sliders } from "lucide-react";
import DatePicker from "@/components/date-picker";
import { formatTimeRange } from "@/lib/calculations";

interface TimeSlot {
  id: string;
  shift: string;
  startTime: string;
  endTime: string;
  sequenceNo: number;
  defaultTarget: number;
}

interface EntryWithOverrides {
  id: string;
  targetCartons: number;
  targetSource: string;
  actualCartons: number | null;
  timeSlot: TimeSlot;
  overrides: Array<{
    id: string;
    oldTarget: number;
    newTarget: number;
    reason: string;
    changedBy: string;
    changedAt: string;
  }>;
}

function TargetSettingsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      return urlDate;
    }
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("md_carton_selected_date");
      if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
        return stored;
      }
    }
    return format(new Date(), "yyyy-MM-dd");
  });

  useEffect(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) && urlDate !== selectedDate) {
      setSelectedDate(urlDate);
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_date", urlDate);
      }
    }
  }, [searchParams, selectedDate]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newDate);
    }
    window.history.replaceState(null, "", `?date=${newDate}`);
  };

  const [defaultSlots, setDefaultSlots] = useState<TimeSlot[]>([]);
  const [entries, setEntries] = useState<EntryWithOverrides[]>([]);
  const [hasWorkDay, setHasWorkDay] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role !== "ADMIN" && role !== "MANAGER") {
        toast.error("Access restricted: Admin or Manager role required.");
        router.replace("/");
      }
    }
  }, [session, status, router]);

  // Override form state
  const [overridingId, setOverridingId] = useState<string | null>(null);
  const [newTarget, setNewTarget] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Target Override Badge display setting
  const [showOverrideBadge, setShowOverrideBadge] = useState<boolean>(true);
  const [updatingSetting, setUpdatingSetting] = useState<boolean>(false);

  // Fetch default slots
  useEffect(() => {
    fetch("/api/targets")
      .then((res) => res.json())
      .then((data) => {
        setDefaultSlots(data.timeSlots || []);
        if (data?.settings && typeof data.settings.showOverrideBadge === "boolean") {
          setShowOverrideBadge(data.settings.showOverrideBadge);
        }
      })
      .catch(() => toast.error("Failed to load time slots"));
  }, []);

  // Fetch date-specific overrides
  const fetchDateData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/targets?date=${date}`);
      const data = await res.json();

      if (data?.settings && typeof data.settings.showOverrideBadge === "boolean") {
        setShowOverrideBadge(data.settings.showOverrideBadge);
      }

      if (data.error || !data.workDay) {
        setHasWorkDay(false);
        setEntries([]);
      } else {
        setHasWorkDay(true);
        setEntries(data.workDay.entries || []);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchDateData(selectedDate);
  }, [selectedDate, fetchDateData]);

  const handleOverride = async () => {
    if (!overridingId || !newTarget || !reason.trim()) {
      toast.error("Target value and reason are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: overridingId,
          newTarget: Number(newTarget),
          reason: reason.trim(),
          changedBy: session?.user?.name || session?.user?.username || "admin",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to override");
        return;
      }

      toast.success("Target overridden successfully");
      setOverridingId(null);
      setNewTarget("");
      setReason("");
      fetchDateData(selectedDate);
    } catch {
      toast.error("Failed to override target");
    } finally {
      setSaving(false);
    }
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
          Only Admin and Manager accounts are authorized to modify targets. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full pb-10">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
          Target Settings &amp; Overrides
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          View system baseline targets and adjust daily shift targets with audit reasons
        </p>
      </div>

      {/* Target Override Badge Display Setting Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
            <Sliders size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 text-sm sm:text-base">
                Daily Input &quot;Override&quot; Badge Display
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  showOverrideBadge
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {showOverrideBadge ? "Shown on Daily Input" : "Hidden on Daily Input"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Admin option: Remove or show the amber &quot;Override&quot; tag on the Daily Input page when targets are customized.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => handleToggleOverrideBadge(!showOverrideBadge)}
            disabled={updatingSetting}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              showOverrideBadge ? "bg-emerald-600" : "bg-slate-300"
            } ${updatingSetting ? "opacity-60 cursor-wait" : ""}`}
            role="switch"
            aria-checked={showOverrideBadge}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                showOverrideBadge ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs font-bold text-slate-700 min-w-[50px]">
            {updatingSetting ? "..." : showOverrideBadge ? "Visible" : "Hidden"}
          </span>
        </div>
      </div>

      {/* ─── Baseline Default Targets Table ───────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 mb-6 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 bg-slate-50/50">
          <h2 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
            <Target size={18} className="text-blue-600" />
            Standard Baseline Targets (16 Slots)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            120 standard cartons / hour • 80 break allowance • 90 tea break allowance
          </p>
        </div>

        <div className="overflow-x-auto touch-scroll">
          <table className="data-table text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Shift</th>
                <th>Time Slot</th>
                <th className="text-center">Target</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {defaultSlots.map((slot) => (
                <tr key={slot.id}>
                  <td className="text-slate-400 font-mono font-semibold">
                    {slot.sequenceNo}
                  </td>
                  <td>
                    <span
                      className={`badge text-[10px] sm:text-xs ${
                        slot.shift === "MORNING"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-indigo-100 text-indigo-800"
                      }`}
                    >
                      {slot.shift}
                    </span>
                  </td>
                  <td className="font-semibold text-slate-800">
                    {formatTimeRange(slot.startTime, slot.endTime)}
                  </td>
                  <td className="text-center">
                    <span
                      className={`font-black text-base ${
                        slot.defaultTarget !== 120
                          ? "text-amber-600"
                          : "text-slate-700"
                      }`}
                    >
                      {slot.defaultTarget}
                    </span>
                  </td>
                  <td className="text-slate-500">
                    {slot.defaultTarget === 80
                      ? "Break Period (80 Cartons)"
                      : slot.defaultTarget === 90
                      ? "Tea Break Period (90 Cartons)"
                      : "Standard Target (120 Cartons)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Date-Specific Overrides ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <History size={18} className="text-amber-600" />
              Daily Target Overrides
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Modify hourly target for any slot on a specific production date
            </p>
          </div>

          <DatePicker
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            label="Select Date"
          />
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && !hasWorkDay && (
          <div className="px-6 py-12 text-center text-slate-500">
            <AlertTriangle size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="font-semibold text-slate-700 text-sm">No working day found for this date.</p>
            <p className="text-xs text-slate-400 mt-1">
              Create a working day from the Daily Input page first before overriding targets.
            </p>
          </div>
        )}

        {!loading && hasWorkDay && (
          <div className="overflow-x-auto touch-scroll">
            <table className="data-table text-xs sm:text-sm">
              <thead>
                <tr>
                  <th>Time Slot</th>
                  <th className="text-center">Active Target</th>
                  <th className="text-center">Type</th>
                  <th>Override History &amp; Reason</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            entry.timeSlot.shift === "MORNING"
                              ? "bg-amber-400"
                              : "bg-indigo-400"
                          }`}
                        />
                        <span>
                          {formatTimeRange(
                            entry.timeSlot.startTime,
                            entry.timeSlot.endTime
                          )}
                        </span>
                      </div>
                    </td>

                    <td className="text-center">
                      <span
                        className={`font-black text-base ${
                          entry.targetSource === "OVERRIDE"
                            ? "text-amber-600"
                            : "text-slate-800"
                        }`}
                      >
                        {entry.targetCartons}
                      </span>
                    </td>

                    <td className="text-center">
                      {entry.targetSource === "OVERRIDE" ? (
                        <span className="badge badge-override text-[10px]">Override</span>
                      ) : (
                        <span className="badge badge-pending text-[10px]">Default</span>
                      )}
                    </td>

                    <td>
                      {entry.overrides.length > 0 ? (
                        <div className="space-y-1">
                          {entry.overrides.slice(0, 2).map((o) => (
                            <div key={o.id} className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-800">
                                {o.oldTarget} → {o.newTarget}
                              </span>
                              <span className="text-slate-400 mx-1">•</span>
                              <span className="italic text-slate-500">"{o.reason}"</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Baseline default</span>
                      )}
                    </td>

                    <td className="text-center">
                      {overridingId === entry.id ? (
                        <div className="flex flex-col gap-2 p-2 bg-amber-50/80 rounded-xl border border-amber-200 min-w-[220px]">
                          <div className="text-left text-[11px] font-bold text-amber-900">
                            Override Target:
                          </div>
                          <input
                            type="number"
                            min="1"
                            placeholder="New Target (Cartons)"
                            value={newTarget}
                            onChange={(e) => setNewTarget(e.target.value)}
                            className="w-full h-9 px-3 bg-white border border-amber-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            autoFocus
                          />
                          <input
                            type="text"
                            placeholder="Reason (required)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full h-9 px-3 bg-white border border-amber-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <div className="flex gap-1.5 pt-1">
                            <button
                              onClick={handleOverride}
                              disabled={saving}
                              className="flex-1 h-8 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Confirm"}
                            </button>
                            <button
                              onClick={() => {
                                setOverridingId(null);
                                setNewTarget("");
                                setReason("");
                              }}
                              className="h-8 px-3 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setOverridingId(entry.id);
                            setNewTarget(entry.targetCartons.toString());
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-bold inline-flex items-center gap-1 border border-amber-200/80"
                        >
                          <Edit2 size={12} />
                          <span>Override</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TargetSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
        </div>
      }
    >
      <TargetSettingsContent />
    </Suspense>
  );
}
