"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import toast from "react-hot-toast";
import {
  Package,
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  Calendar,
  Sunrise,
  Moon,
  BarChart3,
  Users,
  Clock,
} from "lucide-react";
import KpiCard from "@/components/kpi-card";
import WeekPicker from "@/components/week-picker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface DayData {
  date: string;
  displayDate: string;
  totalActual: number;
  totalTarget: number;
  morningActual: number;
  morningTarget: number;
  eveningActual: number;
  eveningTarget: number;
  morningTeam: string | null;
  eveningTeam: string | null;
  completedSlots: number;
  belowTargetSlots: number;
  achievementPercent: number;
  teamAActual: number;
  teamATarget: number;
  teamAPerf: number;
  teamBActual: number;
  teamBTarget: number;
  teamBPerf: number;
}

function WeeklyAnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [weekStart, setWeekStart] = useState(() => {
    const urlParam = searchParams.get("week") || searchParams.get("date");
    if (urlParam && /^\d{4}-\d{2}-\d{2}$/.test(urlParam)) {
      return format(
        startOfWeek(new Date(urlParam + "T00:00:00"), { weekStartsOn: 1 }),
        "yyyy-MM-dd"
      );
    }
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("md_carton_selected_date");
      if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) {
        return format(
          startOfWeek(new Date(stored + "T00:00:00"), { weekStartsOn: 1 }),
          "yyyy-MM-dd"
        );
      }
    }
    return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  });

  // Keep in sync if URL query parameter changes externally
  useEffect(() => {
    const urlParam = searchParams.get("week") || searchParams.get("date");
    if (urlParam && /^\d{4}-\d{2}-\d{2}$/.test(urlParam)) {
      const monday = format(
        startOfWeek(new Date(urlParam + "T00:00:00"), { weekStartsOn: 1 }),
        "yyyy-MM-dd"
      );
      if (monday !== weekStart) {
        setWeekStart(monday);
      }
    }
  }, [searchParams, weekStart]);

  const handleWeekChange = (newWeekStart: string) => {
    setWeekStart(newWeekStart);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newWeekStart);
      window.dispatchEvent(new CustomEvent("md_carton_date_change"));
    }
    router.replace(`?week=${newWeekStart}`, { scroll: false });
  };
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(false);
  const [shiftChartMode, setShiftChartMode] = useState<"team" | "time">("team");

  const weekEnd = format(
    endOfWeek(new Date(weekStart + "T00:00:00"), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

  // Formatting helpers for exact two-decimal percentages
  const formatPercent = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return "0.00%";
    return `${val.toFixed(2)}%`;
  };

  const calcRatioPercent = (actual: number, target: number): string => {
    if (!target || target <= 0) return "0.00%";
    return `${((actual / target) * 100).toFixed(2)}%`;
  };

  const fetchWeekData = useCallback(async () => {
    setLoading(true);
    try {
      const days = eachDayOfInterval({
        start: new Date(weekStart + "T00:00:00"),
        end: new Date(weekEnd + "T00:00:00"),
      });

      const results: DayData[] = [];

      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        const res = await fetch(`/api/work-days?date=${dateStr}`);
        const data = await res.json();

        if (data.exists && data.workDay) {
          const entries = data.workDay.entries;
          const completed = entries.filter(
            (e: any) => e.actualCartons !== null
          );
          const totalActual = completed.reduce(
            (sum: number, e: any) => sum + (e.actualCartons ?? 0),
            0
          );
          const totalTarget = entries.reduce(
            (sum: number, e: any) => sum + e.targetCartons,
            0
          );
          const morningActual = completed
            .filter((e: any) => e.timeSlot.shift === "MORNING")
            .reduce((sum: number, e: any) => sum + (e.actualCartons ?? 0), 0);
          const eveningActual = completed
            .filter((e: any) => e.timeSlot.shift === "EVENING")
            .reduce((sum: number, e: any) => sum + (e.actualCartons ?? 0), 0);
          const belowTarget = completed.filter(
            (e: any) => e.actualCartons < e.targetCartons
          ).length;

          const morningTarget = entries
            .filter((e: any) => e.timeSlot.shift === "MORNING")
            .reduce((sum: number, e: any) => sum + e.targetCartons, 0);
          const eveningTarget = entries
            .filter((e: any) => e.timeSlot.shift === "EVENING")
            .reduce((sum: number, e: any) => sum + e.targetCartons, 0);

          const morningTeam = data.workDay.morningTeam || "A";
          const eveningTeam = data.workDay.eveningTeam || "B";

          const isTeamAMorning = morningTeam === "A";
          const teamAActual = isTeamAMorning ? morningActual : eveningActual;
          const teamATarget = isTeamAMorning ? morningTarget : eveningTarget;
          const teamAPerf = teamATarget > 0 ? (teamAActual / teamATarget) * 100 : 0;

          const teamBActual = !isTeamAMorning ? morningActual : eveningActual;
          const teamBTarget = !isTeamAMorning ? morningTarget : eveningTarget;
          const teamBPerf = teamBTarget > 0 ? (teamBActual / teamBTarget) * 100 : 0;

          const achievementPercent = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

          results.push({
            date: dateStr,
            displayDate: format(day, "EEE, MMM d"),
            totalActual,
            totalTarget,
            morningActual,
            morningTarget,
            eveningActual,
            eveningTarget,
            morningTeam,
            eveningTeam,
            completedSlots: completed.length,
            belowTargetSlots: belowTarget,
            achievementPercent,
            teamAActual,
            teamATarget,
            teamAPerf,
            teamBActual,
            teamBTarget,
            teamBPerf,
          });
        }
      }

      setDailyData(results);
    } catch {
      toast.error("Failed to load weekly data");
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    fetchWeekData();
  }, [fetchWeekData]);

  // Calculate weekly KPIs
  const workingDays = dailyData.length;
  const weeklyTotalActual = dailyData.reduce((sum, d) => sum + d.totalActual, 0);
  const weeklyTotalTarget = dailyData.reduce((sum, d) => sum + d.totalTarget, 0);
  const weeklyAchievementPercent =
    weeklyTotalTarget > 0
      ? (weeklyTotalActual / weeklyTotalTarget) * 100
      : 0;
  const avgDailyActual =
    workingDays > 0 ? Math.round(weeklyTotalActual / workingDays) : 0;
  const bestDay =
    dailyData.length > 0
      ? dailyData.reduce((best, d) =>
          d.totalActual > best.totalActual ? d : best
        )
      : null;
  const totalBelowTargetSlots = dailyData.reduce(
    (sum, d) => sum + d.belowTargetSlots,
    0
  );
  const weeklyMorning = dailyData.reduce((sum, d) => sum + d.morningActual, 0);
  const weeklyEvening = dailyData.reduce((sum, d) => sum + d.eveningActual, 0);

  // Shift Team Aggregation across the week (Shift A vs Shift B)
  let weeklyTeamAActual = 0;
  let weeklyTeamATarget = 0;
  let weeklyTeamBActual = 0;
  let weeklyTeamBTarget = 0;

  dailyData.forEach((d) => {
    if (d.morningTeam === "A") {
      weeklyTeamAActual += d.morningActual;
      weeklyTeamATarget += d.morningTarget;
    } else if (d.morningTeam === "B") {
      weeklyTeamBActual += d.morningActual;
      weeklyTeamBTarget += d.morningTarget;
    }

    if (d.eveningTeam === "A") {
      weeklyTeamAActual += d.eveningActual;
      weeklyTeamATarget += d.eveningTarget;
    } else if (d.eveningTeam === "B") {
      weeklyTeamBActual += d.eveningActual;
      weeklyTeamBTarget += d.eveningTarget;
    }
  });

  const weeklyTeamAPerf =
    weeklyTeamATarget > 0
      ? (weeklyTeamAActual / weeklyTeamATarget) * 100
      : 0;
  const weeklyTeamBPerf =
    weeklyTeamBTarget > 0
      ? (weeklyTeamBActual / weeklyTeamBTarget) * 100
      : 0;

  const weeklyTeamAVariance = weeklyTeamAActual - weeklyTeamATarget;
  const weeklyTeamBVariance = weeklyTeamBActual - weeklyTeamBTarget;

  return (
    <div className="w-full pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            Weekly Progress Analysis
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Compare production trends and performance over a full week
          </p>
        </div>
      </div>

      {/* Week Selector Bar with Range Selection, Stepper & Quick Dropdown */}
      <WeekPicker
        weekStart={weekStart}
        onWeekChange={handleWeekChange}
        workingDays={workingDays}
      />

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Aggregating weekly output...</p>
          </div>
        </div>
      )}

      {!loading && dailyData.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-8 sm:p-12 text-center max-w-lg mx-auto my-6">
          <Calendar size={40} className="text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
            No Records for this Week
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Ensure production days are created on the Daily Input page for this calendar week.
          </p>
        </div>
      )}

      {!loading && dailyData.length > 0 && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <KpiCard
              title="Weekly Total"
              value={weeklyTotalActual.toLocaleString()}
              subtitle={`of ${weeklyTotalTarget.toLocaleString()} target`}
              icon={Package}
              color="blue"
            />
            <KpiCard
              title="Weekly Achievement"
              value={`${weeklyAchievementPercent.toFixed(2)}%`}
              icon={Target}
              trend={weeklyAchievementPercent >= 100 ? "up" : "down"}
              color={weeklyAchievementPercent >= 100 ? "green" : "amber"}
            />
            <KpiCard
              title="Avg Daily"
              value={avgDailyActual.toLocaleString()}
              subtitle={`${workingDays} days logged`}
              icon={TrendingUp}
              color="cyan"
            />
            <KpiCard
              title="Best Day"
              value={bestDay ? bestDay.totalActual.toLocaleString() : "—"}
              subtitle={bestDay?.displayDate ?? ""}
              icon={Award}
              color="green"
            />
            <div className="col-span-2 sm:col-span-1">
              <KpiCard
                title="Below Target"
                value={totalBelowTargetSlots}
                subtitle="Total slots missed"
                icon={AlertTriangle}
                color={totalBelowTargetSlots > 0 ? "red" : "green"}
              />
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            {/* Daily Actual vs Target */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Processed Cartons vs Target (Week)
                  </h3>
                  <p className="text-[11px] text-slate-500">Daily actuals vs planned output targets</p>
                </div>
              </div>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0]?.payload as DayData;
                          if (!d) return null;
                          return (
                            <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-2 min-w-[210px]">
                              <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
                                <p className="font-bold text-slate-800 text-sm">{label || d.displayDate}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                  M: Shift {d.morningTeam} • E: Shift {d.eveningTeam}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>Processed Cartons:</span>
                                  <span className="font-black text-blue-700 text-sm">{d.totalActual.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-500">
                                  <span>Day Target:</span>
                                  <span className="font-semibold text-slate-700">{d.totalTarget.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-500">
                                  <span>Achievement %:</span>
                                  <span className={`font-black ${d.achievementPercent >= 100 ? "text-emerald-600" : "text-amber-600"}`}>
                                    {d.achievementPercent.toFixed(2)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
                    <Bar dataKey="totalTarget" name="Target" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalActual" name="Processed Cartons" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Achievement Trend */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Achievement % Trend
                  </h3>
                  <p className="text-[11px] text-slate-500">Daily achievement percentage compared to 100% goal</p>
                </div>
              </div>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 120]} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const val = payload[0]?.value;
                          return (
                            <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-xl text-xs space-y-1 min-w-[170px]">
                              <p className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-1">{label}</p>
                              <div className="flex justify-between items-center text-slate-600 pt-1">
                                <span>Achievement:</span>
                                <span className={`font-black text-sm ${Number(val) >= 100 ? "text-emerald-600" : "text-amber-600"}`}>
                                  {Number(val).toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="achievementPercent"
                      name="Achievement %"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={{ fill: "#16a34a", strokeWidth: 2, r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey={() => 100}
                      name="100% Target"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ─── Shift Team Weekly Performance (Shift A vs Shift B) ─────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Weekly Team Performance (Shift A vs Shift B)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aggregated weekly output, variances, and exact performance rates across rotating duties
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Shift A Team */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-sm text-blue-900 flex items-center gap-1.5">
                    <Users size={15} />
                    Shift A Team
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                    Weekly Total
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-blue-200/70 text-center">
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Processed</p>
                    <p className="text-base sm:text-lg font-black text-blue-950">
                      {weeklyTeamAActual.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Target</p>
                    <p className="text-base sm:text-lg font-bold text-blue-800">
                      {weeklyTeamATarget.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Variance</p>
                    <p className={`text-base sm:text-lg font-black ${weeklyTeamAVariance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {weeklyTeamAVariance >= 0 ? `+${weeklyTeamAVariance.toLocaleString()}` : weeklyTeamAVariance.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Perf Rate</p>
                    <p
                      className={`text-base sm:text-lg font-black ${
                        weeklyTeamAPerf >= 100 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {weeklyTeamAPerf.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Shift B Team */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50/50 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-sm text-purple-900 flex items-center gap-1.5">
                    <Users size={15} />
                    Shift B Team
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-600 text-white shadow-xs">
                    Weekly Total
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-purple-200/70 text-center">
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Processed</p>
                    <p className="text-base sm:text-lg font-black text-purple-950">
                      {weeklyTeamBActual.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Target</p>
                    <p className="text-base sm:text-lg font-bold text-purple-800">
                      {weeklyTeamBTarget.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Variance</p>
                    <p className={`text-base sm:text-lg font-black ${weeklyTeamBVariance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {weeklyTeamBVariance >= 0 ? `+${weeklyTeamBVariance.toLocaleString()}` : weeklyTeamBVariance.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Perf Rate</p>
                    <p
                      className={`text-base sm:text-lg font-black ${
                        weeklyTeamBPerf >= 100 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {weeklyTeamBPerf.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Weekly Shift Output Distribution Comparison Bar */}
            {weeklyTotalActual > 0 && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                    <span className="text-slate-700">
                      Shift A Team: <strong>{weeklyTeamAActual.toLocaleString()}</strong> ({calcRatioPercent(weeklyTeamAActual, weeklyTotalActual)}) • Perf: <strong>{weeklyTeamAPerf.toFixed(2)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" />
                    <span className="text-slate-700">
                      Shift B Team: <strong>{weeklyTeamBActual.toLocaleString()}</strong> ({calcRatioPercent(weeklyTeamBActual, weeklyTotalActual)}) • Perf: <strong>{weeklyTeamBPerf.toFixed(2)}%</strong>
                    </span>
                  </div>
                </div>
                {/* Visual Ratio Bar */}
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                  <div
                    style={{ width: `${(weeklyTeamAActual / (weeklyTotalActual || 1)) * 100}%` }}
                    className="h-full bg-blue-600 transition-all duration-500"
                    title={`Shift A: ${calcRatioPercent(weeklyTeamAActual, weeklyTotalActual)}`}
                  />
                  <div
                    style={{ width: `${(weeklyTeamBActual / (weeklyTotalActual || 1)) * 100}%` }}
                    className="h-full bg-purple-600 transition-all duration-500"
                    title={`Shift B: ${calcRatioPercent(weeklyTeamBActual, weeklyTotalActual)}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Shift Comparison + Daily Summary Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Shift Comparison Graph with Interactive View Mode */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Shift Comparison
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {shiftChartMode === "team" ? "Shift A Team vs Shift B Team" : "Morning Shift vs Evening Shift"}
                  </p>
                </div>
                {/* View Mode Toggle Buttons */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                  <button
                    onClick={() => setShiftChartMode("team")}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                      shiftChartMode === "team"
                        ? "bg-white text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Users size={13} />
                    Shift Teams (A vs B)
                  </button>
                  <button
                    onClick={() => setShiftChartMode("time")}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                      shiftChartMode === "time"
                        ? "bg-white text-amber-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Clock size={13} />
                    Shift Time (M vs E)
                  </button>
                </div>
              </div>

              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0]?.payload as DayData;
                          if (!d) return null;

                          return (
                            <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs space-y-2 min-w-[220px]">
                              <div className="border-b border-slate-100 pb-1 flex items-center justify-between">
                                <p className="font-bold text-slate-800 text-sm">{label || d.displayDate}</p>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                  {shiftChartMode === "team" ? "By Shift Team" : "By Shift Time"}
                                </span>
                              </div>

                              {shiftChartMode === "team" ? (
                                <div className="space-y-1.5 pt-0.5">
                                  <div className="p-2 rounded-lg bg-blue-50/70 border border-blue-200/60">
                                    <div className="flex justify-between items-center text-blue-900 font-bold">
                                      <span>Shift A Team ({d.morningTeam === "A" ? "Morning" : "Evening"}):</span>
                                      <span className="font-black text-blue-700">{d.teamAActual.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-blue-700 text-[11px] mt-0.5">
                                      <span>Target: {d.teamATarget.toLocaleString()}</span>
                                      <span className="font-extrabold">{d.teamAPerf.toFixed(2)}%</span>
                                    </div>
                                  </div>

                                  <div className="p-2 rounded-lg bg-purple-50/70 border border-purple-200/60">
                                    <div className="flex justify-between items-center text-purple-900 font-bold">
                                      <span>Shift B Team ({d.morningTeam === "B" ? "Morning" : "Evening"}):</span>
                                      <span className="font-black text-purple-700">{d.teamBActual.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-purple-700 text-[11px] mt-0.5">
                                      <span>Target: {d.teamBTarget.toLocaleString()}</span>
                                      <span className="font-extrabold">{d.teamBPerf.toFixed(2)}%</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5 pt-0.5">
                                  <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-200/60">
                                    <div className="flex justify-between items-center text-amber-900 font-bold">
                                      <span>Morning (Shift {d.morningTeam}):</span>
                                      <span className="font-black text-amber-800">{d.morningActual.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-amber-700 text-[11px] mt-0.5">
                                      <span>Target: {d.morningTarget.toLocaleString()}</span>
                                      <span className="font-extrabold">
                                        {d.morningTarget > 0 ? ((d.morningActual / d.morningTarget) * 100).toFixed(2) : "0.00"}%
                                      </span>
                                    </div>
                                  </div>

                                  <div className="p-2 rounded-lg bg-indigo-50/70 border border-indigo-200/60">
                                    <div className="flex justify-between items-center text-indigo-900 font-bold">
                                      <span>Evening (Shift {d.eveningTeam}):</span>
                                      <span className="font-black text-indigo-800">{d.eveningActual.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-indigo-700 text-[11px] mt-0.5">
                                      <span>Target: {d.eveningTarget.toLocaleString()}</span>
                                      <span className="font-extrabold">
                                        {d.eveningTarget > 0 ? ((d.eveningActual / d.eveningTarget) * 100).toFixed(2) : "0.00"}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    {shiftChartMode === "team" ? (
                      <>
                        <Bar
                          dataKey="teamAActual"
                          name="Shift A Team"
                          fill="#2563eb"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="teamBActual"
                          name="Shift B Team"
                          fill="#9333ea"
                          radius={[4, 4, 0, 0]}
                        />
                      </>
                    ) : (
                      <>
                        <Bar
                          dataKey="morningActual"
                          name="Morning Shift"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="eveningActual"
                          name="Evening Shift"
                          fill="#6366f1"
                          radius={[4, 4, 0, 0]}
                        />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-around gap-2 pt-3 border-t border-slate-100 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  <span className="text-slate-600">
                    Shift A: <strong className="text-slate-900">{weeklyTeamAActual.toLocaleString()}</strong> ({weeklyTeamAPerf.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
                  <span className="text-slate-600">
                    Shift B: <strong className="text-slate-900">{weeklyTeamBActual.toLocaleString()}</strong> ({weeklyTeamBPerf.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 font-normal">
                  <span>•</span>
                  <span>M: {weeklyMorning.toLocaleString()}</span>
                  <span>•</span>
                  <span>E: {weeklyEvening.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Daily Summary Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-3">
                Daily Breakdown
              </h3>
              <div className="overflow-x-auto touch-scroll">
                <table className="data-table text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th className="text-center">Duty Teams</th>
                      <th className="text-center">Cartons</th>
                      <th className="text-center">Target</th>
                      <th className="text-center">Day %</th>
                      <th className="text-center">Shift A</th>
                      <th className="text-center">Shift B</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyData.map((d) => (
                      <tr key={d.date} className="hover:bg-blue-50/40 transition-colors">
                        <td>
                          <Link
                            href={`/daily-analysis?date=${d.date}`}
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                localStorage.setItem("md_carton_selected_date", d.date);
                              }
                            }}
                            className="font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                            title={`View Daily Analysis for ${d.displayDate}`}
                          >
                            <BarChart3 size={13} className="shrink-0 text-blue-500" />
                            <span>{d.displayDate}</span>
                          </Link>
                        </td>
                        <td className="text-center">
                          {d.morningTeam ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md">
                              <span className="text-blue-700">M:{d.morningTeam}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-purple-700">E:{d.eveningTeam || "—"}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">—</span>
                          )}
                        </td>
                        <td className="text-center font-bold text-slate-900">
                          {d.totalActual.toLocaleString()}
                        </td>
                        <td className="text-center text-slate-500">
                          {d.totalTarget.toLocaleString()}
                        </td>
                        <td
                          className={`text-center font-extrabold ${
                            d.achievementPercent >= 100
                              ? "text-emerald-600"
                              : d.achievementPercent >= 80
                              ? "text-amber-600"
                              : "text-red-600"
                          }`}
                        >
                          {d.achievementPercent.toFixed(2)}%
                        </td>
                        <td
                          className={`text-center font-black ${
                            d.teamAPerf >= 100 ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {d.teamAPerf.toFixed(2)}%
                        </td>
                        <td
                          className={`text-center font-black ${
                            d.teamBPerf >= 100 ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {d.teamBPerf.toFixed(2)}%
                        </td>
                        <td className="text-center">
                          <Link
                            href={`/daily-analysis?date=${d.date}`}
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                localStorage.setItem("md_carton_selected_date", d.date);
                                window.dispatchEvent(new CustomEvent("md_carton_date_change"));
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] border border-blue-200/80 transition-colors shadow-2xs"
                          >
                            <span>Analysis</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function WeeklyAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Loading weekly analysis...</p>
          </div>
        </div>
      }
    >
      <WeeklyAnalysisContent />
    </Suspense>
  );
}
