"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { FileText, Download, Calendar, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import DatePicker from "@/components/date-picker";

function ReportsContent() {
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

  const [generating, setGenerating] = useState(false);

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      // Fetch report data from API
      const res = await fetch(`/api/reports/daily-pdf?date=${selectedDate}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to generate report");
        setGenerating(false);
        return;
      }

      const reportData = await res.json();

      // Dynamically import jsPDF (client-side only)
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // --- Header ---
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 297, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("MD Carton Output — Daily Report", 14, 12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Working Date: ${format(new Date(selectedDate + "T00:00:00"), "EEEE, MMMM d, yyyy")}`,
        14,
        20
      );
      doc.text(
        `Generated: ${format(new Date(), "MMM d, yyyy h:mm a")}`,
        200,
        20
      );
      doc.text(`Status: ${reportData.status}`, 200, 12);

      // --- KPI Summary ---
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", 14, 36);

      const kpi = reportData.kpis;
      const kpiData = [
        ["Total Cartons", kpi.totalActual.toString()],
        ["Total Target", kpi.totalTarget.toString()],
        ["Achievement %", `${kpi.achievementPercent}%`],
        ["Variance", `${kpi.totalActual - kpi.totalTarget}`],
        ["Completed Slots", `${kpi.completedSlots} / ${kpi.totalSlots}`],
        ["Morning Actual / Target", `${kpi.morningActual} / ${kpi.morningTarget}`],
        ["Evening Actual / Target", `${kpi.eveningActual} / ${kpi.eveningTarget}`],
      ];

      autoTable(doc, {
        startY: 39,
        head: [["KPI", "Value"]],
        body: kpiData,
        theme: "grid",
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
        margin: { left: 14, right: 160 },
      });

      // --- Morning Shift Table ---
      const morningEntries = reportData.entries.filter(
        (e: any) => e.shift === "MORNING"
      );
      const eveningEntries = reportData.entries.filter(
        (e: any) => e.shift === "EVENING"
      );

      const formatTime12 = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        const p = h >= 12 ? "PM" : "AM";
        return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${p}`;
      };

      const makeTableData = (entries: any[]) =>
        entries.map((e: any) => [
          `${formatTime12(e.startTime)} – ${formatTime12(e.endTime)}`,
          e.target.toString(),
          e.actual !== null ? e.actual.toString() : "—",
          e.variance !== null
            ? (e.variance >= 0 ? "+" : "") + e.variance.toString()
            : "—",
          e.cumulative !== null ? e.cumulative.toString() : "—",
          e.targetSource === "OVERRIDE" ? "Override" : "Default",
        ]);

      // Get Y position after KPI table
      const kpiEndY = (doc as any).lastAutoTable?.finalY ?? 75;

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Morning Shift (5:30 AM – 1:30 PM)", 14, kpiEndY + 8);

      autoTable(doc, {
        startY: kpiEndY + 11,
        head: [["Time Slot", "Target", "Actual", "Variance", "Shift Cum.", "Source"]],
        body: makeTableData(morningEntries),
        theme: "striped",
        headStyles: {
          fillColor: [245, 158, 11],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
        },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 45 },
          3: { halign: "center" },
          4: { halign: "center", fontStyle: "bold" },
        },
        margin: { left: 14 },
      });

      const morningEndY = (doc as any).lastAutoTable?.finalY ?? 130;

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Evening Shift (1:30 PM – 9:30 PM)", 14, morningEndY + 8);

      autoTable(doc, {
        startY: morningEndY + 11,
        head: [["Time Slot", "Target", "Actual", "Variance", "Shift Cum.", "Source"]],
        body: makeTableData(eveningEntries),
        theme: "striped",
        headStyles: {
          fillColor: [99, 102, 241],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
        },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 45 },
          3: { halign: "center" },
          4: { halign: "center", fontStyle: "bold" },
        },
        margin: { left: 14 },
      });

      // --- Footer ---
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          "MD Carton Output Digitalization System — FGWH Operations",
          14,
          doc.internal.pageSize.height - 8
        );
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.width - 30,
          doc.internal.pageSize.height - 8
        );
      }

      // Save
      const filename = `MD_Output_Daily_${selectedDate}.pdf`;
      doc.save(filename);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full pb-10">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
          Daily PDF Production Report
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Generate and download official warehouse daily shift output summaries
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-5 sm:p-8 max-w-xl mx-auto">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-sm shrink-0">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-base sm:text-lg">
              Official Daily Report
            </h2>
            <p className="text-xs text-slate-500">
              Complete shift tables, KPIs, and variance analysis in A4 Landscape
            </p>
          </div>
        </div>

        <div className="mb-6">
          <DatePicker
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            label="Select Report Date"
          />
        </div>

        <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-4 sm:p-5 mb-6 text-sm text-slate-600">
          <p className="font-bold text-slate-800 text-xs sm:text-sm mb-2.5 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>Document Contents</span>
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>Production date, shift status, and generator timestamp</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>5 Executive KPIs: Total Cartons, Target, %, and Net Variance</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Morning Shift breakdown: 8 hourly slots + subtotals</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span>Evening Shift breakdown: 8 hourly slots + subtotals</span>
            </li>
          </ul>
        </div>

        <div className="text-[11px] sm:text-xs text-slate-400 mb-5 flex items-center gap-1.5">
          <span>Target Filename:</span>
          <code className="bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded-md border border-slate-200/60 truncate">
            MD_Output_Daily_{selectedDate}.pdf
          </code>
        </div>

        <button
          onClick={handleGeneratePDF}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 active:scale-98 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-red-600/25 disabled:opacity-50 min-h-[48px]"
        >
          {generating ? (
            <>
              <Loader2 size={19} className="animate-spin" />
              <span>Compiling PDF Document...</span>
            </>
          ) : (
            <>
              <Download size={19} />
              <span>Download Daily PDF</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}
