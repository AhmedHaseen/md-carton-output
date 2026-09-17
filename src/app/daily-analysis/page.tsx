"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import DatePicker from "@/components/date-picker";
import KpiCard from "@/components/kpi-card";
import { calculateSlotData, calculateDailyKPIs, formatTimeRange } from "@/lib/calculations";
import type { SlotEntry, SlotWithCalculations, DailyKPIs } from "@/lib/calculations";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

function DailyAnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

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

  // Sync if URL query parameter changes externally
  useEffect(() => {
    const urlDate = searchParams.get("date");
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) && urlDate !== selectedDate) {
      setSelectedDate(urlDate);
      setSlots([]);
      setKpis(null);
      setExists(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_date", urlDate);
      }
    }
  }, [searchParams]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setSlots([]);
    setKpis(null);
    setExists(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newDate);
    }
    router.replace(`?date=${newDate}`, { scroll: false });
  };
  const [slots, setSlots] = useState<SlotWithCalculations[]>([]);
  const [kpis, setKpis] = useState<DailyKPIs | null>(null);
  const [workDayInfo, setWorkDayInfo] = useState<{ morningTeam?: string | null; eveningTeam?: string | null } | null>(null);
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
        setSlots([]);
        setKpis(null);
        setWorkDayInfo(null);
        return;
      }

      setExists(true);
      setWorkDayInfo({
        morningTeam: data.workDay.morningTeam || null,
        eveningTeam: data.workDay.eveningTeam || null,
      });
      const entries: SlotEntry[] = data.workDay.entries.map((e: any) => ({
        id: e.id,
        sequenceNo: e.timeSlot.sequenceNo,
        shift: e.timeSlot.shift,
        startTime: e.timeSlot.startTime,
        endTime: e.timeSlot.endTime,
        targetCartons: e.targetCartons,
        actualCartons: e.actualCartons,
        targetSource: e.targetSource,
      }));

      const calculated = calculateSlotData(entries);
      setSlots(calculated);
      setKpis(calculateDailyKPIs(calculated));
    } catch {
      toast.error("Failed to load data");
      setWorkDayInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Chart data
  const hourlyChartData = slots.map((s) => ({
    time: `${s.startTime}`,
    target: s.targetCartons,
    actual: s.actualCartons ?? 0,
    shift: s.shift,
  }));

  const cumulativeChartData = slots
    .filter((s) => s.cumulativeActual !== null)
    .map((s) => ({
      time: s.startTime,
      cumulative: s.cumulativeActual,
      morningCum: s.shift === "MORNING" ? s.cumulativeActual : null,
      eveningCum: s.shift === "EVENING" ? s.cumulativeActual : null,
    }));

  const belowTargetSlots = slots.filter(
    (s) => s.actualCartons !== null && s.actualCartons < s.targetCartons
  );

  const shiftPieData = kpis
    ? [
        { name: "Morning", value: kpis.morningTotal, color: "#f59e0b" },
        { name: "Evening", value: kpis.eveningTotal, color: "#6366f1" },
      ]
    : [];

  return (
    <div className="w-full pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            Daily Progress Analysis
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Hourly trends, target variances, and shift performance
          </p>
        </div>

        <DatePicker selectedDate={selectedDate} onDateChange={handleDateChange} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Loading analysis...</p>
          </div>
        </div>
      )}

      {!loading && !exists && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-8 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
            <BarChart3 size={32} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
            No Production Records for this Date
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Please select an active date or create a working day on the Daily Input page.
          </p>
        </div>
      )}

      {!loading && exists && kpis && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <KpiCard
              title="Total Cartons"
              value={kpis.totalActual.toLocaleString()}
              subtitle={`of ${kpis.totalTarget.toLocaleString()}`}
              icon={Package}
              color="blue"
            />
            <KpiCard
              title={isToday ? "Today Achievement" : "Day Achievement"}
              value={`${kpis.achievementPercent.toFixed(1)}%`}
              subtitle={kpis.completedTarget > 0 ? `${kpis.performanceRate.toFixed(1)}% perf. rate` : undefined}
              icon={Target}
              trend={kpis.achievementPercent >= 100 ? "up" : "down"}
              color={kpis.achievementPercent >= 100 ? "green" : "amber"}
            />
            <KpiCard
              title="Variance"
              value={kpis.totalVariance >= 0 ? `+${kpis.totalVariance}` : `${kpis.totalVariance}`}
              icon={kpis.totalVariance >= 0 ? TrendingUp : TrendingDown}
              color={kpis.totalVariance >= 0 ? "green" : "red"}
            />
            <KpiCard
              title="Best Hour"
              value={
                kpis.bestHour
                  ? `${kpis.bestHour.actualCartons}`
                  : "—"
              }
              subtitle={kpis.bestHour ? formatTimeRange(kpis.bestHour.startTime, kpis.bestHour.endTime) : ""}
              icon={Award}
              color="cyan"
            />
            <div className="col-span-2 sm:col-span-1">
              <KpiCard
                title="Below Target"
                value={kpis.belowTargetSlots}
                subtitle={`of ${kpis.completedSlots} completed`}
                icon={AlertTriangle}
                color={kpis.belowTargetSlots > 0 ? "red" : "green"}
              />
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            {/* Hourly Actual vs Target Chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  Hourly Processed Cartons vs Target
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">16 Slots</span>
              </div>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={45}
                    />
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
                    <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Processed Cartons" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cumulative Output Curve */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-3.5 sm:p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  Cumulative Output Progression
                </h3>
                <span className="text-[11px] text-cyan-600 font-semibold">Total: {kpis.totalActual}</span>
              </div>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                    <Line
                      type="monotone"
                      dataKey="morningCum"
                      name="Morning Shift Cum."
                      stroke="#f59e0b"
                      strokeWidth={3}
                      connectNulls={false}
                      dot={{ fill: "#f59e0b", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="eveningCum"
                      name="Evening Shift Cum."
                      stroke="#6366f1"
                      strokeWidth={3}
                      connectNulls={false}
                      dot={{ fill: "#6366f1", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ─── Shift Team Comparison (Shift A vs Shift B) ─────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    Shift Team Performance (Shift A vs Shift B)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Comparing factory workforce team output for this date
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Team A Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-sm text-blue-900 flex items-center gap-1.5">
                    <Users size={15} />
                    Shift A Team
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                    {workDayInfo?.morningTeam === "A"
                      ? "Morning Shift"
                      : workDayInfo?.eveningTeam === "A"
                      ? "Evening Shift"
                      : "Unassigned"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-200/70 text-center">
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Processed</p>
                    <p className="text-lg font-black text-blue-950">
                      {workDayInfo?.morningTeam === "A"
                        ? kpis.morningTotal
                        : workDayInfo?.eveningTeam === "A"
                        ? kpis.eveningTotal
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Target</p>
                    <p className="text-lg font-bold text-blue-800">
                      {workDayInfo?.morningTeam === "A"
                        ? kpis.morningTarget
                        : workDayInfo?.eveningTeam === "A"
                        ? kpis.eveningTarget
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-bold uppercase">Perf Rate</p>
                    <p
                      className={`text-lg font-black ${
                        (workDayInfo?.morningTeam === "A"
                          ? kpis.morningTotal >= kpis.morningTarget
                          : kpis.eveningTotal >= kpis.eveningTarget)
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {workDayInfo?.morningTeam === "A"
                        ? kpis.morningTarget > 0
                          ? `${Math.round((kpis.morningTotal / kpis.morningTarget) * 100)}%`
                          : "0%"
                        : workDayInfo?.eveningTeam === "A"
                        ? kpis.eveningTarget > 0
                          ? `${Math.round((kpis.eveningTotal / kpis.eveningTarget) * 100)}%`
                          : "0%"
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Team B Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50/50 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-sm text-purple-900 flex items-center gap-1.5">
                    <Users size={15} />
                    Shift B Team
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-xs">
                    {workDayInfo?.morningTeam === "B"
                      ? "Morning Shift"
                      : workDayInfo?.eveningTeam === "B"
                      ? "Evening Shift"
                      : "Unassigned"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-purple-200/70 text-center">
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Processed</p>
                    <p className="text-lg font-black text-purple-950">
                      {workDayInfo?.morningTeam === "B"
                        ? kpis.morningTotal
                        : workDayInfo?.eveningTeam === "B"
                        ? kpis.eveningTotal
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Target</p>
                    <p className="text-lg font-bold text-purple-800">
                      {workDayInfo?.morningTeam === "B"
                        ? kpis.morningTarget
                        : workDayInfo?.eveningTeam === "B"
                        ? kpis.eveningTarget
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-700 font-bold uppercase">Perf Rate</p>
                    <p
                      className={`text-lg font-black ${
                        (workDayInfo?.morningTeam === "B"
                          ? kpis.morningTotal >= kpis.morningTarget
                          : kpis.eveningTotal >= kpis.eveningTarget)
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {workDayInfo?.morningTeam === "B"
                        ? kpis.morningTarget > 0
                          ? `${Math.round((kpis.morningTotal / kpis.morningTarget) * 100)}%`
                          : "0%"
                        : workDayInfo?.eveningTeam === "B"
                        ? kpis.eveningTarget > 0
                          ? `${Math.round((kpis.eveningTotal / kpis.eveningTarget) * 100)}%`
                          : "0%"
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Shift Comparison + Below Target Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Shift Comparison */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base mb-4">
                Shift Output Distribution
              </h3>
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={shiftPieData}
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {shiftPieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3 w-full sm:w-auto">
                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200/60">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                      <Sunrise size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-amber-700 font-semibold">Morning Shift</p>
                        {workDayInfo?.morningTeam && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-600 text-white">
                            Shift {workDayInfo.morningTeam}
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-black text-amber-900">
                        {kpis.morningTotal}{" "}
                        <span className="text-xs font-normal text-amber-700">
                          / {kpis.morningTarget} ({Math.round((kpis.morningTotal / (kpis.morningTarget || 1)) * 100)}%)
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200/60">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-700 flex items-center justify-center shrink-0">
                      <Moon size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-indigo-700 font-semibold">Evening Shift</p>
                        {workDayInfo?.eveningTeam && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">
                            Shift {workDayInfo.eveningTeam}
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-black text-indigo-900">
                        {kpis.eveningTotal}{" "}
                        <span className="text-xs font-normal text-indigo-700">
                          / {kpis.eveningTarget} ({Math.round((kpis.eveningTotal / (kpis.eveningTarget || 1)) * 100)}%)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Below Target Slots */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  Below Target Slots
                </h3>
                <span className="badge badge-below-target text-xs">
                  {belowTargetSlots.length} Slots
                </span>
              </div>

              {belowTargetSlots.length === 0 ? (
                <div className="text-center py-10">
                  <Award size={40} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">100% On or Above Target</p>
                  <p className="text-xs text-slate-400 mt-0.5">All completed time slots reached production goals.</p>
                </div>
              ) : (
                <div className="overflow-x-auto touch-scroll">
                  <table className="data-table text-xs sm:text-sm">
                    <thead>
                      <tr>
                        <th>Time Slot</th>
                        <th className="text-center">Target</th>
                        <th className="text-center">Actual</th>
                        <th className="text-center">Shortfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {belowTargetSlots.map((s) => (
                        <tr key={s.id}>
                          <td className="font-semibold text-slate-800">
                            {formatTimeRange(s.startTime, s.endTime)}
                          </td>
                          <td className="text-center font-medium text-slate-600">{s.targetCartons}</td>
                          <td className="text-center font-bold text-red-600">
                            {s.actualCartons}
                          </td>
                          <td className="text-center text-red-600 font-bold">
                            {s.variance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Loading analysis...</p>
          </div>
        </div>
      }
    >
      <DailyAnalysisContent />
    </Suspense>
  );
}
