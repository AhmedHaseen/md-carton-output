"use client";

import { useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
} from "date-fns";

interface WeekPickerProps {
  weekStart: string; // YYYY-MM-DD (Monday)
  onWeekChange: (weekStart: string) => void;
  workingDays?: number;
}

export default function WeekPicker({
  weekStart,
  onWeekChange,
  workingDays,
}: WeekPickerProps) {
  const weekStartDate = new Date(weekStart + "T00:00:00");
  const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

  const currentMonday = format(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );
  const isCurrentWeek = weekStart === currentMonday;

  // Generate options for past 24 weeks (~6 months) + 2 future weeks
  const weekOptions = useMemo(() => {
    const today = new Date();
    const currMon = startOfWeek(today, { weekStartsOn: 1 });
    const options: { value: string; label: string; group?: string }[] = [];

    // Future weeks (2 weeks ahead)
    for (let i = 2; i >= 1; i--) {
      const start = addWeeks(currMon, i);
      const end = endOfWeek(start, { weekStartsOn: 1 });
      const val = format(start, "yyyy-MM-dd");
      options.push({
        value: val,
        label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")} (+${i} wk${i > 1 ? "s" : ""})`,
      });
    }

    // Current week
    const currEnd = endOfWeek(currMon, { weekStartsOn: 1 });
    options.push({
      value: format(currMon, "yyyy-MM-dd"),
      label: `${format(currMon, "MMM d")} – ${format(currEnd, "MMM d, yyyy")} (Current Week)`,
    });

    // Past 24 weeks (covers ~6 months)
    for (let i = 1; i <= 24; i++) {
      const start = subWeeks(currMon, i);
      const end = endOfWeek(start, { weekStartsOn: 1 });
      const val = format(start, "yyyy-MM-dd");

      let relativeDesc = `${i} wks ago`;
      if (i === 1) relativeDesc = "Last Week";
      else if (i === 2) relativeDesc = "2 wks ago";
      else if (i === 4) relativeDesc = "4 wks ago (~1 mo)";
      else if (i === 8) relativeDesc = "8 wks ago (~2 mos)";
      else if (i === 12) relativeDesc = "12 wks ago (~3 mos)";
      else if (i === 16) relativeDesc = "16 wks ago (~4 mos)";
      else if (i === 20) relativeDesc = "20 wks ago (~5 mos)";
      else if (i === 24) relativeDesc = "24 wks ago (~6 mos)";

      options.push({
        value: val,
        label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")} (${relativeDesc})`,
      });
    }

    return options;
  }, []);

  const handlePrevWeek = () => {
    const prev = subWeeks(new Date(weekStart + "T00:00:00"), 1);
    onWeekChange(format(startOfWeek(prev, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const handleNextWeek = () => {
    const next = addWeeks(new Date(weekStart + "T00:00:00"), 1);
    onWeekChange(format(startOfWeek(next, { weekStartsOn: 1 }), "yyyy-MM-dd"));
  };

  const handleThisWeek = () => {
    onWeekChange(currentMonday);
  };

  const handleDateJump = (dateStr: string) => {
    if (!dateStr) return;
    const selected = new Date(dateStr + "T00:00:00");
    const monday = format(startOfWeek(selected, { weekStartsOn: 1 }), "yyyy-MM-dd");
    onWeekChange(monday);
  };

  const isCustomWeek = !weekOptions.some((opt) => opt.value === weekStart);

  return (
    <div className="flex flex-col gap-3.5 mb-6 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
      {/* Top Primary Bar: Stepper, Range Display & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Step navigation + Active Week Title */}
        <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full md:w-auto">
          <button
            onClick={handlePrevWeek}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 shrink-0"
            title="Previous week"
            aria-label="Previous week"
            id="prev-week-btn"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl flex-1 sm:flex-initial min-w-0 justify-center">
            <Calendar size={16} className="text-blue-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap">
              {format(weekStartDate, "MMM d")} – {format(weekEndDate, "MMM d, yyyy")}
            </span>
            {isCurrentWeek ? (
              <span className="hidden sm:inline-block text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md shrink-0">
                This Week
              </span>
            ) : (
              <span className="hidden sm:inline-block text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md shrink-0">
                Custom
              </span>
            )}
          </div>

          <button
            onClick={handleNextWeek}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 shrink-0"
            title="Next week"
            aria-label="Next week"
            id="next-week-btn"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Right: Current Week button and recorded days info */}
        <div className="flex items-center justify-between md:justify-end gap-2.5 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          <button
            type="button"
            onClick={handleThisWeek}
            disabled={isCurrentWeek}
            className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              isCurrentWeek
                ? "text-slate-400 bg-slate-100 border border-slate-200/60 cursor-default"
                : "text-blue-600 bg-blue-50 hover:bg-blue-100 active:scale-95 border border-blue-200/80 cursor-pointer shadow-2xs"
            }`}
            title="Return to current week"
            id="current-week-btn"
          >
            <RotateCcw size={13} className={isCurrentWeek ? "text-slate-400" : "text-blue-600"} />
            <span>Current Week</span>
          </button>

          {typeof workingDays === "number" && (
            <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/60 whitespace-nowrap">
              {workingDays} recorded day{workingDays !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Secondary Controls: Quick Dropdown & Date Picker Jump */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5 pt-3 border-t border-slate-100">
        {/* Quick Dropdown of Past Weeks (Last 6 Months) */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <label
            htmlFor="week-range-select"
            className="text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <Clock size={13} className="text-slate-400" />
            <span>Select Week Range:</span>
          </label>
          <select
            id="week-range-select"
            value={weekStart}
            onChange={(e) => onWeekChange(e.target.value)}
            className="flex-1 min-w-0 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer truncate"
            title="Choose a specific week from the past 6 months"
          >
            {isCustomWeek && (
              <option value={weekStart}>
                Custom: {format(weekStartDate, "MMM d")} – {format(weekEndDate, "MMM d, yyyy")}
              </option>
            )}
            {weekOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Jump Directly by Calendar Date */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-2 w-full lg:w-auto">
          <label
            htmlFor="week-date-jump"
            className="text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <Calendar size={13} className="text-slate-400" />
            <span>Or Pick Any Date:</span>
          </label>
          <input
            id="week-date-jump"
            type="date"
            value={weekStart}
            onChange={(e) => handleDateJump(e.target.value)}
            className="flex-1 sm:flex-initial bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-2.5 py-1.5 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            title="Pick any calendar date to jump to its corresponding Monday–Sunday week"
          />
        </div>
      </div>
    </div>
  );
}
