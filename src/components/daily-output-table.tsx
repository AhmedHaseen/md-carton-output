"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Check,
  X,
  AlertTriangle,
  Clock,
  Coffee,
  Utensils,
  Plus,
  Edit3,
  Users,
  Settings,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatTimeRange } from "@/lib/calculations";
import type { SlotWithCalculations } from "@/lib/calculations";

interface DailyOutputTableProps {
  entries: SlotWithCalculations[];
  shift: "MORNING" | "EVENING";
  shiftLabel: string;
  dayStatus: "OPEN" | "CLOSED";
  team?: string | null;
  counterpartTeam?: string | null;
  onAssignTeam?: (shift: "MORNING" | "EVENING", team: "A" | "B") => Promise<void>;
  onSave: (entryId: string, actualCartons: number | null) => Promise<void>;
  canEdit: boolean;
  userRole?: string;
  showOverrideBadge?: boolean;
}

function getStatusBadge(status: SlotWithCalculations["status"]) {
  switch (status) {
    case "PENDING":
      return <span className="badge badge-pending">Pending</span>;
    case "ON_TARGET":
      return <span className="badge badge-on-target">On Target</span>;
    case "ABOVE_TARGET":
      return <span className="badge badge-above-target">Above Target</span>;
    case "BELOW_TARGET":
      return <span className="badge badge-below-target">Below Target</span>;
  }
}

function formatVariance(variance: number | null): React.ReactNode {
  if (variance === null) return <span className="text-slate-300 font-medium">—</span>;
  const sign = variance > 0 ? "+" : "";
  const color =
    variance > 0
      ? "text-emerald-600 font-bold"
      : variance < 0
      ? "text-red-600 font-bold"
      : "text-slate-600 font-semibold";
  return <span className={color}>{sign}{variance}</span>;
}

function getBreakInfo(sequenceNo: number) {
  if (sequenceNo === 3) {
    return { label: "Breakfast Break", icon: Utensils, target: 80 };
  }
  if (sequenceNo === 7) {
    return { label: "Morning Tea", icon: Coffee, target: 90 };
  }
  if (sequenceNo === 11) {
    return { label: "Evening Tea", icon: Coffee, target: 90 };
  }
  if (sequenceNo === 15) {
    return { label: "Dinner Break", icon: Utensils, target: 80 };
  }
  return null;
}

export default function DailyOutputTable({
  entries,
  shift,
  shiftLabel,
  dayStatus,
  team,
  counterpartTeam,
  onAssignTeam,
  onSave,
  canEdit,
  userRole,
  showOverrideBadge = true,
}: DailyOutputTableProps) {
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shift Name manual typing state
  const [teamInput, setTeamInput] = useState<string>(team ? `Shift ${team}` : "");
  const [isEditingTeam, setIsEditingTeam] = useState<boolean>(!team);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [isSubmittingTeam, setIsSubmittingTeam] = useState<boolean>(false);

  // Sync teamInput when team prop changes (e.g. reciprocal assignment from counterpart)
  useEffect(() => {
    if (team) {
      setTeamInput(`Shift ${team}`);
      setIsEditingTeam(false);
      setTeamError(null);
    } else {
      setTeamInput("");
      setIsEditingTeam(true);
    }
  }, [team]);

  const parseTeamName = (val: string): "A" | "B" | null => {
    const clean = val.trim().toUpperCase();
    if (clean === "A" || clean === "SHIFT A" || clean === "TEAM A" || clean === "A SHIFT") return "A";
    if (clean === "B" || clean === "SHIFT B" || clean === "TEAM B" || clean === "B SHIFT") return "B";
    if (clean.endsWith(" A") || clean.endsWith("-A")) return "A";
    if (clean.endsWith(" B") || clean.endsWith("-B")) return "B";
    if (clean.includes("A") && !clean.includes("B")) return "A";
    if (clean.includes("B") && !clean.includes("A")) return "B";
    return null;
  };

  const handleTeamSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTeamError(null);
    const parsed = parseTeamName(teamInput);
    if (!parsed) {
      setTeamError("Please enter Shift Name as 'A' or 'B' (e.g. Shift A or Shift B)");
      return;
    }
    if (parsed === team) {
      setIsEditingTeam(false);
      return;
    }
    setIsSubmittingTeam(true);
    try {
      if (onAssignTeam) {
        await onAssignTeam(shift, parsed);
      }
      setIsEditingTeam(false);
    } catch {
      setTeamError("Failed to update shift team");
    } finally {
      setIsSubmittingTeam(false);
    }
  };

  const shiftEntries = entries.filter((e) => e.shift === shift);
  const isOpen = dayStatus === "OPEN";

  const handleEdit = useCallback(
    (entry: SlotWithCalculations) => {
      if (!team) {
        toast.error("Please enter and set Shift Name (Shift A or Shift B) first to log output");
        return;
      }
      setEditingId(entry.id);
      setEditValue(entry.actualCartons?.toString() ?? "");
      setError(null);
    },
    [team]
  );

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditValue("");
    setError(null);
  }, []);

  const handleSave = useCallback(
    async (entryId: string) => {
      setError(null);

      // Allow empty = set to null (pending)
      if (editValue.trim() === "") {
        setSaving(entryId);
        await onSave(entryId, null);
        setSaving(null);
        setEditingId(null);
        return;
      }

      const num = parseInt(editValue.trim(), 10);
      if (isNaN(num) || num < 0) {
        setError("Must be 0 or greater");
        return;
      }

      setSaving(entryId);
      try {
        await onSave(entryId, num);
        setEditingId(null);
      } catch {
        setError("Failed to save");
      } finally {
        setSaving(null);
      }
    },
    [editValue, onSave]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, entryId: string) => {
      if (e.key === "Enter") {
        handleSave(entryId);
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  // Calculate shift subtotals
  const completedEntries = shiftEntries.filter((e) => e.actualCartons !== null);
  const shiftActual = completedEntries.reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
  const shiftTarget = shiftEntries.reduce((sum, e) => sum + e.targetCartons, 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden mb-6">
      {/* ─── Shift Header ────────────────────────────────────────────── */}
      <div
        className={`px-4 sm:px-6 py-3.5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          shift === "MORNING"
            ? "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-l-4 border-l-amber-500"
            : "bg-gradient-to-r from-indigo-500/10 via-indigo-500/5 to-transparent border-l-4 border-l-indigo-500"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-3.5 h-3.5 rounded-full shadow-sm shrink-0 ${
              shift === "MORNING" ? "bg-amber-500" : "bg-indigo-500"
            }`}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base leading-tight">
                {shiftLabel}
              </h3>
              {team ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black shadow-xs ${
                      team === "A"
                        ? "bg-blue-600 text-white"
                        : "bg-indigo-600 text-white"
                    }`}
                  >
                    <Users size={12} />
                    Shift {team}
                  </span>
                  {isAdminOrManager && canEdit && isOpen && onAssignTeam ? (
                    <>
                      {isEditingTeam ? (
                        <form onSubmit={handleTeamSubmit} className="inline-flex items-center gap-1 ml-1">
                          <input
                            type="text"
                            value={teamInput}
                            onChange={(e) => {
                              setTeamInput(e.target.value);
                              setTeamError(null);
                            }}
                            placeholder="Type A or B"
                            className="w-28 sm:w-32 px-2 py-0.5 text-xs font-bold border border-blue-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            autoFocus
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingTeam}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingTeam(false);
                              setTeamInput(team ? `Shift ${team}` : "");
                              setTeamError(null);
                            }}
                            className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            ✕
                          </button>
                        </form>
                      ) : (
                        <div className="inline-flex items-center gap-2 ml-1">
                          <button
                            type="button"
                            onClick={() => setIsEditingTeam(true)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
                            title="Quick change shift team"
                          >
                            <Edit3 size={11} />
                            <span>Change Shift</span>
                          </button>
                          <Link
                            href="/admin?tab=shifts"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                            title="Manage weekly rotation schedule in Admin"
                          >
                            <Settings size={11} />
                            <span>Shift Settings</span>
                          </Link>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-semibold ml-1">
                      (Weekly Scheduled Duty)
                    </span>
                  )}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                  Shift Name Required
                </span>
              )}
            </div>
            {teamError && isEditingTeam && (
              <p className="text-red-600 font-bold text-xs mt-1">⚠️ {teamError}</p>
            )}
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {completedEntries.length} of {shiftEntries.length} slots completed
            </p>
          </div>
        </div>

        {/* Subtotal metrics badge */}
        <div className="flex items-center justify-between sm:justify-start gap-2 px-3.5 py-1.5 rounded-xl bg-white/90 border border-slate-200/90 shadow-xs text-xs font-semibold w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Total Cartons:</span>
            <span className="text-slate-800 font-bold text-sm">{shiftActual}</span>
          </div>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Target:</span>
            <span className="text-slate-700">{shiftTarget}</span>
          </div>
        </div>
      </div>

      {/* ─── Team Assignment Prompt if Unassigned ───────────────────────── */}
      {!team && isOpen && (
        isAdminOrManager && onAssignTeam ? (
          <div className="mx-3 sm:mx-6 my-3.5 p-4 bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-indigo-50/90 border-2 border-dashed border-blue-400 rounded-2xl shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center text-blue-700 shrink-0 mt-0.5">
                  <Users size={20} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                    Enter Shift Name for {shift === "MORNING" ? "Morning Shift" : "Evening Shift"}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                    Type the shift name (e.g. <strong>Shift A</strong> or <strong>Shift B</strong>). Entering this will automatically assign {shift === "MORNING" ? "Evening Shift" : "Morning Shift"} to the other team.
                  </p>
                </div>
              </div>

              {/* Manual Text Input Field */}
              <form onSubmit={handleTeamSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 sm:w-60">
                  <input
                    type="text"
                    value={teamInput}
                    onChange={(e) => {
                      setTeamInput(e.target.value);
                      setTeamError(null);
                    }}
                    placeholder="Enter Shift Name (e.g. A or B)"
                    className="w-full px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-xs"
                  />
                  {teamInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setTeamInput("");
                        setTeamError(null);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingTeam || !teamInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
                >
                  {isSubmittingTeam ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Setting...</span>
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      <span>Set Shift Name</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Helper buttons & error */}
            <div className="mt-2.5 pt-2.5 border-t border-blue-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-500">
                <span>Quick fill:</span>
                <button
                  type="button"
                  onClick={() => {
                    setTeamInput("Shift A");
                    setTeamError(null);
                  }}
                  className="px-2 py-0.5 bg-white hover:bg-blue-50 border border-slate-200 rounded-md font-bold text-blue-700 cursor-pointer text-[11px]"
                >
                  Shift A
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTeamInput("Shift B");
                    setTeamError(null);
                  }}
                  className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-md font-bold text-indigo-700 cursor-pointer text-[11px]"
                >
                  Shift B
                </button>
              </div>
              {teamError && (
                <p className="text-red-600 font-bold text-[11px] animate-pulse">
                  ⚠️ {teamError}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-3 sm:mx-6 my-3.5 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-center justify-between">
            <span>Shift team not assigned yet for this date. Please contact an Admin or Manager to configure shift duties.</span>
          </div>
        )
      )}

      {/* ─── MOBILE CARDS VIEW (< 640px) ─────────────────────────────── */}
      <div className="block sm:hidden p-3 space-y-3 bg-slate-50/50">
        {shiftEntries.map((entry) => {
          const isEditing = editingId === entry.id;
          const isSaving = saving === entry.id;
          const breakInfo = getBreakInfo(entry.sequenceNo);

          return (
            <div
              key={entry.id}
              className={`bg-white rounded-xl p-3.5 border transition-all shadow-xs ${
                isEditing
                  ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md"
                  : "border-slate-200/90 hover:border-slate-300"
              }`}
            >
              {/* Card Header: Slot Sequence, Time & Status */}
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-mono text-xs flex items-center justify-center font-bold">
                    {entry.sequenceNo}
                  </span>
                  <span className="font-bold text-slate-800 text-sm">
                    {formatTimeRange(entry.startTime, entry.endTime)}
                  </span>
                </div>
                <div>{getStatusBadge(entry.status)}</div>
              </div>

              {/* Break Alert if any */}
              {breakInfo && (
                <div className="mb-2 px-2.5 py-1 bg-amber-50 border border-amber-200/60 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <breakInfo.icon size={13} className="shrink-0 text-amber-600" />
                  <span>{breakInfo.label} (Target: {breakInfo.target})</span>
                </div>
              )}

              {/* Card Body: Target & Actual Count Action */}
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Target
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-slate-700">
                      {entry.targetCartons}
                    </span>
                    {showOverrideBadge && entry.targetSource === "OVERRIDE" && (
                      <span className="badge badge-override text-[10px] py-0 px-1.5">
                        Override
                      </span>
                    )}
                  </div>
                </div>

                {/* Actual Count / Input Action */}
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                    Actual Count
                  </span>
                  {isEditing ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          className="carton-input w-24 h-10 font-black text-base text-slate-900 border-2 border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, entry.id)}
                          placeholder="0"
                          autoFocus
                          disabled={isSaving}
                        />
                        <button
                          onClick={() => handleSave(entry.id)}
                          disabled={isSaving}
                          className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 active:scale-95 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                          title="Save"
                        >
                          {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check size={18} />
                          )}
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={isSaving}
                          className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-300 active:scale-95 transition-all cursor-pointer"
                          title="Cancel"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {error && (
                        <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {error}
                        </span>
                      )}
                    </div>
                  ) : entry.actualCartons === null ? (
                    canEdit && isOpen ? (
                      <button
                        onClick={() => handleEdit(entry)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/25 min-h-[40px] cursor-pointer"
                      >
                        <Plus size={16} />
                        <span>Add Output</span>
                      </button>
                    ) : (
                      <span className="text-slate-300 font-medium text-base">—</span>
                    )
                  ) : (
                    <div className="inline-flex items-center gap-2">
                      <span className="font-extrabold text-xl text-slate-900">
                        {entry.actualCartons}
                      </span>
                      {canEdit && isOpen && (
                        <button
                          onClick={() => handleEdit(entry)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="Edit actual count"
                        >
                          <Edit3 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer: Variance & Shift Cumulative Pills */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs bg-slate-50/80 -mx-3.5 -mb-3.5 px-3.5 py-2 rounded-b-xl">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Variance:</span>
                  <span>{formatVariance(entry.variance)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Shift Cum:</span>
                  <span className="font-bold text-slate-800">
                    {entry.cumulativeActual ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── DESKTOP/TABLET DATA TABLE (>= 640px) ────────────────────── */}
      <div className="hidden sm:block overflow-x-auto touch-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-52">Time Slot</th>
              <th className="w-24 text-center">Target</th>
              <th className="w-44 text-center">Actual Count</th>
              <th className="w-24 text-center">Variance</th>
              <th className="w-28 text-center" title="Cumulative for this shift">
                Shift Cum.
              </th>
              <th className="w-32 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {shiftEntries.map((entry) => {
              const isEditing = editingId === entry.id;
              const isSaving = saving === entry.id;
              const breakInfo = getBreakInfo(entry.sequenceNo);

              return (
                <tr
                  key={entry.id}
                  className={`transition-colors duration-150 ${
                    isEditing ? "bg-blue-50/70" : ""
                  }`}
                >
                  {/* Time Slot */}
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 font-mono text-[11px] flex items-center justify-center font-bold">
                        {entry.sequenceNo}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">
                          {formatTimeRange(entry.startTime, entry.endTime)}
                        </div>
                        {breakInfo && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                            <breakInfo.icon size={11} />
                            {breakInfo.label} ({breakInfo.target})
                          </span>
                        )}
                      </div>
                      {showOverrideBadge && entry.targetSource === "OVERRIDE" && (
                        <span className="ml-auto badge badge-override text-[10px]">
                          Override
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Target */}
                  <td className="text-center">
                    <span
                      className={`font-bold ${
                        entry.targetCartons !== 120
                          ? "text-amber-600"
                          : "text-slate-700"
                      }`}
                    >
                      {entry.targetCartons}
                    </span>
                  </td>

                  {/* ─── Actual Count Column with "Add" Button / Inline Input ─── */}
                  <td className="text-center">
                    {isEditing ? (
                      <div className="flex flex-col items-center gap-1 py-1">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            className="carton-input w-24 font-bold text-slate-900 border-2 border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, entry.id)}
                            placeholder="0"
                            autoFocus
                            disabled={isSaving}
                          />
                          <button
                            onClick={() => handleSave(entry.id)}
                            disabled={isSaving}
                            className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                            title="Save"
                          >
                            {isSaving ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Check size={16} />
                            )}
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={isSaving}
                            className="p-1.5 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 active:scale-95 transition-all"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        {error && (
                          <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {error}
                          </span>
                        )}
                      </div>
                    ) : entry.actualCartons === null ? (
                      /* If no actual count: prominent Add button */
                      canEdit && isOpen ? (
                        <button
                          onClick={() => handleEdit(entry)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-600/20 cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>Add</span>
                        </button>
                      ) : (
                        <span className="text-slate-300 font-medium">—</span>
                      )
                    ) : (
                      /* If actual count exists: show number with quick edit button */
                      <div className="inline-flex items-center justify-center gap-2">
                        <span className="font-extrabold text-base text-slate-800">
                          {entry.actualCartons}
                        </span>
                        {canEdit && isOpen && (
                          <button
                            onClick={() => handleEdit(entry)}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit actual count"
                          >
                            <Edit3 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Variance */}
                  <td className="text-center">
                    {formatVariance(entry.variance)}
                  </td>

                  {/* Shift Cumulative */}
                  <td className="text-center">
                    <span className="font-bold text-slate-800">
                      {entry.cumulativeActual ?? "—"}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="text-center">{getStatusBadge(entry.status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
