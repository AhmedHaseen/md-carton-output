"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Package,
  Target,
  TrendingUp,
  BarChart3,
  Clock,
  Zap,
  PlusCircle,
  Lock,
  Sunrise,
  Moon,
  Layers,
  FileText,
  Percent,
} from "lucide-react";
import DatePicker from "@/components/date-picker";
import DailyOutputTable from "@/components/daily-output-table";
import KpiCard from "@/components/kpi-card";
import { calculateSlotData, calculateDailyKPIs } from "@/lib/calculations";
import type { SlotEntry, SlotWithCalculations, DailyKPIs } from "@/lib/calculations";

interface WorkDayData {
  id: string;
  workDate: string;
  status: "OPEN" | "CLOSED";
  morningTeam?: string | null;
  eveningTeam?: string | null;
  entries: Array<{
    id: string;
    actualCartons: number | null;
    targetCartons: number;
    targetSource: "DEFAULT" | "OVERRIDE";
    timeSlot: {
      id: string;
      shift: "MORNING" | "EVENING";
      startTime: string;
      endTime: string;
      sequenceNo: number;
      defaultTarget: number;
    };
  }>;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();

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

  // Sync if URL query parameter changes externally (e.g. sidebar navigation or browser navigation)
  useEffect(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      setSelectedDate(urlDate);
      setWorkDay(null);
      setExists(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_date", urlDate);
        window.dispatchEvent(new CustomEvent("md_carton_date_change"));
      }
    } else {
      // Bare "/" without date query
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("md_carton_selected_date");
        if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
          setSelectedDate(stored);
          setWorkDay(null);
          setExists(false);
          router.replace(`?date=${stored}`, { scroll: false });
          return;
        }
      }
      // Fresh login (no URL date and no stored date): use today
      const todayStr = format(new Date(), "yyyy-MM-dd");
      setSelectedDate(todayStr);
      setWorkDay(null);
      setExists(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_date", todayStr);
        window.dispatchEvent(new CustomEvent("md_carton_date_change"));
      }
      router.replace(`?date=${todayStr}`, { scroll: false });
    }
  }, [searchParams, router]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setWorkDay(null);
    setExists(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newDate);
      window.dispatchEvent(new CustomEvent("md_carton_date_change"));
    }
    router.replace(`?date=${newDate}`, { scroll: false });
  };

  const [workDay, setWorkDay] = useState<WorkDayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exists, setExists] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<"ALL" | "MORNING" | "EVENING">("ALL");
  const [defaultDuty, setDefaultDuty] = useState<{
    morningTeam: "A" | "B";
    eveningTeam: "A" | "B";
    weekRange?: string;
  } | null>(null);
  const [showOverrideBadge, setShowOverrideBadge] = useState<boolean>(true);

  // Fetch work day data
  const fetchWorkDay = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-days?date=${date}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data && data.settings && typeof data.settings.showOverrideBadge === "boolean") {
        setShowOverrideBadge(data.settings.showOverrideBadge);
      }
      if (data && data.defaultDuty) {
        setDefaultDuty(data.defaultDuty);
      }
      if (data && data.exists && data.workDay) {
        setWorkDay(data.workDay);
        setExists(true);
      } else {
        setWorkDay(null);
        setExists(false);
      }
    } catch {
      toast.error("Failed to load data");
      setWorkDay(null);
      setExists(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkDay(selectedDate);
  }, [selectedDate, fetchWorkDay]);

  // Create new work day
  const handleCreateDay = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/work-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create day");
        return;
      }

      setWorkDay(data.workDay);
      setExists(true);
      toast.success("Work day created with 16 time slots!");
    } catch {
      toast.error("Failed to create work day");
    } finally {
      setCreating(false);
    }
  };

  // Save carton count
  const handleSave = async (entryId: string, actualCartons: number | null) => {
    try {
      const res = await fetch("/api/output-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, actualCartons }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save");
        return;
      }

      // Refresh data to get recalculated entries
      await fetchWorkDay(selectedDate);
      toast.success("Saved successfully");
    } catch {
      toast.error("Failed to save entry");
    }
  };

  const handleAssignTeam = async (shift: "MORNING" | "EVENING", team: "A" | "B") => {
    if (!workDay) return;
    try {
      const res = await fetch("/api/work-days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDayId: workDay.id,
          shift,
          team,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to assign shift team");
        return;
      }
      setWorkDay(data.workDay);
      const otherShift = shift === "MORNING" ? "Evening" : "Morning";
      const otherTeam = team === "A" ? "B" : "A";
      toast.success(
        `${shift === "MORNING" ? "Morning" : "Evening"} set to Shift ${team} • ${otherShift} set to Shift ${otherTeam}`
      );
    } catch {
      toast.error("Failed to assign shift team");
    }
  };

  // Transform entries to slot data for calculations
  const slotEntries: SlotEntry[] = workDay?.entries.map((e) => ({
    id: e.id,
    sequenceNo: e.timeSlot.sequenceNo,
    shift: e.timeSlot.shift,
    startTime: e.timeSlot.startTime,
    endTime: e.timeSlot.endTime,
    targetCartons: e.targetCartons,
    actualCartons: e.actualCartons,
    targetSource: e.targetSource,
  })) ?? [];

  const calculatedSlots: SlotWithCalculations[] = calculateSlotData(slotEntries);

  // Overall KPIs for the entire day (all 16 slots)
  const overallKpis: DailyKPIs | null =
    calculatedSlots.length > 0 ? calculateDailyKPIs(calculatedSlots) : null;

  // Filtered slots according to active shift tab
  const filteredSlots =
    shiftFilter === "ALL"
      ? calculatedSlots
      : calculatedSlots.filter((s) => s.shift === shiftFilter);

  // Active KPIs for top metric cards (Morning-only, Evening-only, or All Slots)
  const activeKpis: DailyKPIs | null =
    filteredSlots.length > 0 ? calculateDailyKPIs(filteredSlots) : null;

  return (
    <div className="w-full pb-10">
      {/* ─── Page Header & Responsive Date Navigation ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>Daily Input</span>
            {workDay && (
              <span
                className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  workDay.status === "OPEN"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {workDay.status === "OPEN" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    Open Day
                  </>
                ) : (
                  <>
                    <Lock size={11} className="mr-1" />
                    Closed
                  </>
                )}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Hourly carton output tracking for Metal Detector (FGWH)
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <DatePicker
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
          />
        </div>
      </div>

      {/* ─── Loading State ───────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Loading production data...</p>
          </div>
        </div>
      )}

      {/* ─── No Data Prompt (Create Day) ─────────────────────────────── */}
      {!loading && (!exists || !workDay) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-16 h-16 bg-blue-100/80 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600 shadow-sm">
            <PlusCircle size={32} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
            No Records for {format(new Date(selectedDate + "T00:00:00"), "MMMM d, yyyy")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mb-4 leading-relaxed">
            Create a new working day to start logging hourly Metal Detector carton outputs.
            All 16 time slots (Morning &amp; Evening) will be generated automatically.
          </p>

          {defaultDuty && (
            <div className="mb-6 inline-flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3.5 py-2 rounded-xl bg-slate-100/90 border border-slate-200 text-xs font-semibold text-slate-700">
              <span className="text-slate-500">Weekly Scheduled Duty:</span>
              <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-100/80 px-2 py-0.5 rounded-lg border border-amber-200">
                <Sunrise size={13} /> Morning: Shift {defaultDuty.morningTeam}
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1 text-indigo-800 font-bold bg-indigo-100/80 px-2 py-0.5 rounded-lg border border-indigo-200">
                <Moon size={13} /> Evening: Shift {defaultDuty.eveningTeam}
              </span>
            </div>
          )}

          <div>
            <button
              onClick={handleCreateDay}
              disabled={creating}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/25 active:scale-98 disabled:opacity-50 min-h-[48px]"
            >
              {creating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Working Day...</span>
                </>
              ) : (
                <>
                  <PlusCircle size={19} />
                  <span>Create Working Day</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── Active Day: KPIs & Shift Output Tables ───────────────────── */}
      {!loading && exists && workDay && activeKpis && overallKpis && (
        <>
          {/* ─── Quick Shift Filter Tabs (Controls both KPIs & Table View) ──── */}
          <div className="w-full bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/90 shadow-md mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="grid grid-cols-3 gap-1 p-1 sm:p-1.5 bg-slate-100/95 rounded-xl border border-slate-200/80 shadow-inner w-full md:w-auto md:flex md:items-center">
              <button
                onClick={() => setShiftFilter("ALL")}
                className={`w-full md:w-auto py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs md:text-sm font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all min-h-[40px] cursor-pointer ${
                  shiftFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-md shadow-slate-900/10 border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <Layers size={14} className="shrink-0" />
                <span className="truncate">All Slots (16)</span>
              </button>

              <button
                onClick={() => setShiftFilter("MORNING")}
                className={`w-full md:w-auto py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs md:text-sm font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all min-h-[40px] cursor-pointer ${
                  shiftFilter === "MORNING"
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <Sunrise size={14} className="shrink-0" />
                <span className="truncate">
                  Morning (8)
                  {workDay.morningTeam && (
                    <span className="hidden lg:inline font-normal opacity-90"> • Shift {workDay.morningTeam}</span>
                  )}
                </span>
              </button>

              <button
                onClick={() => setShiftFilter("EVENING")}
                className={`w-full md:w-auto py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs md:text-sm font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all min-h-[40px] cursor-pointer ${
                  shiftFilter === "EVENING"
                    ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <Moon size={14} className="shrink-0" />
                <span className="truncate">
                  Evening (8)
                  {workDay.eveningTeam && (
                    <span className="hidden lg:inline font-normal opacity-90"> • Shift {workDay.eveningTeam}</span>
                  )}
                </span>
              </button>
            </div>

            {/* Shift Context Scope Badge */}
            <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
              <span className="hidden sm:inline font-medium">Performance View:</span>
              <span
                className={`font-semibold px-3 py-1.5 rounded-full text-xs transition-colors flex items-center gap-1.5 shadow-xs ${
                  shiftFilter === "MORNING"
                    ? "bg-amber-100 text-amber-900 border border-amber-300/80"
                    : shiftFilter === "EVENING"
                    ? "bg-indigo-100 text-indigo-900 border border-indigo-300/80"
                    : "bg-slate-100 text-slate-700 border border-slate-200"
                }`}
              >
                {shiftFilter === "MORNING" ? (
                  <>
                    <span>Morning Shift (05:30 – 13:30)</span>
                    {workDay.morningTeam && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-black text-[10px] shadow-xs">
                        Shift {workDay.morningTeam}
                      </span>
                    )}
                  </>
                ) : shiftFilter === "EVENING" ? (
                  <>
                    <span>Evening Shift (13:30 – 21:30)</span>
                    {workDay.eveningTeam && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-black text-[10px] shadow-xs">
                        Shift {workDay.eveningTeam}
                      </span>
                    )}
                  </>
                ) : (
                  <span>
                    All Slots • Morning: Shift {workDay.morningTeam || "—"} | Evening: Shift {workDay.eveningTeam || "—"}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Active Shift Team Helper for KPIs */}
          {(() => {
            const activeTeam =
              shiftFilter === "MORNING"
                ? workDay.morningTeam
                : shiftFilter === "EVENING"
                ? workDay.eveningTeam
                : null;
            const teamBadge = activeTeam ? `Shift ${activeTeam}` : undefined;
            const teamBadgeColor =
              shiftFilter === "MORNING"
                ? (workDay.morningTeam === "A" ? "blue" : "indigo")
                : (workDay.eveningTeam === "A" ? "blue" : "indigo");

            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                {/* 1. Total Cartons (Morning / Evening / Overall) */}
                <KpiCard
                  title={
                    shiftFilter === "MORNING"
                      ? "Morning Cartons"
                      : shiftFilter === "EVENING"
                      ? "Evening Cartons"
                      : "Total Cartons"
                  }
                  value={activeKpis.totalActual.toLocaleString()}
                  subtitle={
                    shiftFilter === "MORNING"
                      ? `${activeTeam ? `Shift ${activeTeam} • ` : ""}of ${activeKpis.totalTarget.toLocaleString()} morning target`
                      : shiftFilter === "EVENING"
                      ? `${activeTeam ? `Shift ${activeTeam} • ` : ""}of ${activeKpis.totalTarget.toLocaleString()} evening target`
                      : `of ${activeKpis.totalTarget.toLocaleString()} target (M: Shift ${workDay.morningTeam || "—"} • E: Shift ${workDay.eveningTeam || "—"})`
                  }
                  icon={Package}
                  color="blue"
                  badge={teamBadge}
                  badgeColor={teamBadgeColor}
                />

                {/* 2. Performance Rate (out of completed hours) */}
                <KpiCard
                  title={
                    shiftFilter === "MORNING"
                      ? "Morning Perf. Rate"
                      : shiftFilter === "EVENING"
                      ? "Evening Perf. Rate"
                      : "Performance Rate"
                  }
                  value={`${activeKpis.performanceRate.toFixed(2)}%`}
                  subtitle={
                    activeKpis.completedTarget > 0
                      ? `${activeTeam ? `Shift ${activeTeam} • ` : ""}${activeKpis.totalActual} / ${activeKpis.completedTarget} target`
                      : "No completed slots"
                  }
                  icon={Target}
                  trend={
                    activeKpis.completedTarget === 0
                      ? "neutral"
                      : activeKpis.performanceRate >= 100
                      ? "up"
                      : activeKpis.performanceRate >= 80
                      ? "neutral"
                      : "down"
                  }
                  color={
                    activeKpis.completedTarget === 0
                      ? "blue"
                      : activeKpis.performanceRate >= 100
                      ? "green"
                      : activeKpis.performanceRate >= 80
                      ? "amber"
                      : "red"
                  }
                  badge={teamBadge}
                  badgeColor={teamBadgeColor}
                />

                {/* 3. Variance (completed hours actual - completed target) */}
                <KpiCard
                  title={
                    shiftFilter === "MORNING"
                      ? "Morning Variance"
                      : shiftFilter === "EVENING"
                      ? "Evening Variance"
                      : "Variance"
                  }
                  value={
                    activeKpis.completedVariance >= 0
                      ? `+${activeKpis.completedVariance}`
                      : activeKpis.completedVariance.toString()
                  }
                  subtitle={activeTeam ? `Shift ${activeTeam} vs completed target` : "vs completed target"}
                  icon={TrendingUp}
                  trend={activeKpis.completedVariance >= 0 ? "up" : "down"}
                  color={activeKpis.completedVariance >= 0 ? "green" : "red"}
                  badge={teamBadge}
                  badgeColor={teamBadgeColor}
                />

                {/* 4. Avg per Slot */}
                <KpiCard
                  title={
                    shiftFilter === "MORNING"
                      ? "Morning Avg / Slot"
                      : shiftFilter === "EVENING"
                      ? "Evening Avg / Slot"
                      : "Avg per Slot"
                  }
                  value={activeKpis.averagePerSlot.toFixed(0)}
                  subtitle={
                    activeKpis.completedSlots === 0
                      ? "No completed slots"
                      : activeTeam
                      ? `Shift ${activeTeam} • ${activeKpis.completedSlots} completed slots`
                      : activeKpis.belowTargetSlots > 0
                      ? `${activeKpis.belowTargetSlots} below target`
                      : "All on target"
                  }
                  icon={BarChart3}
                  color={
                    activeKpis.completedSlots === 0
                      ? "blue"
                      : activeKpis.belowTargetSlots > 0
                      ? "amber"
                      : "green"
                  }
                  badge={teamBadge}
                  badgeColor={teamBadgeColor}
                />
              </div>
            );
          })()}

          {/* Morning Shift Table / Cards */}
          {(shiftFilter === "ALL" || shiftFilter === "MORNING") && (
            <DailyOutputTable
              entries={calculatedSlots}
              shift="MORNING"
              shiftLabel="Morning Shift (5:30 AM – 1:30 PM)"
              dayStatus={workDay.status}
              team={workDay.morningTeam ?? null}
              counterpartTeam={workDay.eveningTeam ?? null}
              onAssignTeam={handleAssignTeam}
              onSave={handleSave}
              canEdit={true}
              userRole={session?.user?.role}
              showOverrideBadge={showOverrideBadge}
            />
          )}

          {/* Evening Shift Table / Cards */}
          {(shiftFilter === "ALL" || shiftFilter === "EVENING") && (
            <DailyOutputTable
              entries={calculatedSlots}
              shift="EVENING"
              shiftLabel="Evening Shift (1:30 PM – 9:30 PM)"
              dayStatus={workDay.status}
              team={workDay.eveningTeam ?? null}
              counterpartTeam={workDay.morningTeam ?? null}
              onAssignTeam={handleAssignTeam}
              onSave={handleSave}
              canEdit={true}
              userRole={session?.user?.role}
              showOverrideBadge={showOverrideBadge}
            />
          )}

          {/* ─── Shift Summary Cards (Full Day Overview) ──────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div
              className={`bg-gradient-to-br from-amber-50 to-orange-50/60 rounded-2xl p-4 sm:p-5 border transition-all ${
                shiftFilter === "MORNING"
                  ? "border-amber-400 ring-2 ring-amber-400/30 shadow-sm"
                  : "border-amber-200/80 shadow-xs"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-700">
                    <Sunrise size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-amber-900 text-sm sm:text-base">Morning Shift</h4>
                      {workDay.morningTeam ? (
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                          Shift {workDay.morningTeam}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          Unassigned
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-700">05:30 – 13:30 (8 Slots)</p>
                  </div>
                </div>
                {shiftFilter === "MORNING" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-800 px-2 py-0.5 rounded-full">
                    Active View
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 bg-white/70 rounded-xl p-3 border border-amber-200/60">
                <div>
                  <p className="text-[11px] font-semibold text-amber-700 uppercase">Total Cartons</p>
                  <p className="text-xl sm:text-2xl font-black text-amber-900">
                    {overallKpis.morningTotal}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-amber-700 uppercase">Target Total</p>
                  <p className="text-xl sm:text-2xl font-black text-amber-900">
                    {overallKpis.morningTarget}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`bg-gradient-to-br from-indigo-50 to-purple-50/60 rounded-2xl p-4 sm:p-5 border transition-all ${
                shiftFilter === "EVENING"
                  ? "border-indigo-400 ring-2 ring-indigo-400/30 shadow-sm"
                  : "border-indigo-200/80 shadow-xs"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-700">
                    <Moon size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-indigo-900 text-sm sm:text-base">Evening Shift</h4>
                      {workDay.eveningTeam ? (
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs">
                          Shift {workDay.eveningTeam}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Unassigned
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-indigo-700">13:30 – 21:30 (8 Slots)</p>
                  </div>
                </div>
                {shiftFilter === "EVENING" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-200/80 text-indigo-800 px-2 py-0.5 rounded-full">
                    Active View
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 bg-white/70 rounded-xl p-3 border border-indigo-200/60">
                <div>
                  <p className="text-[11px] font-semibold text-indigo-700 uppercase">Total Cartons</p>
                  <p className="text-xl sm:text-2xl font-black text-indigo-900">
                    {overallKpis.eveningTotal}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-indigo-700 uppercase">Target Total</p>
                  <p className="text-xl sm:text-2xl font-black text-indigo-900">
                    {overallKpis.eveningTarget}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
