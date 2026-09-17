"use client";

import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { format } from "date-fns";

interface DatePickerProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  label?: string;
}

export default function DatePicker({
  selectedDate,
  onDateChange,
  label = "Working Date",
}: DatePickerProps) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = selectedDate === todayStr;

  const handlePrev = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d - 1);
    onDateChange(format(date, "yyyy-MM-dd"));
  };

  const handleNext = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d + 1);
    onDateChange(format(date, "yyyy-MM-dd"));
  };

  const handleToday = () => {
    onDateChange(todayStr);
  };

  let displayDate = "";
  if (selectedDate) {
    const [y, m, d] = selectedDate.split("-").map(Number);
    displayDate = format(new Date(y, m - 1, d), "EEE, MMM d, yyyy");
  }

  return (
    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      {label && (
        <label className="text-xs sm:text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar size={15} className="text-blue-600" />
          <span>{label}</span>
        </label>
      )}

      <div className="flex items-center justify-between sm:justify-start gap-0.5 sm:gap-1 bg-white border border-slate-200/90 rounded-2xl p-1 shadow-sm w-full sm:w-auto min-w-0">
        <button
          onClick={handlePrev}
          className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 shrink-0"
          title="Previous day"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="relative flex-1 sm:flex-initial flex items-center justify-center px-0.5 min-w-0">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-full sm:w-auto px-1 sm:px-2 py-2 bg-transparent text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer text-center"
          />
        </div>

        <button
          onClick={handleNext}
          className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors text-slate-600 active:scale-95 shrink-0"
          title="Next day"
          aria-label="Next day"
        >
          <ChevronRight size={18} />
        </button>

        <div className="w-px h-6 bg-slate-200 mx-0.5" />

        {isToday ? (
          <span className="h-9 px-2.5 flex items-center justify-center text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 rounded-xl shrink-0 select-none">
            Today
          </span>
        ) : (
          <button
            type="button"
            onClick={handleToday}
            className="h-9 px-2.5 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Return to today's date"
            aria-label="Return to today's date"
          >
            <RotateCcw size={15} />
          </button>
        )}
      </div>

      {displayDate && (
        <span className="text-xs sm:text-sm font-medium text-slate-500 pl-1 sm:pl-0">
          {displayDate}
        </span>
      )}
    </div>
  );
}
