"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from "date-fns";
import toast from "react-hot-toast";
import {
  Package,
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sunrise,
  Moon,
  BarChart3,
  Users,
} from "lucide-react";
import KpiCard from "@/components/kpi-card";
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
}

export default function WeeklyAnalysisPage() {
  const [weekStart, setWeekStart] = useState(() =>
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(false);

  const weekEnd = format(
    endOfWeek(new Date(weekStart + "T00:00:00"), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

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

          results.push({
            date: dateStr,
            displayDate: format(day, "EEE, MMM d"),
            totalActual,
            totalTarget,
            morningActual,
            morningTarget,
            eveningActual,
            eveningTarget,
            morningTeam: data.workDay.morningTeam || null,
            eveningTeam: data.workDay.eveningTeam || null,
            completedSlots: completed.length,
            belowTargetSlots: belowTarget,
            achievementPercent:
              totalTarget > 0
                ? Math.round((totalActual / totalTarget) * 1000) / 10
                : 0,
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
      ? Math.round((weeklyTotalActual / weeklyTotalTarget) * 1000) / 10
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
      ? Math.round((weeklyTeamAActual / weeklyTeamATarget) * 1000) / 10
      : 0;
  const weeklyTeamBPerf =
    weeklyTeamBTarget > 0
      ? Math.round((weeklyTeamBActual / weeklyTeamBTarget) * 1000) / 10
      : 0;

  const handlePrevWeek = () => {
    const prev = subWeeks(new Date(weekStart + "T00:00:00"), 1);
    setWeekStart(format(startOfWeek(prev, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const handleNextWeek = () => {
    const next = addWeeks(new Date(weekStart + "T00:00:00"), 1);
    setWeekStart(format(startOfWeek(next, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const handleThisWeek = () => {
    setWeekStart(
      format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
    );
  };

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

      {/* Week Selector Bar (Mobile-friendly) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between sm:justify-start gap-1 w-full sm:w-auto">
          <button
            onClick={handlePrevWeek}
            className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 shrink-0"
            title="Previous week"
            aria-label="Previous week"
          >
            <ChevronLeft size={20} />
          </button>

          <span className="px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 text-center flex-1 sm:flex-initial sm:min-w-[220px]">
            {format(new Date(weekStart + "T00:00:00"), "MMM d")} –{" "}
            {format(new Date(weekEnd + "T00:00:00"), "MMM d, yyyy")}
          </span>

          <button
            onClick={handleNextWeek}
            className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 shrink-0"
            title="Next week"
            aria-label="Next week"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0">
          <button
            onClick={handleThisWeek}
            className="h-10 px-4 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
          >
            Current Week
          </button>
          <span className="text-xs font-semibold text-slate-500">
            {workingDays} recorded day{workingDays !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

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
              value={`${weeklyAchievementPercent}%`}
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
              <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-4">
                Processed Cartons vs Target (Week)
              </h3>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        fontSize: "12px",
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
              <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-4">
                Achievement % Trend
              </h3>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 120]} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        fontSize: "12px",
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Weekly Team Performance (Shift A vs Shift B)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aggregated weekly output and performance across rotating duties
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-200/70 text-center">
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Processed</p>
                    <p className="text-lg sm:text-xl font-black text-blue-950">
                      {weeklyTeamAActual.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Target</p>
                    <p className="text-lg sm:text-xl font-bold text-blue-800">
                      {weeklyTeamATarget.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Perf Rate</p>
                    <p
                      className={`text-lg sm:text-xl font-black ${
                        weeklyTeamAPerf >= 100 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {weeklyTeamAPerf}%
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
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs">
                    Weekly Total
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-purple-200/70 text-center">
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Processed</p>
                    <p className="text-lg sm:text-xl font-black text-purple-950">
                      {weeklyTeamBActual.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Target</p>
                    <p className="text-lg sm:text-xl font-bold text-purple-800">
                      {weeklyTeamBTarget.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Perf Rate</p>
                    <p
                      className={`text-lg sm:text-xl font-black ${
                        weeklyTeamBPerf >= 100 ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {weeklyTeamBPerf}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Shift Comparison + Daily Summary Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Morning vs Evening Shift Output */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-3">
                Shift Comparison
              </h3>
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="displayDate" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="morningActual"
                      name="Morning"
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="eveningActual"
                      name="Evening"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-around gap-4 pt-3 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <Sunrise size={16} className="text-amber-500" />
                  <span className="text-slate-600 font-medium">
                    Morning Total: <strong className="text-slate-800">{weeklyMorning}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Moon size={16} className="text-indigo-500" />
                  <span className="text-slate-600 font-medium">
                    Evening Total: <strong className="text-slate-800">{weeklyEvening}</strong>
                  </span>
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
                      <th className="text-center">Total Cartons</th>
                      <th className="text-center">Target</th>
                      <th className="text-center">%</th>
                      <th className="text-center">Slots</th>
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
                            className="font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5"
                            title={`View Daily Analysis for ${d.displayDate}`}
                          >
                            <BarChart3 size={14} className="shrink-0 text-blue-500" />
                            <span>{d.displayDate}</span>
                          </Link>
                        </td>
                        <td className="text-center">
                          {d.morningTeam ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                              <span className="text-blue-700">M: {d.morningTeam}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-indigo-700">E: {d.eveningTeam || "—"}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">—</span>
                          )}
                        </td>
                        <td className="text-center font-bold text-slate-900">
                          {d.totalActual}
                        </td>
                        <td className="text-center text-slate-500">
                          {d.totalTarget}
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
                          {d.achievementPercent}%
                        </td>
                        <td className="text-center text-slate-600">
                          {d.completedSlots}/16
                        </td>
                        <td className="text-center">
                          <Link
                            href={`/daily-analysis?date=${d.date}`}
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                localStorage.setItem("md_carton_selected_date", d.date);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200/80 transition-colors shadow-xs"
                          >
                            <span>Daily Analysis</span>
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
