"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  PlusCircle,
  Lock,
  Sunrise,
  Moon,
  Monitor,
  ChevronDown,
  Users,
  CheckCircle2,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import DatePicker from "@/components/date-picker";
import DailyOutputTable from "@/components/daily-output-table";
import { calculateSlotData } from "@/lib/calculations";
import type { SlotEntry, SlotWithCalculations } from "@/lib/calculations";
import { MD_LINES, getDefaultCustomerType, DEFAULT_CUSTOMER_TARGETS, getSlotTargetForCustomer } from "@/lib/target-config";
import type { CustomerTypeKey, MdLineNumber, CustomerTargetConfig } from "@/lib/target-config";

interface WorkDayData {
  id: string;
  workDate: string;
  status: "OPEN" | "CLOSED";
  morningTeam?: string | null;
  eveningTeam?: string | null;
  createdLines?: number[];
  entries: Array<{
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

  // Sync if URL query parameter changes externally
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
    setLoading(true);
    setWorkDay(null);
    setExists(false);
    setSelectedMdLine(null);
    setMorningCustomerType(null);
    setEveningCustomerType(null);
    setIsCreatingNewLine(false);
    setIsAccessUnlocked(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_date", newDate);
      window.dispatchEvent(new CustomEvent("md_carton_date_change"));
    }
    router.replace(`?date=${newDate}`, { scroll: false });
  };

  const [workDay, setWorkDay] = useState<WorkDayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [exists, setExists] = useState(false);

  // Shift filter: only MORNING or EVENING (All Slots removed per user request)
  const [shiftFilter, setShiftFilter] = useState<"MORNING" | "EVENING">("MORNING");

  // Selection gate: MD Line must be chosen, then Customer Type for Morning AND Evening, then table unlocks
  // Initialized to null so no line is pre-selected on uncreated or newly created days
  const [selectedMdLine, setSelectedMdLine] = useState<MdLineNumber | null>(null);
  const [morningCustomerType, setMorningCustomerType] = useState<CustomerTypeKey | null>(null);
  const [eveningCustomerType, setEveningCustomerType] = useState<CustomerTypeKey | null>(null);
  const [isAccessUnlocked, setIsAccessUnlocked] = useState(false);
  const [lineDropdownOpen, setLineDropdownOpen] = useState(false);
  const [isOpeningTable, setIsOpeningTable] = useState(false);
  const [isCreatingNewLine, setIsCreatingNewLine] = useState(false);

  const [defaultDuty, setDefaultDuty] = useState<{
    morningTeam: "A" | "B";
    eveningTeam: "A" | "B";
    weekRange?: string;
  } | null>(null);
  const [showOverrideBadge, setShowOverrideBadge] = useState<boolean>(true);
  const [enforce30MinLock, setEnforce30MinLock] = useState<boolean>(true);
  const [customerTargets, setCustomerTargets] = useState<CustomerTargetConfig>({
    ...DEFAULT_CUSTOMER_TARGETS,
  });

  // Fetch work day data
  const fetchWorkDay = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-days?date=${date}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data && data.settings) {
        if (typeof data.settings.showOverrideBadge === "boolean") {
          setShowOverrideBadge(data.settings.showOverrideBadge);
        }
        if (typeof data.settings.enforce30MinLock === "boolean") {
          setEnforce30MinLock(data.settings.enforce30MinLock);
        }
        if (data.settings.customerTargets) {
          setCustomerTargets(data.settings.customerTargets);
        }
      }
      if (data && data.defaultDuty) {
        setDefaultDuty(data.defaultDuty);
      }
      if (data && data.exists && data.workDay) {
        setWorkDay(data.workDay);
        setExists(true);
        const created = (data.workDay.createdLines || []) as number[];
        if (created.length > 0 && !isCreatingNewLine) {
          setSelectedMdLine((prev) => {
            const storedLine = typeof window !== "undefined" ? Number(localStorage.getItem("md_carton_selected_line")) : null;
            const lineToSelect: MdLineNumber =
              prev && created.includes(prev)
                ? prev
                : storedLine && created.includes(storedLine as any)
                ? (storedLine as MdLineNumber)
                : (created[0] as MdLineNumber);

            if (typeof window !== "undefined") {
              localStorage.setItem("md_carton_selected_line", String(lineToSelect));
            }
            const lineEntries = (data.workDay.entries || []).filter(
              (e: any) => e.mdLine === lineToSelect
            );
            const morningEntry = lineEntries.find((e: any) => e.timeSlot?.shift === "MORNING");
            const eveningEntry = lineEntries.find((e: any) => e.timeSlot?.shift === "EVENING");
            setMorningCustomerType(morningEntry?.customerType || null);
            setEveningCustomerType(eveningEntry?.customerType || null);
            setIsAccessUnlocked(true);
            return lineToSelect;
          });
        } else {
          // If NO lines created yet, do NOT auto-select line or customer - let user choose manually!
          setIsAccessUnlocked(false);
        }
      } else {
        setWorkDay(null);
        setExists(false);
        setSelectedMdLine(null);
        setMorningCustomerType(null);
        setEveningCustomerType(null);
        setIsAccessUnlocked(false);
      }
    } catch {
      toast.error("Failed to load data");
      setWorkDay(null);
      setExists(false);
      setSelectedMdLine(null);
      setMorningCustomerType(null);
      setEveningCustomerType(null);
      setIsAccessUnlocked(false);
    } finally {
      setLoading(false);
    }
  }, [isCreatingNewLine]);

  useEffect(() => {
    fetchWorkDay(selectedDate);
  }, [selectedDate, fetchWorkDay]);

  // Whenever MD line changes or resets, default shift view to Morning shift
  useEffect(() => {
    if (selectedMdLine) {
      setShiftFilter("MORNING");
    }
  }, [selectedMdLine]);

  // Create new work day
  const handleCreateDay = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/work-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });

      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        router.push("/login");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create day");
        return;
      }

      setWorkDay(data.workDay);
      setExists(true);
      // Clean reset: user manually selects MD Line and customer types
      setSelectedMdLine(null);
      setMorningCustomerType(null);
      setEveningCustomerType(null);
      setIsCreatingNewLine(false);
      setIsAccessUnlocked(false);
      setShiftFilter("MORNING");
      if (typeof window !== "undefined") {
        localStorage.removeItem("md_carton_selected_line");
      }
      toast.success("Work day created! Please select an MD Line to get started.");
    } catch (err: any) {
      console.error("handleCreateDay error:", err);
      toast.error(err?.message || "Failed to create work day");
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

      if (data.allEntries) {
        setWorkDay((prev) => (prev ? { ...prev, entries: data.allEntries } : prev));
      } else {
        await fetchWorkDay(selectedDate);
      }
      toast.success("Saved successfully");
    } catch {
      toast.error("Failed to save entry");
    }
  };

  // Change customer type for a specific hourly slot
  const handleSlotCustomerChange = async (entryId: string, newCustomerType: CustomerTypeKey) => {
    try {
      // Optimistically update local workDay entries
      setWorkDay((prev) => {
        if (!prev) return prev;
        const entry = prev.entries.find((e) => e.id === entryId);
        if (!entry) return prev;

        const calculatedTarget = getSlotTargetForCustomer(
          entry.timeSlot.sequenceNo,
          newCustomerType,
          entry.mdLine,
          undefined,
          customerTargets
        );

        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  customerType: newCustomerType,
                  targetCartons: calculatedTarget,
                  targetSource: "OVERRIDE" as const,
                }
              : e
          ),
        };
      });

      const res = await fetch("/api/output-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, customerType: newCustomerType }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to update slot customer");
        await fetchWorkDay(selectedDate);
        return;
      }

      await fetchWorkDay(selectedDate);
      toast.success(
        `Slot customer set to ${newCustomerType === "PVH" ? "PV Products" : "Other Customers"}`
      );
    } catch {
      toast.error("Failed to update slot customer");
      await fetchWorkDay(selectedDate);
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

  // When operator chooses an MD Line in the setup gate
  const handleSelectMdLine = (line: MdLineNumber) => {
    setSelectedMdLine(line);
    setShiftFilter("MORNING");
    const createdLines = (workDay?.createdLines || []) as number[];
    if (createdLines.includes(line) && workDay) {
      // Immediately redirect/open shift table for already created line without showing customer choose
      const lineEntries = workDay.entries.filter((e) => e.mdLine === line);
      const morningEntry = lineEntries.find((e) => e.timeSlot.shift === "MORNING");
      const eveningEntry = lineEntries.find((e) => e.timeSlot.shift === "EVENING");
      setMorningCustomerType(morningEntry?.customerType || null);
      setEveningCustomerType(eveningEntry?.customerType || null);
      setIsCreatingNewLine(false);
      setIsAccessUnlocked(true);
      toast.success(`Opened MD Line ${line} Shift Table`);
    } else {
      // New line: operator must explicitly choose for each shift
      setMorningCustomerType(null);
      setEveningCustomerType(null);
      setIsAccessUnlocked(false);
    }
  };

  // Quick switch to an already-created line via the dropdown (skips the full gate)
  const handleQuickSwitchLine = (line: MdLineNumber) => {
    setSelectedMdLine(line);
    setShiftFilter("MORNING");
    setLineDropdownOpen(false);
    setIsCreatingNewLine(false);
    setIsAccessUnlocked(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("md_carton_selected_line", String(line));
    }
    if (workDay) {
      const lineEntries = workDay.entries.filter((e) => e.mdLine === line);
      const morningEntry = lineEntries.find((e) => e.timeSlot.shift === "MORNING");
      const eveningEntry = lineEntries.find((e) => e.timeSlot.shift === "EVENING");
      setMorningCustomerType(morningEntry?.customerType || null);
      setEveningCustomerType(eveningEntry?.customerType || null);
    }
    toast.success(`Switched to MD Line ${line}`);
  };

  // When operator confirms their MD Line & Shift Customer Types selection
  const handleUnlockAndAccess = async () => {
    if (!selectedMdLine) {
      toast.error("Please choose an MD Line first");
      return;
    }
    if (!morningCustomerType || !eveningCustomerType) {
      toast.error("Please select customer type for both Morning and Evening shifts");
      return;
    }

    setIsOpeningTable(true);
    try {
      if (workDay) {
        try {
          const res = await fetch("/api/work-days", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workDayId: workDay.id,
              mdLine: selectedMdLine,
              morningCustomerType,
              eveningCustomerType,
            }),
          });
          const data = await res.json();
          if (data.workDay) {
            setWorkDay(data.workDay);
          }
        } catch {
          // Continue even if update had minor network latency
        }
        await fetchWorkDay(selectedDate);
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("md_carton_selected_line", String(selectedMdLine));
      }
      setIsCreatingNewLine(false);
      setIsAccessUnlocked(true);
      setShiftFilter("MORNING");
      const pvRate = customerTargets?.PVH?.normal ?? 60;
      const otherRate = customerTargets?.OTHER?.normal ?? 40;
      toast.success(
        `MD Line ${selectedMdLine} loaded • Morning (${
          morningCustomerType === "PVH" ? `PV ${pvRate}/h` : `Other ${otherRate}/h`
        }) & Evening (${
          eveningCustomerType === "PVH" ? `PV ${pvRate}/h` : `Other ${otherRate}/h`
        })`
      );
    } finally {
      setIsOpeningTable(false);
    }
  };

  // Change Customer Type for a specific shift while table is already unlocked
  const handleShiftCustomerTypeChange = async (
    shift: "MORNING" | "EVENING",
    newType: CustomerTypeKey
  ) => {
    if (!workDay || !selectedMdLine) return;

    const currentShiftEntries = workDay.entries.filter(
      (e) => e.mdLine === selectedMdLine && e.timeSlot.shift === shift
    );
    const unenteredSlots = currentShiftEntries.filter((e) => e.actualCartons === null);
    if (unenteredSlots.length === 0) {
      toast.error(
        `All time slots for ${
          shift === "MORNING" ? "Morning" : "Evening"
        } Shift are already completed.`
      );
      return;
    }

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

    try {
      const payload: any =
        shift === "MORNING"
          ? { workDayId: workDay.id, mdLine: selectedMdLine, morningCustomerType: newType, adminOverride: isAdmin }
          : { workDayId: workDay.id, mdLine: selectedMdLine, eveningCustomerType: newType, adminOverride: isAdmin };

      const res = await fetch("/api/work-days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update customer type");
        return;
      }
      if (shift === "MORNING") setMorningCustomerType(newType);
      if (shift === "EVENING") setEveningCustomerType(newType);
      await fetchWorkDay(selectedDate);
      const pvRate = customerTargets?.PVH?.normal ?? 60;
      const otherRate = customerTargets?.OTHER?.normal ?? 40;
      const enteredCount = currentShiftEntries.length - unenteredSlots.length;
      if (enteredCount > 0) {
        toast.success(
          `${shift === "MORNING" ? "Morning" : "Evening"} Shift: Remaining ${unenteredSlots.length} slot(s) switched to ${
            newType === "PVH" ? `PV (${pvRate}/h)` : `Other Customers (${otherRate}/h)`
          } (${enteredCount} entered slot(s) preserved)`
        );
      } else {
        toast.success(
          `${shift === "MORNING" ? "Morning" : "Evening"} Shift set to ${
            newType === "PVH" ? `PV (${pvRate}/h)` : `Other Customers (${otherRate}/h)`
          }`
        );
      }
    } catch {
      toast.error("Failed to update customer type");
    }
  };

  // Memoize line transformation, calculated slots, and shift totals
  const {
    lineEntries,
    calculatedSlots,
    morningEntries,
    eveningEntries,
    morningTotal,
    morningTarget,
    eveningTotal,
    eveningTarget,
    activeMorningCustomer,
    activeEveningCustomer,
    isMorningMixed,
    morningCustomerLabel,
    isEveningMixed,
    eveningCustomerLabel,
  } = useMemo(() => {
    const lEntries: SlotEntry[] =
      workDay?.entries
        .filter((e) => e.mdLine === selectedMdLine)
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
        })) ?? [];

    const cSlots: SlotWithCalculations[] = calculateSlotData(lEntries);

    const mEntries = lEntries.filter((e) => e.shift === "MORNING");
    const eEntries = lEntries.filter((e) => e.shift === "EVENING");

    const mTotal = mEntries.reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
    const mTarget = mEntries.reduce((sum, e) => sum + e.targetCartons, 0);

    const eTotal = eEntries.reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
    const eTarget = eEntries.reduce((sum, e) => sum + e.targetCartons, 0);

    const firstUnm = mEntries.find((e) => e.actualCartons === null);
    const actMCust: CustomerTypeKey =
      morningCustomerType || firstUnm?.customerType || mEntries[0]?.customerType || "PVH";

    const firstUne = eEntries.find((e) => e.actualCartons === null);
    const actECust: CustomerTypeKey =
      eveningCustomerType || firstUne?.customerType || eEntries[0]?.customerType || "PVH";

    const mHasPVH = mEntries.some((e) => e.customerType === "PVH");
    const mHasOTHER = mEntries.some((e) => e.customerType === "OTHER");
    const isMMixed = mHasPVH && mHasOTHER;
    const mCustLabel = isMMixed
      ? `PV (${customerTargets?.PVH?.normal ?? 60}/h) / Other (${customerTargets?.OTHER?.normal ?? 40}/h)`
      : actMCust === "PVH"
      ? `PV (${customerTargets?.PVH?.normal ?? 60}/h)`
      : `Other (${customerTargets?.OTHER?.normal ?? 40}/h)`;

    const eHasPVH = eEntries.some((e) => e.customerType === "PVH");
    const eHasOTHER = eEntries.some((e) => e.customerType === "OTHER");
    const isEMixed = eHasPVH && eHasOTHER;
    const eCustLabel = isEMixed
      ? `PV (${customerTargets?.PVH?.normal ?? 60}/h) / Other (${customerTargets?.OTHER?.normal ?? 40}/h)`
      : actECust === "PVH"
      ? `PV (${customerTargets?.PVH?.normal ?? 60}/h)`
      : `Other (${customerTargets?.OTHER?.normal ?? 40}/h)`;

    return {
      lineEntries: lEntries,
      calculatedSlots: cSlots,
      morningEntries: mEntries,
      eveningEntries: eEntries,
      morningTotal: mTotal,
      morningTarget: mTarget,
      eveningTotal: eTotal,
      eveningTarget: eTarget,
      activeMorningCustomer: actMCust,
      activeEveningCustomer: actECust,
      isMorningMixed: isMMixed,
      morningCustomerLabel: mCustLabel,
      isEveningMixed: isEMixed,
      eveningCustomerLabel: eCustLabel,
    };
  }, [workDay, selectedMdLine, morningCustomerType, eveningCustomerType, customerTargets]);

  return (
    <div className="w-full pb-10">
      {/* ─── Page Header & Date Navigation ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>Daily Output Input</span>
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
          <DatePicker selectedDate={selectedDate} onDateChange={handleDateChange} />
        </div>
      </div>

      {/* ─── Loading State ───────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Loading production day...</p>
          </div>
        </div>
      )}

      {/* ─── STEP 1: Create Working Day Prompt (When day does not exist) ─── */}
      {!loading && (!exists || !workDay) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-6 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-16 h-16 bg-blue-100/80 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600 shadow-sm">
            <PlusCircle size={32} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
            No Working Day Created for {format(new Date(selectedDate), "MMM dd, yyyy")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Please create this working day first to initialize all 3 MD line channels and time slots.
          </p>

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
      )}

      {/* ─── STEP 2: Selection Gate: Choose MD Line First, then Customer Type for Both Shifts ─── */}
      {!loading && exists && workDay && !isAccessUnlocked && (() => {
        const createdLines = workDay.createdLines || [];
        const uncreatedLines = MD_LINES.filter((l) => !createdLines.includes(l));
        const allLinesCreated = uncreatedLines.length === 0;

        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-5 sm:p-8 max-w-2xl mx-auto my-6">
            {createdLines.length > 0 && (
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingNewLine(false);
                    setIsAccessUnlocked(true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>← Back to Shift Table</span>
                </button>
              </div>
            )}
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <SlidersHorizontal size={24} />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                Choose MD Line &amp; Shift Customer Types
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {allLinesCreated
                  ? "All 3 MD lines are created. Select a line to access its shift table."
                  : `${createdLines.length}/3 lines created. Select a line to configure or access.`}
              </p>
            </div>

            {/* Sub-step 1: MD Line Selection */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <span>Choose MD Line</span>
                </label>
                <span className="text-[11px] font-medium text-slate-400">
                  {createdLines.length}/3 lines created
                </span>
              </div>

              {/* If lines are already created, show them as a dropdown-style list */}
              {createdLines.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    Created Lines — Click to access
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(createdLines as number[]).sort((a, b) => a - b).map((line) => {
                      const isSelected = selectedMdLine === line;
                      return (
                        <button
                          key={`created-${line}`}
                          type="button"
                          onClick={() => handleSelectMdLine(line as MdLineNumber)}
                          className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-100/90 shadow-md ring-2 ring-emerald-500/25 text-emerald-950 scale-[1.01]"
                              : "border-emerald-200 bg-emerald-50/40 hover:border-emerald-400 hover:bg-emerald-50/80 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                                  isSelected
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "bg-emerald-200/70 text-emerald-800"
                                }`}
                              >
                                L{line}
                              </div>
                              <div>
                                <span
                                  className={`font-extrabold text-sm block ${
                                    isSelected ? "text-emerald-950" : "text-slate-800"
                                  }`}
                                >
                                  MD Line - {line}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold ${
                                    isSelected ? "text-emerald-700" : "text-emerald-600/80"
                                  }`}
                                >
                                  {isSelected ? "Currently Selected" : "Click to open table"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {isSelected ? (
                                <span className="text-[11px] font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                  <CheckCircle2 size={13} />
                                  Selected
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 size={12} />
                                  Created
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Uncreated lines — available to create */}
              {uncreatedLines.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <PlusCircle size={13} className="text-blue-500" />
                    Available to Create
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {uncreatedLines.map((line) => {
                      const isSelected = selectedMdLine === line;
                      return (
                        <button
                          key={`new-${line}`}
                          type="button"
                          onClick={() => handleSelectMdLine(line as MdLineNumber)}
                          className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                            isSelected
                              ? "border-blue-600 bg-blue-100/90 shadow-md ring-2 ring-blue-500/25 text-blue-950 scale-[1.01]"
                              : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                                  isSelected ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                L{line}
                              </div>
                              <div>
                                <span
                                  className={`font-extrabold text-sm block ${
                                    isSelected ? "text-blue-950" : "text-slate-800"
                                  }`}
                                >
                                  MD Line - {line}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold ${
                                    isSelected ? "text-blue-700" : "text-slate-400"
                                  }`}
                                >
                                  {isSelected ? "Currently Selected" : "Click to select"}
                                </span>
                              </div>
                            </div>
                            <div>
                              {isSelected ? (
                                <span className="text-[11px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                  <CheckCircle2 size={13} />
                                  Selected
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Available
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sub-step 2: Shift-specific Customer Type Selection (ONLY for newly selected uncreated lines) */}
            {selectedMdLine && !createdLines.includes(selectedMdLine) ? (
              <>
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                      2
                    </span>
                    <span>
                      Select Customer Type for Morning &amp; Evening Shifts — MD Line {selectedMdLine}
                    </span>
                  </label>

                  {/* Morning Shift Customer Type */}
                  <div className="p-3.5 bg-amber-50/40 rounded-xl border border-amber-200/70 mb-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <Sunrise size={16} className="text-amber-600" />
                        <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                          Morning Shift (05:30 AM – 01:30 PM)
                        </span>
                      </div>
                      {morningCustomerType ? (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                          {morningCustomerType === "PVH" ? "PV Selected" : "Other Customers Selected"}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700">Please choose an option</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setMorningCustomerType("PVH")}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                          morningCustomerType === "PVH"
                            ? "border-blue-600 bg-blue-100/90 shadow-md ring-2 ring-blue-500/25 text-blue-950 scale-[1.01]"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`font-black text-xs flex items-center gap-1.5 ${
                              morningCustomerType === "PVH" ? "text-blue-950" : "text-slate-800"
                            }`}
                          >
                            <Users
                              size={14}
                              className={morningCustomerType === "PVH" ? "text-blue-700" : "text-blue-600"}
                            />
                            PV Products
                          </span>
                          {morningCustomerType === "PVH" ? (
                            <span className="text-[11px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                              <CheckCircle2 size={13} /> Selected
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">Click to select</span>
                          )}
                        </div>
                        <p
                          className={`text-xs font-bold ${
                            morningCustomerType === "PVH" ? "text-blue-800" : "text-blue-700"
                          }`}
                        >
                          {customerTargets.PVH.normal} ctns/hr{" "}
                          <span className="text-[11px] font-normal opacity-90">
                            (Break: {customerTargets.PVH.breakfast}, Tea: {customerTargets.PVH.tea})
                          </span>
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMorningCustomerType("OTHER")}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                          morningCustomerType === "OTHER"
                            ? "border-violet-600 bg-violet-100/90 shadow-md ring-2 ring-violet-500/25 text-violet-950 scale-[1.01]"
                            : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`font-black text-xs flex items-center gap-1.5 ${
                              morningCustomerType === "OTHER" ? "text-violet-950" : "text-slate-800"
                            }`}
                          >
                            <Users
                              size={14}
                              className={morningCustomerType === "OTHER" ? "text-violet-700" : "text-violet-600"}
                            />
                            Other Customers
                          </span>
                          {morningCustomerType === "OTHER" ? (
                            <span className="text-[11px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                              <CheckCircle2 size={13} /> Selected
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">Click to select</span>
                          )}
                        </div>
                        <p
                          className={`text-xs font-bold ${
                            morningCustomerType === "OTHER" ? "text-violet-800" : "text-violet-700"
                          }`}
                        >
                          {customerTargets.OTHER.normal} ctns/hr{" "}
                          <span className="text-[11px] font-normal opacity-90">
                            (Break: {customerTargets.OTHER.breakfast}, Tea: {customerTargets.OTHER.tea})
                          </span>
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Evening Shift Customer Type */}
                  <div className="p-3.5 bg-indigo-50/40 rounded-xl border border-indigo-200/70">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <Moon size={16} className="text-indigo-600" />
                        <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                          Evening Shift (01:30 PM – 09:30 PM)
                        </span>
                      </div>
                      {eveningCustomerType ? (
                        <span className="text-[11px] font-bold text-indigo-800 bg-indigo-200/70 px-2 py-0.5 rounded-full">
                          {eveningCustomerType === "PVH" ? "PV Selected" : "Other Customers Selected"}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-indigo-700">Please choose an option</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setEveningCustomerType("PVH")}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                          eveningCustomerType === "PVH"
                            ? "border-blue-600 bg-blue-100/90 shadow-md ring-2 ring-blue-500/25 text-blue-950 scale-[1.01]"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`font-black text-xs flex items-center gap-1.5 ${
                              eveningCustomerType === "PVH" ? "text-blue-950" : "text-slate-800"
                            }`}
                          >
                            <Users
                              size={14}
                              className={eveningCustomerType === "PVH" ? "text-blue-700" : "text-blue-600"}
                            />
                            PV Products
                          </span>
                          {eveningCustomerType === "PVH" ? (
                            <span className="text-[11px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                              <CheckCircle2 size={13} /> Selected
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">Click to select</span>
                          )}
                        </div>
                        <p
                          className={`text-xs font-bold ${
                            eveningCustomerType === "PVH" ? "text-blue-800" : "text-blue-700"
                          }`}
                        >
                          {customerTargets.PVH.normal} ctns/hr{" "}
                          <span className="text-[11px] font-normal opacity-90">
                            (Break: {customerTargets.PVH.breakfast}, Tea: {customerTargets.PVH.tea})
                          </span>
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEveningCustomerType("OTHER")}
                        className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                          eveningCustomerType === "OTHER"
                            ? "border-violet-600 bg-violet-100/90 shadow-md ring-2 ring-violet-500/25 text-violet-950 scale-[1.01]"
                            : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className={`font-black text-xs flex items-center gap-1.5 ${
                              eveningCustomerType === "OTHER" ? "text-violet-950" : "text-slate-800"
                            }`}
                          >
                            <Users
                              size={14}
                              className={eveningCustomerType === "OTHER" ? "text-violet-700" : "text-violet-600"}
                            />
                            Other Customers
                          </span>
                          {eveningCustomerType === "OTHER" ? (
                            <span className="text-[11px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                              <CheckCircle2 size={13} /> Selected
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">Click to select</span>
                          )}
                        </div>
                        <p
                          className={`text-xs font-bold ${
                            eveningCustomerType === "OTHER" ? "text-violet-800" : "text-violet-700"
                          }`}
                        >
                          {customerTargets.OTHER.normal} ctns/hr{" "}
                          <span className="text-[11px] font-normal opacity-90">
                            (Break: {customerTargets.OTHER.breakfast}, Tea: {customerTargets.OTHER.tea})
                          </span>
                        </p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Confirm & Access Button */}
                <button
                  type="button"
                  onClick={handleUnlockAndAccess}
                  disabled={isOpeningTable || !morningCustomerType || !eveningCustomerType}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isOpeningTable ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                      <span className="tracking-wide">Shift table creation loading...!</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {!morningCustomerType || !eveningCustomerType
                          ? "Select Customer Type for Both Shifts to Proceed"
                          : `Confirm & Open MD Line ${selectedMdLine} Shift Table`}
                      </span>
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

                {/* Informative Loading Banner */}
                {isOpeningTable && (
                  <div className="mt-3 p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-center gap-2.5 text-blue-700 text-xs font-semibold animate-pulse shadow-xs">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Shift table creation loading...! Initializing MD Line {selectedMdLine} channels...</span>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-center text-xs text-slate-500 font-medium">
                {uncreatedLines.length > 0
                  ? "Select an available line above to configure customer types, or click any created line to open its shift table immediately."
                  : "All 3 MD lines are created. Click any created line above to open its shift table immediately."}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── STEP 3: Active Production Table View (Unlocked after selections) ─── */}
      {!loading && exists && workDay && isAccessUnlocked && selectedMdLine && (
        <>
          {/* Active Configuration & Choose MD Line Strip */}
          <div className="w-full bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-xs mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-white shadow-xs">
                <Monitor size={14} />
                MD Line - {selectedMdLine}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  isMorningMixed
                    ? "bg-amber-50 text-amber-900 border border-amber-300"
                    : activeMorningCustomer === "PVH"
                    ? "bg-blue-50 text-blue-800 border border-blue-200"
                    : "bg-violet-50 text-violet-800 border border-violet-200"
                }`}
              >
                <Sunrise size={13} className={isMorningMixed ? "text-amber-600" : activeMorningCustomer === "PVH" ? "text-blue-600" : "text-violet-600"} />
                <span>Morning: {morningCustomerLabel}</span>
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  isEveningMixed
                    ? "bg-amber-50 text-amber-900 border border-amber-300"
                    : activeEveningCustomer === "PVH"
                    ? "bg-blue-50 text-blue-800 border border-blue-200"
                    : "bg-violet-50 text-violet-800 border border-violet-200"
                }`}
              >
                <Moon size={13} className={isEveningMixed ? "text-amber-600" : activeEveningCustomer === "PVH" ? "text-blue-600" : "text-violet-600"} />
                <span>Evening: {eveningCustomerLabel}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Choose MD Line — dropdown of created lines or gate fallback */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    const createdLines = workDay.createdLines || [];
                    if (createdLines.length > 0) {
                      setLineDropdownOpen(!lineDropdownOpen);
                    } else {
                      setIsAccessUnlocked(false);
                      setMorningCustomerType(null);
                      setEveningCustomerType(null);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <SlidersHorizontal size={13} className="text-slate-500" />
                  <span>Choose MD Line</span>
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${lineDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Backdrop to close dropdown on click outside */}
                {lineDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setLineDropdownOpen(false)}
                  />
                )}

                {/* Dropdown */}
                {lineDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1">
                    {(workDay.createdLines || []).sort((a: number, b: number) => a - b).map((line: number) => (
                      <button
                        key={line}
                        type="button"
                        onClick={() => handleQuickSwitchLine(line as MdLineNumber)}
                        className={`w-full px-3.5 py-2.5 text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                          selectedMdLine === line
                            ? "bg-blue-50 text-blue-800"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Monitor size={14} className={selectedMdLine === line ? "text-blue-600" : "text-slate-400"} />
                          <span>MD Line - {line}</span>
                        </div>
                        {selectedMdLine === line && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Active</span>
                        )}
                      </button>
                    ))}

                    {/* Separator + link to full gate for new lines */}
                    {(workDay.createdLines || []).length < 3 && (
                      <>
                        <div className="border-t border-slate-100 my-1" />
                        <button
                          type="button"
                          onClick={() => {
                            setLineDropdownOpen(false);
                            setIsCreatingNewLine(true);
                            setIsAccessUnlocked(false);
                            setSelectedMdLine(null);
                            setMorningCustomerType(null);
                            setEveningCustomerType(null);
                            setShiftFilter("MORNING");
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-blue-700 hover:bg-blue-50 flex items-center gap-2 transition-all cursor-pointer"
                        >
                          <PlusCircle size={14} className="text-blue-500" />
                          <span>Create New Line...</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Shift Filter Tabs: Morning & Evening ONLY (No All Slots) ──── */}
          <div className="w-full bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200/90 shadow-md mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="grid grid-cols-2 gap-1.5 p-1 sm:p-1.5 bg-slate-100/95 rounded-xl border border-slate-200/80 shadow-inner w-full md:w-auto md:flex md:items-center">
              <button
                type="button"
                onClick={() => setShiftFilter("MORNING")}
                className={`w-full md:w-auto py-2.5 px-4 sm:px-6 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all min-h-[42px] cursor-pointer ${
                  shiftFilter === "MORNING"
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <Sunrise size={16} className="shrink-0" />
                <span>
                  Morning Shift (8 Slots)
                  {workDay.morningTeam && (
                    <span className="hidden sm:inline font-normal opacity-90"> • Shift {workDay.morningTeam}</span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShiftFilter("EVENING")}
                className={`w-full md:w-auto py-2.5 px-4 sm:px-6 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all min-h-[42px] cursor-pointer ${
                  shiftFilter === "EVENING"
                    ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <Moon size={16} className="shrink-0" />
                <span>
                  Evening Shift (8 Slots)
                  {workDay.eveningTeam && (
                    <span className="hidden sm:inline font-normal opacity-90"> • Shift {workDay.eveningTeam}</span>
                  )}
                </span>
              </button>
            </div>

            {/* Active Shift Timing Badge */}
            <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
              <span
                className={`font-semibold px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 shadow-xs ${
                  shiftFilter === "MORNING"
                    ? "bg-amber-100 text-amber-900 border border-amber-300/80"
                    : "bg-indigo-100 text-indigo-900 border border-indigo-300/80"
                }`}
              >
                {shiftFilter === "MORNING" ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>05:30 AM – 01:30 PM (Morning Slots 1–8)</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span>01:30 PM – 09:30 PM (Evening Slots 9–16)</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* ─── Shift Production Output Table ─────────────────────────── */}
          {shiftFilter === "MORNING" && (
            <DailyOutputTable
              entries={calculatedSlots}
              shift="MORNING"
              shiftLabel={`Morning Shift (05:30 AM – 01:30 PM) — MD Line ${selectedMdLine}`}
              dayStatus={workDay.status}
              workDate={selectedDate}
              team={workDay.morningTeam ?? null}
              counterpartTeam={workDay.eveningTeam ?? null}
              onAssignTeam={handleAssignTeam}
              onSave={handleSave}
              canEdit={true}
              userRole={session?.user?.role}
              showOverrideBadge={showOverrideBadge}
              enforce30MinLock={enforce30MinLock}
              mdLine={selectedMdLine}
              customerType={activeMorningCustomer}
              onChangeCustomerType={handleShiftCustomerTypeChange}
              customerTargets={customerTargets}
              onSlotCustomerChange={handleSlotCustomerChange}
            />
          )}

          {shiftFilter === "EVENING" && (
            <DailyOutputTable
              entries={calculatedSlots}
              shift="EVENING"
              shiftLabel={`Evening Shift (01:30 PM – 09:30 PM) — MD Line ${selectedMdLine}`}
              dayStatus={workDay.status}
              workDate={selectedDate}
              team={workDay.eveningTeam ?? null}
              counterpartTeam={workDay.morningTeam ?? null}
              onAssignTeam={handleAssignTeam}
              onSave={handleSave}
              canEdit={true}
              userRole={session?.user?.role}
              showOverrideBadge={showOverrideBadge}
              enforce30MinLock={enforce30MinLock}
              mdLine={selectedMdLine}
              customerType={activeEveningCustomer}
              onChangeCustomerType={handleShiftCustomerTypeChange}
              customerTargets={customerTargets}
              onSlotCustomerChange={handleSlotCustomerChange}
            />
          )}

          {/* ─── Bottom Shift Summary Cards (Restored) ────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {/* Morning Shift Summary Card */}
            <div
              onClick={() => setShiftFilter("MORNING")}
              className={`bg-gradient-to-br from-amber-50 to-orange-50/60 rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer ${
                shiftFilter === "MORNING"
                  ? "border-amber-400 ring-2 ring-amber-400/30 shadow-sm"
                  : "border-amber-200/80 shadow-xs hover:border-amber-300"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-700">
                    <Sunrise size={18} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs border ${
                        isMorningMixed
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : activeMorningCustomer === "PVH"
                          ? "bg-white text-slate-700 border-slate-200"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}>
                        {morningCustomerLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-700">05:30 AM – 01:30 PM (8 Slots) • MD Line {selectedMdLine}</p>
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
                    {morningTotal}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-amber-700 uppercase">Target Total</p>
                  <p className="text-xl sm:text-2xl font-black text-amber-900">
                    {morningTarget}
                  </p>
                </div>
              </div>
            </div>

            {/* Evening Shift Summary Card */}
            <div
              onClick={() => setShiftFilter("EVENING")}
              className={`bg-gradient-to-br from-indigo-50 to-purple-50/60 rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer ${
                shiftFilter === "EVENING"
                  ? "border-indigo-400 ring-2 ring-indigo-400/30 shadow-sm"
                  : "border-indigo-200/80 shadow-xs hover:border-indigo-300"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-700">
                    <Moon size={18} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs border ${
                        isEveningMixed
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : activeEveningCustomer === "PVH"
                          ? "bg-white text-slate-700 border-slate-200"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}>
                        {eveningCustomerLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-700">01:30 PM – 09:30 PM (8 Slots) • MD Line {selectedMdLine}</p>
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
                    {eveningTotal}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-indigo-700 uppercase">Target Total</p>
                  <p className="text-xl sm:text-2xl font-black text-indigo-900">
                    {eveningTarget}
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
