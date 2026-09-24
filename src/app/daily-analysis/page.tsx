"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Package,
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  AlertTriangle,
  Award,
  Sunrise,
  Moon,
  Users,
  Monitor,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import DatePicker from "@/components/date-picker";
import KpiCard from "@/components/kpi-card";
import { formatTimeRange, formatTime } from "@/lib/calculations";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface RawEntry {
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

interface LineStats {
  mdLine: number;
  customerType: "PVH" | "OTHER";
  morningCustomerType: "PVH" | "OTHER";
  eveningCustomerType: "PVH" | "OTHER";
  isMorningMixed: boolean;
  isEveningMixed: boolean;
  morningCustomerLabel: string;
  eveningCustomerLabel: string;
  actual: number;
  target: number;
  completedSlots: number;
  completedTarget: number;
  variance: number;
  perfRate: number;
  achievementRate: number;
  morningActual: number;
  morningTarget: number;
  eveningActual: number;
  eveningTarget: number;
  entries: RawEntry[];
}

function DailyAnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "OPERATOR") {
      toast.error("Analysis pages are reserved for Managers and Admins.");
      router.replace("/");
    }
  }, [session, status, router]);

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

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      if (urlDate !== selectedDate) {
        setSelectedDate(urlDate);
        setEntries([]);
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
            setEntries([]);
            setExists(false);
          }
          router.replace(`?date=${stored}`, { scroll: false });
          return;
        }
      }
      const todayStr = format(new Date(), "yyyy-MM-dd");
      setSelectedDate(todayStr);
      setEntries([]);
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
    setEntries([]);
    setExists(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newDate);
      window.dispatchEvent(new CustomEvent("md_carton_date_change"));
    }
    router.replace(`?date=${newDate}`, { scroll: false });
  };

  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [workDayInfo, setWorkDayInfo] = useState<{
    morningTeam?: string | null;
    eveningTeam?: string | null;
    status?: "OPEN" | "CLOSED";
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exists, setExists] = useState(false);

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-days?date=${date}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!data.exists || !data.workDay) {
        setExists(false);
        setEntries([]);
        setWorkDayInfo(null);
        return;
      }

      setExists(true);
      setWorkDayInfo({
        morningTeam: data.workDay.morningTeam || null,
        eveningTeam: data.workDay.eveningTeam || null,
        status: data.workDay.status,
      });

      // Use allLineEntries (or workDay.entries) to cover all 3 MD lines
      const allEntries: RawEntry[] = data.allLineEntries || data.workDay.entries || [];
      setEntries(allEntries);
    } catch {
      toast.error("Failed to load analysis data");
      setWorkDayInfo(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Memoize daily analysis computations to prevent re-computing on every render
  const {
    line1,
    line2,
    line3,
    grandActual,
    grandTarget,
    grandCompletedTarget,
    grandVariance,
    grandPerfRate,
    grandAchievement,
    totalCompletedSlots,
    morningActual,
    morningTarget,
    morningCompletedTarget,
    morningVariance,
    morningPerf,
    eveningActual,
    eveningTarget,
    eveningCompletedTarget,
    eveningVariance,
    eveningPerf,
    morningTeam,
    eveningTeam,
    isTeamAMorning,
    teamAActual,
    teamATarget,
    teamAVariance,
    teamAPerfRate,
    teamBActual,
    teamBTarget,
    teamBVariance,
    teamBPerfRate,
    hourlySlots,
    morningHourlySlots,
    eveningHourlySlots,
    morningCompletedSlots,
    morningHitSlotsCount,
    morningMissSlotsCount,
    eveningCompletedSlots,
    eveningHitSlotsCount,
    eveningMissSlotsCount,
    cumulativeData,
  } = useMemo(() => {
    // Compute per-line statistics for MD Line 1, 2, 3
    const computeLineStats = (lineNum: number): LineStats => {
      const lineEntries = entries.filter((e) => e.mdLine === lineNum);
      const actual = lineEntries.reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
      const target = lineEntries.reduce((sum, e) => sum + e.targetCartons, 0);

      const completedEntries = lineEntries.filter((e) => e.actualCartons !== null);
      const completedSlots = completedEntries.length;
      const completedTarget = completedEntries.reduce((sum, e) => sum + e.targetCartons, 0);

      const variance = actual - completedTarget;
      const perfRate = completedTarget > 0 ? (actual / completedTarget) * 100 : 0;
      const achievementRate = target > 0 ? (actual / target) * 100 : 0;

      const morningEntries = lineEntries.filter((e) => e.timeSlot.shift === "MORNING" || e.timeSlot.sequenceNo <= 8);
      const morningActual = morningEntries.reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
      const morningTarget = morningEntries.reduce((sum, e) => sum + e.targetCartons, 0);
      const morningHasPVH = morningEntries.some(e => e.customerType === "PVH");
      const morningHasOTHER = morningEntries.some(e => e.customerType === "OTHER");
      const isMorningMixed = morningHasPVH && morningHasOTHER;
      const morningCustomerType = isMorningMixed ? "PVH" : (morningHasOTHER ? "OTHER" : "PVH");
      const morningCustomerLabel = isMorningMixed ? "Mixed" : (morningCustomerType === "PVH" ? "PV" : "OTHER");

      const eveningEntries = lineEntries.filter((e) => e.timeSlot.shift === "EVENING" || e.timeSlot.sequenceNo > 8);
      const eveningActual = eveningEntries.reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
      const eveningTarget = eveningEntries.reduce((sum, e) => sum + e.targetCartons, 0);
      const eveningHasPVH = eveningEntries.some(e => e.customerType === "PVH");
      const eveningHasOTHER = eveningEntries.some(e => e.customerType === "OTHER");
      const isEveningMixed = eveningHasPVH && eveningHasOTHER;
      const eveningCustomerType = isEveningMixed ? "PVH" : (eveningHasOTHER ? "OTHER" : "PVH");
      const eveningCustomerLabel = isEveningMixed ? "Mixed" : (eveningCustomerType === "PVH" ? "PV" : "OTHER");

      return {
        mdLine: lineNum,
        customerType: morningCustomerType,
        morningCustomerType,
        eveningCustomerType,
        isMorningMixed,
        isEveningMixed,
        morningCustomerLabel,
        eveningCustomerLabel,
        actual,
        target,
        completedSlots,
        completedTarget,
        variance,
        perfRate,
        achievementRate,
        morningActual,
        morningTarget,
        eveningActual,
        eveningTarget,
        entries: lineEntries,
      };
    };

    const l1 = computeLineStats(1);
    const l2 = computeLineStats(2);
    const l3 = computeLineStats(3);

    // Grand Totals across all 3 MD lines
    const gActual = l1.actual + l2.actual + l3.actual;
    const gTarget = l1.target + l2.target + l3.target;
    const gCompletedTarget = l1.completedTarget + l2.completedTarget + l3.completedTarget;
    const gVariance = gActual - gCompletedTarget;
    const gPerfRate = gCompletedTarget > 0 ? (gActual / gCompletedTarget) * 100 : 0;
    const gAchievement = gTarget > 0 ? (gActual / gTarget) * 100 : 0;
    const totCompletedSlots = l1.completedSlots + l2.completedSlots + l3.completedSlots;

    // Shift Totals across all 3 MD lines
    const mActual = l1.morningActual + l2.morningActual + l3.morningActual;
    const mTarget = l1.morningTarget + l2.morningTarget + l3.morningTarget;
    const mCompletedTarget = entries
      .filter((e) => e.timeSlot.shift === "MORNING" && e.actualCartons !== null)
      .reduce((s, e) => s + e.targetCartons, 0);
    const mVariance = mActual - mCompletedTarget;
    const mPerf = mCompletedTarget > 0 ? (mActual / mCompletedTarget) * 100 : 0;

    const eActual = l1.eveningActual + l2.eveningActual + l3.eveningActual;
    const eTarget = l1.eveningTarget + l2.eveningTarget + l3.eveningTarget;
    const eCompletedTarget = entries
      .filter((e) => e.timeSlot.shift === "EVENING" && e.actualCartons !== null)
      .reduce((s, e) => s + e.targetCartons, 0);
    const eVariance = eActual - eCompletedTarget;
    const ePerf = eCompletedTarget > 0 ? (eActual / eCompletedTarget) * 100 : 0;

    const mTeam = workDayInfo?.morningTeam || "A";
    const evTeam = workDayInfo?.eveningTeam || "B";

    // Shift Teams comparison (Shift A vs Shift B)
    const isTeamAMorning = mTeam === "A";
    const teamAActual = isTeamAMorning ? mActual : eActual;
    const teamATarget = isTeamAMorning ? mTarget : eTarget;
    const teamAVariance = teamAActual - teamATarget;
    const teamAPerfRate = teamATarget > 0 ? (teamAActual / teamATarget) * 100 : 0;

    const teamBActual = !isTeamAMorning ? mActual : eActual;
    const teamBTarget = !isTeamAMorning ? mTarget : eTarget;
    const teamBVariance = teamBActual - teamBTarget;
    const teamBPerfRate = teamBTarget > 0 ? (teamBActual / teamBTarget) * 100 : 0;

    // Hourly Chart Data (combined across 3 lines) with target hit/miss tracking
    const hSlots = Array.from({ length: 16 }, (_, i) => i + 1).map((seq) => {
      const slotEntries = entries.filter((e) => e.timeSlot.sequenceNo === seq);
      const sample = slotEntries[0];
      const timeRange = sample ? formatTimeRange(sample.timeSlot.startTime, sample.timeSlot.endTime) : `Slot ${seq}`;
      const shift = sample?.timeSlot.shift || (seq <= 8 ? "MORNING" : "EVENING");
      
      const l1Entry = slotEntries.find((e) => e.mdLine === 1);
      const l2Entry = slotEntries.find((e) => e.mdLine === 2);
      const l3Entry = slotEntries.find((e) => e.mdLine === 3);

      const l1Val = l1Entry?.actualCartons;
      const l2Val = l2Entry?.actualCartons;
      const l3Val = l3Entry?.actualCartons;

      const l1Target = l1Entry?.targetCartons ?? 0;
      const l2Target = l2Entry?.targetCartons ?? 0;
      const l3Target = l3Entry?.targetCartons ?? 0;

      const totalSlotActual = (l1Val ?? 0) + (l2Val ?? 0) + (l3Val ?? 0);
      const totalSlotTarget = slotEntries.reduce((sum, e) => sum + e.targetCartons, 0);
      const hasAnyActual = slotEntries.some((e) => e.actualCartons !== null);
      const isHit = hasAnyActual && totalSlotActual >= totalSlotTarget;
      const isMiss = hasAnyActual && totalSlotActual < totalSlotTarget;

      return {
        sequenceNo: seq,
        time: sample ? formatTime(sample.timeSlot.startTime) : `${seq}`,
        timeRange,
        shift,
        target: totalSlotTarget,
        actual: hasAnyActual ? totalSlotActual : 0,
        hasData: hasAnyActual,
        isHit,
        isMiss,
        l1: l1Val ?? 0,
        l2: l2Val ?? 0,
        l3: l3Val ?? 0,
        l1Target,
        l2Target,
        l3Target,
        l1HasData: l1Val !== null && l1Val !== undefined,
        l2HasData: l2Val !== null && l2Val !== undefined,
        l3HasData: l3Val !== null && l3Val !== undefined,
      };
    });

    const mHourlySlots = hSlots.slice(0, 8);
    const eHourlySlots = hSlots.slice(8, 16);

    const mCompletedSlots = mHourlySlots.filter((s) => s.hasData);
    const mHitSlotsCount = mCompletedSlots.filter((s) => s.isHit).length;
    const mMissSlotsCount = mCompletedSlots.filter((s) => s.isMiss).length;

    const eCompletedSlots = eHourlySlots.filter((s) => s.hasData);
    const eHitSlotsCount = eCompletedSlots.filter((s) => s.isHit).length;
    const eMissSlotsCount = eCompletedSlots.filter((s) => s.isMiss).length;

    // Cumulative Chart Data
    let cumActual = 0;
    let cumTarget = 0;
    const cumData = hSlots.map((s) => {
      cumTarget += s.target;
      if (s.hasData) {
        cumActual += s.actual;
      }
      return {
        time: s.time,
        timeRange: s.timeRange,
        targetCum: cumTarget,
        actualCum: s.hasData ? cumActual : null,
      };
    });

    return {
      line1: l1,
      line2: l2,
      line3: l3,
      grandActual: gActual,
      grandTarget: gTarget,
      grandCompletedTarget: gCompletedTarget,
      grandVariance: gVariance,
      grandPerfRate: gPerfRate,
      grandAchievement: gAchievement,
      totalCompletedSlots: totCompletedSlots,
      morningActual: mActual,
      morningTarget: mTarget,
      morningCompletedTarget: mCompletedTarget,
      morningVariance: mVariance,
      morningPerf: mPerf,
      eveningActual: eActual,
      eveningTarget: eTarget,
      eveningCompletedTarget: eCompletedTarget,
      eveningVariance: eVariance,
      eveningPerf: ePerf,
      morningTeam: mTeam,
      eveningTeam: evTeam,
      isTeamAMorning,
      teamAActual,
      teamATarget,
      teamAVariance,
      teamAPerfRate,
      teamBActual,
      teamBTarget,
      teamBVariance,
      teamBPerfRate,
      hourlySlots: hSlots,
      morningHourlySlots: mHourlySlots,
      eveningHourlySlots: eHourlySlots,
      morningCompletedSlots: mCompletedSlots,
      morningHitSlotsCount: mHitSlotsCount,
      morningMissSlotsCount: mMissSlotsCount,
      eveningCompletedSlots: eCompletedSlots,
      eveningHitSlotsCount: eHitSlotsCount,
      eveningMissSlotsCount: eMissSlotsCount,
      cumulativeData: cumData,
    };
  }, [entries, workDayInfo]);

  return (
    <div className="w-full pb-10">
      {/* ─── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="text-blue-600" />
            <span>Daily Progress Analysis</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5">
            Dynamic 3-line totals, customer configurations, and detailed shift analysis
          </p>
        </div>

        <DatePicker selectedDate={selectedDate} onDateChange={handleDateChange} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Aggregating production data...</p>
          </div>
        </div>
      )}

      {!loading && !exists && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-8 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
            <BarChart3 size={32} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
            No Records for this Date
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Create a working day on the Daily Input page first to view analytics.
          </p>
        </div>
      )}

      {!loading && exists && (
        <>
          {/* ─── 1. TOP KPI GRID (WITH DYNAMIC 3 MD LINE BREAKDOWN IN TOTAL CARD) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* TOTAL CARTONS CARD (With embedded 3 MD Lines Dynamic Breakdown) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm col-span-1 md:col-span-2 lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Total Output (All 3 MD Lines)
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Package size={18} />
                  </div>
                </div>

                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-black text-slate-800">
                    {grandActual.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    of {grandTarget.toLocaleString()} total target
                  </span>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${grandAchievement >= 100
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                      }`}
                  >
                    {grandAchievement.toFixed(1)}% Achieved
                  </span>
                </div>
              </div>

              {/* Dynamic Per-Line Breakdown embedded inside Total KPI Card */}
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* MD Line 1 */}
                <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-slate-800 text-[11px]">MD Line 1</span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                        line1.isMorningMixed || line1.isEveningMixed
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : line1.morningCustomerLabel === line1.eveningCustomerLabel
                          ? line1.morningCustomerLabel === "PV"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                          : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {line1.morningCustomerLabel === line1.eveningCustomerLabel
                        ? line1.morningCustomerLabel
                        : `${line1.morningCustomerLabel}/${line1.eveningCustomerLabel}`}
                    </span>
                  </div>
                  <p className="font-black text-slate-900 text-sm sm:text-base">
                    {line1.actual.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-700 font-bold">
                    Target: {line1.target.toLocaleString()} ({line1.achievementRate.toFixed(1)}%)
                  </p>
                </div>

                {/* MD Line 2 */}
                <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-slate-800 text-[11px]">MD Line 2</span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                        line2.isMorningMixed || line2.isEveningMixed
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : line2.morningCustomerLabel === line2.eveningCustomerLabel
                          ? line2.morningCustomerLabel === "PV"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                          : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {line2.morningCustomerLabel === line2.eveningCustomerLabel
                        ? line2.morningCustomerLabel
                        : `${line2.morningCustomerLabel}/${line2.eveningCustomerLabel}`}
                    </span>
                  </div>
                  <p className="font-black text-slate-900 text-sm sm:text-base">
                    {line2.actual.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-700 font-bold">
                    Target: {line2.target.toLocaleString()} ({line2.achievementRate.toFixed(1)}%)
                  </p>
                </div>

                {/* MD Line 3 */}
                <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-slate-800 text-[11px]">MD Line 3</span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                        line3.isMorningMixed || line3.isEveningMixed
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : line3.morningCustomerLabel === line3.eveningCustomerLabel
                          ? line3.morningCustomerLabel === "PV"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                          : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {line3.morningCustomerLabel === line3.eveningCustomerLabel
                        ? line3.morningCustomerLabel
                        : `${line3.morningCustomerLabel}/${line3.eveningCustomerLabel}`}
                    </span>
                  </div>
                  <p className="font-black text-slate-900 text-sm sm:text-base">
                    {line3.actual.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-700 font-bold">
                    Target: {line3.target.toLocaleString()} ({line3.achievementRate.toFixed(1)}%)
                  </p>
                </div>
              </div>
            </div>

            {/* Overall Performance */}
            <KpiCard
              title="Overall Performance"
              value={`${grandPerfRate.toFixed(1)}%`}
              subtitle={
                grandCompletedTarget > 0
                  ? `${grandActual.toLocaleString()} / ${grandCompletedTarget.toLocaleString()} active target`
                  : "No completed slots"
              }
              icon={Target}
              trend={grandPerfRate >= 100 ? "up" : "down"}
              color={grandPerfRate >= 100 ? "green" : grandPerfRate >= 80 ? "amber" : "red"}
            />

            {/* Net Variance */}
            <KpiCard
              title="Factory Net Variance"
              value={grandVariance >= 0 ? `+${grandVariance}` : `${grandVariance}`}
              subtitle={
                totalCompletedSlots > 0
                  ? `Across ${totalCompletedSlots} completed slots (all 3 lines)`
                  : "No completed entries"
              }
              icon={grandVariance >= 0 ? TrendingUp : TrendingDown}
              color={grandVariance >= 0 ? "green" : "red"}
            />
          </div>

          {/* ─── 2. DETAILED SHIFT-BASED ANALYSIS ──────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                <Clock className="text-blue-600" size={20} />
                <span>Detailed Shift-Based Analysis</span>
              </h2>
              <span className="text-xs font-bold text-slate-700">
                Morning: Shift {morningTeam} • Evening: Shift {eveningTeam}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* MORNING SHIFT DETAILED CARD */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center font-bold">
                      <Sunrise size={19} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base">Morning Shift</h3>
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                          Shift {morningTeam}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 font-semibold">05:30 AM – 01:30 PM (Slots 1–8)</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-black text-slate-800">
                      {morningActual.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-700 font-bold">
                      of {morningTarget.toLocaleString()} target ({morningPerf.toFixed(1)}%)
                    </p>
                    {morningCompletedSlots.length > 0 && (
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {morningHitSlotsCount} Hit
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${morningMissSlotsCount > 0 ? "bg-red-100 text-red-800 border border-red-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                          {morningMissSlotsCount} Miss
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-Line Morning Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60">
                    <p className="text-[10px] font-black text-amber-800 uppercase">Line 1 ({line1.morningCustomerLabel})</p>
                    <p className="text-base font-black text-slate-800 mt-0.5">{line1.morningActual}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Target: {line1.morningTarget}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60">
                    <p className="text-[10px] font-black text-amber-800 uppercase">Line 2 ({line2.morningCustomerLabel})</p>
                    <p className="text-base font-black text-slate-800 mt-0.5">{line2.morningActual}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Target: {line2.morningTarget}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60">
                    <p className="text-[10px] font-black text-amber-800 uppercase">Line 3 ({line3.morningCustomerLabel})</p>
                    <p className="text-base font-black text-slate-800 mt-0.5">{line3.morningActual}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Target: {line3.morningTarget}</p>
                  </div>
                </div>

                {/* Morning Shift Hourly Performance Chart */}
                <div className="mb-4 p-3 rounded-xl bg-slate-50/80 border border-slate-200/90">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                    <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                      Morning Hourly Progression (Slots 1–8)
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-black">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Target Hit
                      </span>
                      <span className="flex items-center gap-1 text-red-800 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-black">
                        <span className="w-2 h-2 rounded-full bg-red-500" /> Target Miss
                      </span>
                      <span className="flex items-center gap-1 text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 font-black">
                        <span className="w-2 h-2 rounded-full bg-slate-400" /> Target
                      </span>
                    </div>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={morningHourlySlots} margin={{ top: 8, right: 10, left: -20, bottom: 0 }} barGap={3}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fontWeight: 700, fill: "#334155" }} />
                        <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: "#334155" }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0]?.payload;
                              const hit = d?.hasData && d?.actual >= d?.target;
                              return (
                                <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-black text-slate-900">{d?.timeRange}</p>
                                    {d?.hasData && (
                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${hit ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-100 text-red-800 border border-red-300"}`}>
                                        {hit ? "HIT" : "MISS"}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-800 font-medium">
                                    Actual: <strong className={hit ? "text-emerald-700 font-black" : "text-red-700 font-black"}>{d?.hasData ? `${d?.actual} ctns` : "—"}</strong>
                                  </p>
                                  <p className="text-slate-700 font-medium">Target: <strong className="text-slate-900 font-black">{d?.target} ctns</strong></p>
                                  <div className="text-[10px] text-slate-700 font-bold pt-1 border-t border-slate-200 flex gap-2">
                                    <span>L1: {d?.l1}</span>
                                    <span>L2: {d?.l2}</span>
                                    <span>L3: {d?.l3}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="actual" name="Actual Cartons" radius={[3, 3, 0, 0]}>
                          {morningHourlySlots.map((s, idx) => (
                            <Cell
                              key={`morning-bar-${idx}`}
                              fill={
                                !s.hasData
                                  ? "#cbd5e1"
                                  : s.isHit
                                  ? "#10b981"
                                  : "#ef4444"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Slot-by-Slot Table for Morning */}
                <div className="overflow-x-auto touch-scroll">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-800 font-black text-[11px]">
                        <th className="text-left py-1.5">Time Slot</th>
                        <th className="text-center py-1.5">Line 1</th>
                        <th className="text-center py-1.5">Line 2</th>
                        <th className="text-center py-1.5">Line 3</th>
                        <th className="text-center py-1.5">Total Cartons</th>
                        <th className="text-right py-1.5">Target</th>
                        <th className="text-center py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {morningHourlySlots.map((slot) => {
                        const isBreakfast = slot.sequenceNo === 3;
                        const isTea = slot.sequenceNo === 7;
                        return (
                          <tr
                            key={slot.sequenceNo}
                            className={`transition-colors ${
                              slot.hasData
                                ? slot.isHit
                                  ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                                  : "bg-red-50/20 hover:bg-red-50/40"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="py-2 font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{slot.timeRange}</span>
                              {isBreakfast && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">B'fast</span>}
                              {isTea && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">Tea</span>}
                            </td>
                            <td className="text-center py-2">
                              {slot.l1HasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-xs font-black ${
                                    slot.l1 >= slot.l1Target
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-red-100 text-red-900 border border-red-300"
                                  }`}
                                  title={`Line 1: ${slot.l1} / ${slot.l1Target} target`}
                                >
                                  {slot.l1}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold">—</span>
                              )}
                            </td>
                            <td className="text-center py-2">
                              {slot.l2HasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-xs font-black ${
                                    slot.l2 >= slot.l2Target
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-red-100 text-red-900 border border-red-300"
                                  }`}
                                  title={`Line 2: ${slot.l2} / ${slot.l2Target} target`}
                                >
                                  {slot.l2}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold">—</span>
                              )}
                            </td>
                            <td className="text-center py-2">
                              {slot.l3HasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-xs font-black ${
                                    slot.l3 >= slot.l3Target
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-red-100 text-red-900 border border-red-300"
                                  }`}
                                  title={`Line 3: ${slot.l3} / ${slot.l3Target} target`}
                                >
                                  {slot.l3}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold">—</span>
                              )}
                            </td>
                            <td className="text-center py-2">
                              {slot.hasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[52px] px-2 py-0.5 rounded-lg font-black text-xs border-2 shadow-2xs text-black select-none ${
                                    slot.isHit
                                      ? "bg-emerald-400 border-emerald-600"
                                      : "bg-red-400 border-red-600"
                                  }`}
                                  title={slot.isHit ? `Target Hit: ${slot.actual} >= ${slot.target}` : `Target Miss: ${slot.actual} < ${slot.target}`}
                                >
                                  {slot.actual}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold text-xs">—</span>
                              )}
                            </td>
                            <td className="text-right py-2 font-black text-slate-800">{slot.target}</td>
                            <td className="text-center py-2">
                              {slot.hasData ? (
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                    slot.isHit
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                      : "bg-red-100 text-red-800 border border-red-300"
                                  }`}
                                >
                                  {slot.isHit ? "HIT" : "MISS"}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px] font-bold">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* EVENING SHIFT DETAILED CARD */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-700 flex items-center justify-center font-bold">
                      <Moon size={19} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-sm sm:text-base">Evening Shift</h3>
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-purple-600 text-white shadow-xs">
                          Shift {eveningTeam}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 font-semibold">01:30 PM – 09:30 PM (Slots 9–16)</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-black text-slate-800">
                      {eveningActual.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-700 font-bold">
                      of {eveningTarget.toLocaleString()} target ({eveningPerf.toFixed(1)}%)
                    </p>
                    {eveningCompletedSlots.length > 0 && (
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {eveningHitSlotsCount} Hit
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${eveningMissSlotsCount > 0 ? "bg-red-100 text-red-800 border border-red-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                          {eveningMissSlotsCount} Miss
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-Line Evening Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <div className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-200/60">
                    <p className="text-[10px] font-black text-indigo-800 uppercase">Line 1 ({line1.eveningCustomerLabel})</p>
                    <p className="text-base font-black text-slate-800 mt-0.5">{line1.eveningActual}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Target: {line1.eveningTarget}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-200/60">
                    <p className="text-[10px] font-black text-indigo-800 uppercase">Line 2 ({line2.eveningCustomerLabel})</p>
                    <p className="text-base font-black text-slate-800 mt-0.5">{line2.eveningActual}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Target: {line2.eveningTarget}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-200/60">
                    <p className="text-[10px] font-black text-indigo-800 uppercase">Line 3 ({line3.eveningCustomerLabel})</p>
                    <p className="text-base font-black text-slate-800 mt-0.5">{line3.eveningActual}</p>
                    <p className="text-[11px] text-slate-700 font-bold">Target: {line3.eveningTarget}</p>
                  </div>
                </div>

                {/* Evening Shift Hourly Performance Chart */}
                <div className="mb-4 p-3 rounded-xl bg-slate-50/80 border border-slate-200/90">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                    <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                      Evening Hourly Progression (Slots 9–16)
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-black">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Target Hit
                      </span>
                      <span className="flex items-center gap-1 text-red-800 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-black">
                        <span className="w-2 h-2 rounded-full bg-red-500" /> Target Miss
                      </span>
                      <span className="flex items-center gap-1 text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 font-black">
                        <span className="w-2 h-2 rounded-full bg-slate-400" /> Target
                      </span>
                    </div>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={eveningHourlySlots} margin={{ top: 8, right: 10, left: -20, bottom: 0 }} barGap={3}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fontWeight: 700, fill: "#334155" }} />
                        <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: "#334155" }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0]?.payload;
                              const hit = d?.hasData && d?.actual >= d?.target;
                              return (
                                <div className="bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-black text-slate-900">{d?.timeRange}</p>
                                    {d?.hasData && (
                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${hit ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-100 text-red-800 border border-red-300"}`}>
                                        {hit ? "HIT" : "MISS"}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-800 font-medium">
                                    Actual: <strong className={hit ? "text-emerald-700 font-black" : "text-red-700 font-black"}>{d?.hasData ? `${d?.actual} ctns` : "—"}</strong>
                                  </p>
                                  <p className="text-slate-700 font-medium">Target: <strong className="text-slate-900 font-black">{d?.target} ctns</strong></p>
                                  <div className="text-[10px] text-slate-700 font-bold pt-1 border-t border-slate-200 flex gap-2">
                                    <span>L1: {d?.l1}</span>
                                    <span>L2: {d?.l2}</span>
                                    <span>L3: {d?.l3}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="actual" name="Actual Cartons" radius={[3, 3, 0, 0]}>
                          {eveningHourlySlots.map((s, idx) => (
                            <Cell
                              key={`evening-bar-${idx}`}
                              fill={
                                !s.hasData
                                  ? "#cbd5e1"
                                  : s.isHit
                                  ? "#10b981"
                                  : "#ef4444"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Slot-by-Slot Table for Evening */}
                <div className="overflow-x-auto touch-scroll">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-800 font-black text-[11px]">
                        <th className="text-left py-1.5">Time Slot</th>
                        <th className="text-center py-1.5">Line 1</th>
                        <th className="text-center py-1.5">Line 2</th>
                        <th className="text-center py-1.5">Line 3</th>
                        <th className="text-center py-1.5">Total Cartons</th>
                        <th className="text-right py-1.5">Target</th>
                        <th className="text-center py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eveningHourlySlots.map((slot) => {
                        const isTea = slot.sequenceNo === 11;
                        const isDinner = slot.sequenceNo === 15;
                        return (
                          <tr
                            key={slot.sequenceNo}
                            className={`transition-colors ${
                              slot.hasData
                                ? slot.isHit
                                  ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                                  : "bg-red-50/20 hover:bg-red-50/40"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="py-2 font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{slot.timeRange}</span>
                              {isTea && <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1 rounded font-bold">Tea</span>}
                              {isDinner && <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1 rounded font-bold">Dinner</span>}
                            </td>
                            <td className="text-center py-2">
                              {slot.l1HasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-xs font-black ${
                                    slot.l1 >= slot.l1Target
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-red-100 text-red-900 border border-red-300"
                                  }`}
                                  title={`Line 1: ${slot.l1} / ${slot.l1Target} target`}
                                >
                                  {slot.l1}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold">—</span>
                              )}
                            </td>
                            <td className="text-center py-2">
                              {slot.l2HasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-xs font-black ${
                                    slot.l2 >= slot.l2Target
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-red-100 text-red-900 border border-red-300"
                                  }`}
                                  title={`Line 2: ${slot.l2} / ${slot.l2Target} target`}
                                >
                                  {slot.l2}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold">—</span>
                              )}
                            </td>
                            <td className="text-center py-2">
                              {slot.l3HasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-xs font-black ${
                                    slot.l3 >= slot.l3Target
                                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                      : "bg-red-100 text-red-900 border border-red-300"
                                  }`}
                                  title={`Line 3: ${slot.l3} / ${slot.l3Target} target`}
                                >
                                  {slot.l3}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold">—</span>
                              )}
                            </td>
                            <td className="text-center py-2">
                              {slot.hasData ? (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[52px] px-2 py-0.5 rounded-lg font-black text-xs border-2 shadow-2xs text-black select-none ${
                                    slot.isHit
                                      ? "bg-emerald-400 border-emerald-600"
                                      : "bg-red-400 border-red-600"
                                  }`}
                                  title={slot.isHit ? `Target Hit: ${slot.actual} >= ${slot.target}` : `Target Miss: ${slot.actual} < ${slot.target}`}
                                >
                                  {slot.actual}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-bold text-xs">—</span>
                              )}
                            </td>
                            <td className="text-right py-2 font-black text-slate-800">{slot.target}</td>
                            <td className="text-center py-2">
                              {slot.hasData ? (
                                <span
                                  className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                    slot.isHit
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                      : "bg-red-100 text-red-800 border border-red-300"
                                  }`}
                                >
                                  {slot.isHit ? "HIT" : "MISS"}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px] font-bold">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 3. SHIFT WORKFORCE COMPARISON (SHIFT A VS SHIFT B) ─────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-blue-600" />
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                Shift Workforce Performance Comparison
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-blue-900 text-sm">Shift A Workforce</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                    {isTeamAMorning ? "Morning Shift" : "Evening Shift"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-blue-200/60">
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Processed</p>
                    <p className="text-base font-black text-blue-950">{teamAActual.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Target</p>
                    <p className="text-base font-bold text-blue-800">{teamATarget.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Perf Rate</p>
                    <p className={`text-base font-black ${teamAPerfRate >= 100 ? "text-emerald-600" : "text-amber-600"}`}>
                      {teamAPerfRate.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-200/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-purple-900 text-sm">Shift B Workforce</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-600 text-white">
                    {!isTeamAMorning ? "Morning Shift" : "Evening Shift"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-purple-200/60">
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Processed</p>
                    <p className="text-base font-black text-purple-950">{teamBActual.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Target</p>
                    <p className="text-base font-bold text-purple-800">{teamBTarget.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Perf Rate</p>
                    <p className={`text-base font-black ${teamBPerfRate >= 100 ? "text-emerald-600" : "text-amber-600"}`}>
                      {teamBPerfRate.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {grandActual > 0 && (
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                <div
                  style={{ width: `${(teamAActual / grandActual) * 100}%` }}
                  className="h-full bg-blue-600 transition-all duration-500"
                  title={`Shift A: ${((teamAActual / grandActual) * 100).toFixed(1)}%`}
                />
                <div
                  style={{ width: `${(teamBActual / grandActual) * 100}%` }}
                  className="h-full bg-purple-600 transition-all duration-500"
                  title={`Shift B: ${((teamBActual / grandActual) * 100).toFixed(1)}%`}
                />
              </div>
            )}
          </div>

          {/* ─── 4. CUMULATIVE PRODUCTION GRAPH ─────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  Cumulative Graph (Processed Cartons)
                </h3>
                <p className="text-[11px] text-slate-700 font-bold">Day cumulative curve vs target timeline</p>
              </div>
              <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200">
                Total: {grandActual.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeData} margin={{ top: 10, right: 20, left: -15, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} angle={-45} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0]?.payload;
                        return (
                          <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1">
                            <p className="font-black text-slate-900">{d?.timeRange}</p>
                            {d?.actualCum !== null && d?.actualCum !== undefined && (
                              <p className="text-slate-800 font-medium">
                                Cumulative Cartons: <strong className="text-blue-700 font-black">{d?.actualCum?.toLocaleString()} ctns</strong>
                              </p>
                            )}
                            <p className="text-slate-800 font-medium">
                              <span className="font-black text-slate-950">Cumulative Target</span>: <strong className="text-slate-950 font-black">{d?.targetCum?.toLocaleString()} ctns</strong>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }}
                    formatter={(value) => (
                      <span className={value.toLowerCase().includes("target") ? "font-black text-slate-900" : "font-bold text-slate-700"}>
                        {value}
                      </span>
                    )}
                  />
                  <Line type="monotone" dataKey="targetCum" name="Cumulative Target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="actualCum" name="Cumulative Cartons" stroke="#2563eb" strokeWidth={3} dot={{ fill: "#2563eb", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DailyAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <DailyAnalysisContent />
    </Suspense>
  );
}
