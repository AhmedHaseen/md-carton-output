"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Package,
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Monitor,
  Sunrise,
  Moon,
  Users,
  Layers,
  Activity,
} from "lucide-react";
import DatePicker from "@/components/date-picker";
import KpiCard from "@/components/kpi-card";
import { calculateSlotData, calculateDailyKPIs, formatTimeRange } from "@/lib/calculations";
import type { SlotEntry, SlotWithCalculations, DailyKPIs } from "@/lib/calculations";
import { MD_LINES } from "@/lib/target-config";
import { getDefaultShiftTeams } from "@/lib/shift-rotation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";

interface EntryData {
  id: string;
  actualCartons: number | null;
  targetCartons: number;
  targetSource: "DEFAULT" | "OVERRIDE";
  mdLine: number;
  customerType: "PVH" | "OTHER";
  timeSlot: {
    id: string;
    shift: "MORNING" | "EVENING";
    startTime: string;
    endTime: string;
    sequenceNo: number;
    defaultTarget: number;
  };
}

const LINE_COLORS: Record<number, { bg: string; border: string; text: string; accent: string; chart: string }> = {
  1: { bg: "from-blue-50 to-sky-50/60", border: "border-blue-200/80", text: "text-blue-900", accent: "bg-blue-600", chart: "#3b82f6" },
  2: { bg: "from-emerald-50 to-green-50/60", border: "border-emerald-200/80", text: "text-emerald-900", accent: "bg-emerald-600", chart: "#10b981" },
  3: { bg: "from-violet-50 to-purple-50/60", border: "border-violet-200/80", text: "text-violet-900", accent: "bg-violet-600", chart: "#8b5cf6" },
};

function MdOperationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return urlDate;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("md_carton_selected_date");
      if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
    }
    return format(new Date(), "yyyy-MM-dd");
  });

  useEffect(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      if (urlDate !== selectedDate) {
        setSelectedDate(urlDate);
        setAllEntries([]);
        setExists(false);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_date", urlDate);
        window.dispatchEvent(new CustomEvent("md_carton_date_change"));
      }
    } else {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("md_carton_selected_date");
        if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
          if (stored !== selectedDate) {
            setSelectedDate(stored);
            setAllEntries([]);
            setExists(false);
          }
          router.replace(`?date=${stored}`, { scroll: false });
          return;
        }
      }
      const todayStr = format(new Date(), "yyyy-MM-dd");
      setSelectedDate(todayStr);
      setAllEntries([]);
      setExists(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_date", todayStr);
        window.dispatchEvent(new CustomEvent("md_carton_date_change"));
      }
      router.replace(`?date=${todayStr}`, { scroll: false });
    }
  }, [searchParams, router, selectedDate]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setAllEntries([]);
    setExists(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newDate);
      window.dispatchEvent(new CustomEvent("md_carton_date_change"));
    }
    router.replace(`?date=${newDate}`, { scroll: false });
  };

  const [allEntries, setAllEntries] = useState<EntryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [exists, setExists] = useState(false);
  const [morningTeam, setMorningTeam] = useState<string | null>(null);
  const [eveningTeam, setEveningTeam] = useState<string | null>(null);
  const [activeHourlyShift, setActiveHourlyShift] = useState<"MORNING" | "EVENING">("MORNING");

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-days?date=${date}`, { cache: "no-store" });
      const data = await res.json();
      if (data && data.exists && data.workDay) {
        setExists(true);
        setMorningTeam(data.workDay.morningTeam || null);
        setEveningTeam(data.workDay.eveningTeam || null);
        // Use allLineEntries if available (all lines), otherwise workDay.entries
        const entries = data.allLineEntries || data.workDay.entries;
        setAllEntries(entries);
      } else {
        setExists(false);
        setAllEntries([]);
      }
    } catch {
      toast.error("Failed to load data");
      setExists(false);
      setAllEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Memoize all slot computations and KPIs across lines
  const {
    lineKpis,
    totalKpis,
    uniqueCompletedSlotsCount,
    totalTimeSlotsCount,
    activeMorningTeam,
    activeEveningTeam,
    morningShiftName,
    eveningShiftName,
    comparisonData,
    hourlyData,
  } = useMemo(() => {
    // Compute per-line KPIs
    const lKpis: Record<number, DailyKPIs | null> = {};
    for (const line of MD_LINES) {
      const lineSlots: SlotEntry[] = allEntries
        .filter((e) => e.mdLine === line)
        .map((e) => ({
          id: e.id,
          sequenceNo: e.timeSlot.sequenceNo,
          shift: e.timeSlot.shift,
          startTime: e.timeSlot.startTime,
          endTime: e.timeSlot.endTime,
          targetCartons: e.targetCartons,
          actualCartons: e.actualCartons,
          targetSource: e.targetSource,
          mdLine: e.mdLine,
          customerType: e.customerType,
        }));
      const calc = calculateSlotData(lineSlots);
      lKpis[line] = calc.length > 0 ? calculateDailyKPIs(calc) : null;
    }

    // Aggregate KPIs across all lines
    const aSlots: SlotEntry[] = allEntries.map((e) => ({
      id: e.id,
      sequenceNo: e.timeSlot.sequenceNo,
      shift: e.timeSlot.shift,
      startTime: e.timeSlot.startTime,
      endTime: e.timeSlot.endTime,
      targetCartons: e.targetCartons,
      actualCartons: e.actualCartons,
      targetSource: e.targetSource,
      mdLine: e.mdLine,
      customerType: e.customerType,
    }));
    const aCalc = calculateSlotData(aSlots);
    const tKpis = aCalc.length > 0 ? calculateDailyKPIs(aCalc) : null;

    // Track unique completed time slots (e.g. sequence 1..16) across all lines
    const uCount = new Set(
      allEntries
        .filter((e) => e.actualCartons !== null && e.actualCartons !== undefined)
        .map((e) => e.timeSlot.sequenceNo)
    ).size;
    const tCount = new Set(allEntries.map((e) => e.timeSlot.sequenceNo)).size || 16;

    // Shift team names based on DB or rotation duty fallback
    const duty = getDefaultShiftTeams(selectedDate);
    const actMorning = morningTeam || duty.morningTeam;
    const actEvening = eveningTeam || duty.eveningTeam;
    const mName = `Shift ${actMorning}`;
    const eName = `Shift ${actEvening}`;

    // Build chart data for comparison across lines
    const compData = MD_LINES.map((line) => {
      const kpi = lKpis[line];
      const lineEntries = allEntries.filter((e) => e.mdLine === line);
      const mEntries = lineEntries.filter(
        (e) => e.timeSlot?.shift === "MORNING" || e.timeSlot?.sequenceNo <= 8
      );
      const eEntries = lineEntries.filter(
        (e) => e.timeSlot?.shift === "EVENING" || e.timeSlot?.sequenceNo > 8
      );
      const mHasPVH = mEntries.some((e) => e.customerType === "PVH");
      const mHasOTHER = mEntries.some((e) => e.customerType === "OTHER");
      const mCustLabel = mHasPVH && mHasOTHER ? "Mixed" : mHasOTHER ? "Other customer" : "PV";

      const eHasPVH = eEntries.some((e) => e.customerType === "PVH");
      const eHasOTHER = eEntries.some((e) => e.customerType === "OTHER");
      const eCustLabel = eHasPVH && eHasOTHER ? "Mixed" : eHasOTHER ? "Other customer" : "PV";

      return {
        name: `MD Line ${line}`,
        actual: kpi?.totalActual ?? 0,
        target: kpi?.totalTarget ?? 0,
        performance: kpi ? Number(kpi.performanceRate.toFixed(1)) : 0,
        customer: `${mCustLabel} - Mrng | ${eCustLabel} - Evng`,
      };
    });

    // Per-slot hourly comparison chart
    const hData: Array<Record<string, string | number>> = [];
    if (exists && allEntries.length > 0) {
      const line1Entries = allEntries
        .filter((e) => e.mdLine === 1)
        .sort((a, b) => a.timeSlot.sequenceNo - b.timeSlot.sequenceNo);
      for (const entry of line1Entries) {
        const slotShift = entry.timeSlot.shift || (entry.timeSlot.sequenceNo <= 8 ? "MORNING" : "EVENING");
        const slot: Record<string, string | number> = {
          time: formatTimeRange(entry.timeSlot.startTime, entry.timeSlot.endTime),
          seq: entry.timeSlot.sequenceNo,
          shift: slotShift,
        };
        for (const line of MD_LINES) {
          const lineEntry = allEntries.find(
            (e) => e.mdLine === line && e.timeSlot.sequenceNo === entry.timeSlot.sequenceNo
          );
          slot[`line${line}`] = lineEntry?.actualCartons ?? 0;
          slot[`target${line}`] = lineEntry?.targetCartons ?? 0;
        }
        hData.push(slot);
      }
    }

    return {
      lineKpis: lKpis,
      totalKpis: tKpis,
      uniqueCompletedSlotsCount: uCount,
      totalTimeSlotsCount: tCount,
      activeMorningTeam: actMorning,
      activeEveningTeam: actEvening,
      morningShiftName: mName,
      eveningShiftName: eName,
      comparisonData: compData,
      hourlyData: hData,
    };
  }, [allEntries, morningTeam, eveningTeam, selectedDate, exists]);

  // Filter hourly data based on selected shift
  const filteredHourlyData = hourlyData.filter((row) => (row.shift as string) === activeHourlyShift);

  // Shift-specific totals for the selected shift view
  const shiftTotals = {
    lines: MD_LINES.reduce((acc, line) => {
      const actual = filteredHourlyData.reduce((sum, r) => sum + ((r[`line${line}`] as number) || 0), 0);
      const target = filteredHourlyData.reduce((sum, r) => sum + ((r[`target${line}`] as number) || 0), 0);
      acc[line] = { actual, target };
      return acc;
    }, {} as Record<number, { actual: number; target: number }>),
    combinedActual: MD_LINES.reduce((sum, line) => {
      return sum + filteredHourlyData.reduce((s, r) => s + ((r[`line${line}`] as number) || 0), 0);
    }, 0),
    combinedTarget: MD_LINES.reduce((sum, line) => {
      return sum + filteredHourlyData.reduce((s, r) => s + ((r[`target${line}`] as number) || 0), 0);
    }, 0),
  };

  return (
    <div className="w-full pb-10">
      {/* ─── Page Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Monitor size={22} className="text-blue-600" />
            <span>MD Line Operations Analysis</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5">
            Per-line performance comparison across all 3 MD lines
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <DatePicker selectedDate={selectedDate} onDateChange={handleDateChange} />
        </div>
      </div>

      {/* ─── Loading ──────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-600 font-bold">Loading operations data...</p>
          </div>
        </div>
      )}

      {/* ─── No Data ──────────────────────────────────────────────── */}
      {!loading && !exists && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-16 h-16 bg-blue-100/80 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600 shadow-sm">
            <Monitor size={32} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
            No Data for {format(new Date(selectedDate + "T00:00:00"), "MMMM d, yyyy")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            Create a working day from the Daily Input page first to see per-line operations analysis.
          </p>
        </div>
      )}

      {/* Active Day Analysis */}
      {!loading && exists && totalKpis && (
        <>
          {/* Aggregate KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <KpiCard
              title="Total Cartons (All Lines)"
              value={totalKpis.totalActual.toLocaleString()}
              subtitle={`of ${totalKpis.totalTarget.toLocaleString()} full-day target across 3 lines`}
              icon={Package}
              color="blue"
            />
            <KpiCard
              title="Progress (Completed Slots)"
              value={
                totalKpis.completedSlots === 0
                  ? "—"
                  : `${totalKpis.performanceRate.toFixed(1)}%`
              }
              subtitle={
                totalKpis.completedTarget > 0
                  ? `${totalKpis.totalActual.toLocaleString()} / ${totalKpis.completedTarget.toLocaleString()} ctns (${uniqueCompletedSlotsCount} of ${totalTimeSlotsCount} slots completed)`
                  : "No completed slots yet"
              }
              icon={Target}
              trend={
                totalKpis.completedSlots === 0
                  ? "neutral"
                  : totalKpis.performanceRate >= 100
                  ? "up"
                  : totalKpis.performanceRate >= 80
                  ? "neutral"
                  : "down"
              }
              color={
                totalKpis.completedSlots === 0
                  ? "blue"
                  : totalKpis.performanceRate >= 100
                  ? "green"
                  : totalKpis.performanceRate >= 80
                  ? "amber"
                  : "red"
              }
            />
            <KpiCard
              title="Overall Performance"
              value={`${totalKpis.achievementPercent.toFixed(1)}%`}
              subtitle={`${totalKpis.totalActual.toLocaleString()} / ${totalKpis.totalTarget.toLocaleString()} full-day target`}
              icon={Activity}
              trend={
                totalKpis.achievementPercent >= 100
                  ? "up"
                  : totalKpis.achievementPercent >= 50
                  ? "neutral"
                  : "down"
              }
              color={
                totalKpis.achievementPercent >= 100
                  ? "green"
                  : totalKpis.achievementPercent >= 50
                  ? "blue"
                  : "amber"
              }
            />
            <KpiCard
              title="Total Variance"
              value={
                totalKpis.completedSlots === 0
                  ? "0"
                  : totalKpis.completedVariance >= 0
                  ? `+${totalKpis.completedVariance}`
                  : totalKpis.completedVariance.toString()
              }
              subtitle={
                totalKpis.completedSlots > 0
                  ? `vs completed target (${uniqueCompletedSlotsCount} slots)`
                  : "vs completed target (all lines)"
              }
              icon={totalKpis.completedVariance >= 0 ? TrendingUp : TrendingDown}
              trend={totalKpis.completedSlots === 0 ? "neutral" : totalKpis.completedVariance >= 0 ? "up" : "down"}
              color={totalKpis.completedSlots === 0 ? "blue" : totalKpis.completedVariance >= 0 ? "green" : "red"}
            />
          </div>

          {/* Per-Line Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {MD_LINES.map((line) => {
              const kpi = lineKpis[line];
              const colors = LINE_COLORS[line];
              const lineEntries = allEntries.filter((e) => e.mdLine === line);
              const mEntries = lineEntries.filter(
                (e) => e.timeSlot?.shift === "MORNING" || e.timeSlot?.sequenceNo <= 8
              );
              const eEntries = lineEntries.filter(
                (e) => e.timeSlot?.shift === "EVENING" || e.timeSlot?.sequenceNo > 8
              );
              const mHasPVH = mEntries.some((e) => e.customerType === "PVH");
              const mHasOTHER = mEntries.some((e) => e.customerType === "OTHER");
              const mMixed = mHasPVH && mHasOTHER;
              const mLabel = mMixed ? "Mixed" : mHasOTHER ? "OTHER" : "PV";

              const eHasPVH = eEntries.some((e) => e.customerType === "PVH");
              const eHasOTHER = eEntries.some((e) => e.customerType === "OTHER");
              const eMixed = eHasPVH && eHasOTHER;
              const eLabel = eMixed ? "Mixed" : eHasOTHER ? "OTHER" : "PV";

              return (
                <div
                  key={line}
                  className={`bg-gradient-to-br ${colors.bg} rounded-2xl p-4 sm:p-5 border ${colors.border} shadow-xs transition-all hover:shadow-md`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl ${colors.accent} flex items-center justify-center text-white shadow-sm`}>
                        <Monitor size={18} />
                      </div>
                      <div>
                        <h4 className={`font-bold ${colors.text} text-sm sm:text-base`}>
                          MD Line {line}
                        </h4>
                      </div>
                    </div>
                    {mLabel === eLabel ? (
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        mMixed || eMixed
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : mLabel === "PV"
                          ? "bg-blue-100 text-blue-900 border border-blue-300"
                          : "bg-violet-100 text-violet-900 border border-violet-300"
                      }`}>
                        {mLabel}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          mMixed
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : mLabel === "PV"
                            ? "bg-blue-100 text-blue-900 border border-blue-300"
                            : "bg-violet-100 text-violet-900 border border-violet-300"
                        }`}>
                          {mLabel}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold">/</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          eMixed
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : eLabel === "PV"
                            ? "bg-blue-100 text-blue-900 border border-blue-300"
                            : "bg-violet-100 text-violet-900 border border-violet-300"
                        }`}>
                          {eLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  {kpi ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 bg-white/80 rounded-xl p-3 border border-slate-200">
                        <div>
                          <p className="text-[11px] font-black text-slate-700 uppercase">Total Cartons</p>
                          <p className="text-xl font-black text-slate-900">{kpi.totalActual.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-700 font-bold">
                            {kpi.totalTarget > 0 ? `${((kpi.totalActual / kpi.totalTarget) * 100).toFixed(1)}% of day` : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-slate-700 uppercase">Day Target</p>
                          <p className="text-xl font-black text-slate-900">{kpi.totalTarget.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-700 font-bold">16 time slots</p>
                        </div>
                      </div>
                      {/* Current Progress Rate upon Completed Slots & Variance */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/80 rounded-lg p-2 text-center border border-slate-200 flex flex-col justify-between">
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-tight leading-tight">
                            Progress (Completed Slots)
                          </p>
                          <p className={`text-sm font-black my-0.5 ${
                            kpi.completedSlots === 0
                              ? "text-slate-500"
                              : kpi.performanceRate >= 100
                              ? "text-emerald-700"
                              : kpi.performanceRate >= 80
                              ? "text-amber-700"
                              : "text-red-700"
                          }`}>
                            {kpi.completedSlots === 0 ? "—" : `${kpi.performanceRate.toFixed(1)}%`}
                          </p>
                          <p className="text-[10px] text-slate-700 font-bold leading-tight">
                            {kpi.completedSlots > 0
                              ? `${kpi.totalActual} / ${kpi.completedTarget} ctns`
                              : "No completed slots"}
                          </p>
                        </div>
                        <div className="bg-white/80 rounded-lg p-2 text-center border border-slate-200 flex flex-col justify-between">
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-tight leading-tight">
                            Variance (Completed)
                          </p>
                          <p className={`text-sm font-black my-0.5 ${
                            kpi.completedSlots === 0
                              ? "text-slate-500"
                              : kpi.completedVariance >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}>
                            {kpi.completedSlots === 0
                              ? "0"
                              : kpi.completedVariance >= 0
                              ? `+${kpi.completedVariance}`
                              : kpi.completedVariance}
                          </p>
                          <p className="text-[10px] text-slate-700 font-bold leading-tight">
                            {kpi.completedSlots > 0
                              ? `Across ${kpi.completedSlots} slots`
                              : "No completed slots"}
                          </p>
                        </div>
                      </div>
                      {/* Morning vs Evening mini breakdown */}
                      <div className="flex gap-2">
                        <div className="flex-1 bg-amber-50 rounded-lg p-2 border border-amber-300/80">
                          <p className="text-[10px] font-black text-amber-800 uppercase flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Sunrise size={11} /> Morning
                            </span>
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-200/80 text-amber-900">
                              {mLabel}
                            </span>
                          </p>
                          <p className="text-sm font-black text-amber-950 mt-0.5">
                            {kpi.morningTotal} <span className="text-[11px] font-black text-amber-800">/ {kpi.morningTarget}</span>
                          </p>
                        </div>
                        <div className="flex-1 bg-indigo-50 rounded-lg p-2 border border-indigo-300/80">
                          <p className="text-[10px] font-black text-indigo-800 uppercase flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Moon size={11} /> Evening
                            </span>
                            <span className="text-[9px] font-bold px-1 rounded bg-indigo-200/80 text-indigo-900">
                              {eLabel}
                            </span>
                          </p>
                          <p className="text-sm font-black text-indigo-950 mt-0.5">
                            {kpi.eveningTotal} <span className="text-[11px] font-black text-indigo-800">/ {kpi.eveningTarget}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-sm text-slate-600 font-bold">
                      No data entered
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Line Comparison Bar Chart */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm sm:text-base font-bold text-black flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-600" />
                <span className="text-black font-extrabold">MD Line Output Comparison</span>
              </h3>
              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-blue-600 inline-block" />
                  <span className="text-black font-bold">Actual Output</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-600 inline-block" />
                  <span className="text-black font-bold">Target</span>
                </div>
              </div>
            </div>
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} barGap={6} margin={{ top: 22, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#000000"
                    tick={{ fill: "#000000", fontSize: 13, fontWeight: 700 }}
                    tickLine={{ stroke: "#000000" }}
                  />
                  <YAxis
                    stroke="#000000"
                    tick={{ fill: "#000000", fontSize: 12, fontWeight: 700 }}
                    tickLine={{ stroke: "#000000" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "12px",
                      border: "2px solid #000000",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#000000",
                    }}
                    labelStyle={{ color: "#000000", fontWeight: 800, marginBottom: "4px" }}
                    itemStyle={{ color: "#000000", fontWeight: 700 }}
                  />
                  <Legend
                    formatter={(value) => <span style={{ color: "#000000", fontWeight: 800, fontSize: "12px" }}>{value}</span>}
                  />
                  <Bar dataKey="actual" name="Actual Output" fill="#2563eb" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="actual" position="top" fill="#000000" fontWeight="900" fontSize={12} offset={6} />
                  </Bar>
                  <Bar dataKey="target" name="Target" fill="#475569" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="target" position="top" fill="#000000" fontWeight="900" fontSize={12} offset={6} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ─── Hourly Slot-by-Slot Comparison Table ─────────────── */}
          {hourlyData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                    <Layers size={18} className="text-slate-600" />
                    Hourly Slot Comparison (All Lines)
                  </h3>
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 border border-slate-300">
                    {activeHourlyShift === "MORNING" ? `Slots 1 – 8 (${morningShiftName})` : `Slots 9 – 16 (${eveningShiftName})`}
                  </span>
                </div>

                {/* 2 Shift Filter Buttons: Switch between Morning & Evening */}
                <div className="flex flex-col sm:flex-row bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-xs w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveHourlyShift("MORNING")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center sm:justify-start gap-1.5 ${
                      activeHourlyShift === "MORNING"
                        ? "bg-white text-blue-700 shadow-xs ring-1 ring-blue-500/20 font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Sunrise size={14} className={activeHourlyShift === "MORNING" ? "text-blue-600" : "text-slate-500"} />
                    <span>Morning Shift</span>
                    <span className={`text-[11px] font-bold ${activeHourlyShift === "MORNING" ? "text-blue-700 font-extrabold" : "text-slate-600"}`}>
                      ({morningShiftName}<span className="hidden md:inline"> - 05:30 AM – 01:30 PM</span>)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHourlyShift("EVENING")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center sm:justify-start gap-1.5 ${
                      activeHourlyShift === "EVENING"
                        ? "bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-500/20 font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Moon size={14} className={activeHourlyShift === "EVENING" ? "text-indigo-600" : "text-slate-500"} />
                    <span>Evening Shift</span>
                    <span className={`text-[11px] font-bold ${activeHourlyShift === "EVENING" ? "text-indigo-700 font-extrabold" : "text-slate-600"}`}>
                      ({eveningShiftName}<span className="hidden md:inline"> - 01:30 PM – 09:30 PM</span>)
                    </span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto touch-scroll">
                <table className="data-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th className="w-14 text-center font-black text-slate-800">#</th>
                      <th className="w-36 font-black text-slate-800">Time Slot</th>
                      {MD_LINES.map((line) => (
                        <th key={`h-${line}`} className="w-32 text-center font-black text-slate-800">
                          <span className="inline-flex items-center gap-1 font-black">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[line].chart }} />
                            Line {line}
                          </span>
                        </th>
                      ))}
                      <th className="w-28 text-center font-black text-slate-900">Combined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHourlyData.map((row) => {
                      const combined = MD_LINES.reduce((sum, line) => sum + ((row[`line${line}`] as number) || 0), 0);
                      const combinedTarget = MD_LINES.reduce((sum, line) => sum + ((row[`target${line}`] as number) || 0), 0);
                      const hasAny = MD_LINES.some((line) => (row[`line${line}`] as number) > 0);

                      return (
                        <tr key={row.seq as number} className="hover:bg-slate-50/80 transition-colors">
                          <td className="text-center">
                            <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-800 font-mono text-xs inline-flex items-center justify-center font-black">
                              {row.seq as number}
                            </span>
                          </td>
                          <td className="font-bold text-sm text-slate-900">
                            {row.time as string}
                          </td>
                          {MD_LINES.map((line) => {
                            const actual = (row[`line${line}`] as number) || 0;
                            const target = (row[`target${line}`] as number) || 0;
                            const isEntered = actual > 0;
                            const isAbove = isEntered && actual >= target;

                            return (
                              <td key={`v-${line}`} className="text-center py-2.5">
                                {isEntered ? (
                                  <span
                                    className={`inline-flex items-center justify-center min-w-[54px] px-2.5 py-1 rounded-xl font-black text-sm border-2 shadow-xs text-black transition-all select-none ${
                                      isAbove
                                        ? "bg-emerald-400 border-emerald-600"
                                        : "bg-red-400 border-red-600"
                                    }`}
                                  >
                                    {actual}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-bold">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-center py-2.5">
                            {hasAny ? (
                              <span
                                className={`inline-flex items-center justify-center min-w-[58px] px-2.5 py-1 rounded-xl font-black text-sm border-2 shadow-xs text-black transition-all select-none ${
                                  combined >= combinedTarget
                                    ? "bg-emerald-400 border-emerald-600"
                                    : "bg-red-400 border-red-600"
                                }`}
                              >
                                {combined}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-bold">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Shift Totals Row */}
                    <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
                      <td className="text-center text-slate-700 font-black text-sm">Σ</td>
                      <td className="text-sm font-black text-slate-900">
                        {activeHourlyShift === "MORNING" ? `MORNING TOTAL (${morningShiftName})` : `EVENING TOTAL (${eveningShiftName})`}
                      </td>
                      {MD_LINES.map((line) => {
                        const st = shiftTotals.lines[line];
                        return (
                          <td key={`st-${line}`} className="text-center">
                            <span className="font-black text-slate-900">{st?.actual ?? 0}</span>
                            <span className="text-slate-600 font-bold text-xs ml-1">/ {st?.target ?? 0}</span>
                          </td>
                        );
                      })}
                      <td className="text-center">
                        <span className="font-black text-slate-900">{shiftTotals.combinedActual}</span>
                        <span className="text-slate-600 font-bold text-xs ml-1">/ {shiftTotals.combinedTarget}</span>
                      </td>
                    </tr>

                    {/* Full Day Totals Reference Row */}
                    <tr className="bg-slate-200/60 font-semibold text-xs text-slate-700 border-t border-slate-300">
                      <td className="text-center text-slate-700 font-black text-xs">ALL</td>
                      <td className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        Full Day Total
                      </td>
                      {MD_LINES.map((line) => {
                        const kpi = lineKpis[line];
                        return (
                          <td key={`dt-${line}`} className="text-center">
                            <span className="font-black text-slate-900">{kpi?.totalActual ?? 0}</span>
                            <span className="text-slate-600 font-bold text-xs ml-1">/ {kpi?.totalTarget ?? 0}</span>
                          </td>
                        );
                      })}
                      <td className="text-center">
                        <span className="font-black text-slate-900">{totalKpis?.totalActual ?? 0}</span>
                        <span className="text-slate-600 font-bold text-xs ml-1">/ {totalKpis?.totalTarget ?? 0}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MdOperationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <MdOperationsContent />
    </Suspense>
  );
}
