"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import {
  Target,
  Sliders,
  Lock,
  Users,
  Save,
  RotateCcw,
  Info,
  Sparkles,
  Layers,
} from "lucide-react";
import {
  CustomerTypeKey,
  MD_LINES,
  CustomerTargetConfig,
  LineCustomerTargetConfig,
  DEFAULT_CUSTOMER_TARGETS,
} from "@/lib/target-config";

type ScopeType = "ALL" | 1 | 2 | 3;

function TargetSettingsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Settings: Badge Display & 30-min lock
  const [showOverrideBadge, setShowOverrideBadge] = useState<boolean>(true);
  const [enforce30MinLock, setEnforce30MinLock] = useState<boolean>(true);
  const [updatingSetting, setUpdatingSetting] = useState<boolean>(false);
  const [updatingLockSetting, setUpdatingLockSetting] = useState<boolean>(false);

  // Global customer targets (PVH & OTHER)
  const [globalTargets, setGlobalTargets] = useState<CustomerTargetConfig>({
    ...DEFAULT_CUSTOMER_TARGETS,
  });

  // Optional line-specific customer target overrides: { "1": { PVH: {...}, OTHER: {...} }, ... }
  const [lineOverrides, setLineOverrides] = useState<LineCustomerTargetConfig>({
    "1": {},
    "2": {},
    "3": {},
  });

  // Selected Scope tab: "ALL" | 1 | 2 | 3
  const [selectedScope, setSelectedScope] = useState<ScopeType>("ALL");

  const [applyToOpenDays, setApplyToOpenDays] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Check auth
  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role !== "ADMIN" && role !== "MANAGER") {
        toast.error("Access restricted: Admin or Manager role required.");
        router.replace("/");
      }
    }
  }, [session, status, router]);

  // Load existing configurations from system settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/targets");
      const data = await res.json();

      if (data?.settings) {
        if (typeof data.settings.showOverrideBadge === "boolean") {
          setShowOverrideBadge(data.settings.showOverrideBadge);
        }
        if (typeof data.settings.enforce30MinLock === "boolean") {
          setEnforce30MinLock(data.settings.enforce30MinLock);
        }
      }

      if (data?.customerTargets) {
        setGlobalTargets(data.customerTargets);
      } else if (data?.lineTargetConfigs) {
        setGlobalTargets({
          PVH: {
            normal: data.lineTargetConfigs["1"]?.normal ?? 60,
            breakfast: data.lineTargetConfigs["1"]?.breakfast ?? 40,
            tea: data.lineTargetConfigs["1"]?.tea ?? 45,
          },
          OTHER: {
            normal: data.lineTargetConfigs["3"]?.normal ?? 40,
            breakfast: data.lineTargetConfigs["3"]?.breakfast ?? 24,
            tea: data.lineTargetConfigs["3"]?.tea ?? 32,
          },
        });
      }

      if (data?.lineCustomerTargets && typeof data.lineCustomerTargets === "object") {
        const sanitized: LineCustomerTargetConfig = {};
        for (const [lineKey, lineVal] of Object.entries(data.lineCustomerTargets)) {
          if (lineVal && typeof lineVal === "object") {
            const typedVal = lineVal as any;
            if (typedVal.PVH || typedVal.OTHER) {
              sanitized[lineKey] = {
                PVH: typedVal.PVH,
                OTHER: typedVal.OTHER,
              };
            }
          }
        }
        setLineOverrides(sanitized);
      }
    } catch {
      toast.error("Failed to load customer target settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Toggle Override Badge Setting
  const handleToggleOverrideBadge = async (newValue: boolean) => {
    setUpdatingSetting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_SETTING",
          key: "SHOW_OVERRIDE_BADGE",
          value: String(newValue),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowOverrideBadge(newValue);
        toast.success(
          newValue
            ? "Target Override badges are now visible in Daily Input"
            : "Target Override badges are now hidden in Daily Input"
        );
      } else {
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      toast.error("Network error updating setting");
    } finally {
      setUpdatingSetting(false);
    }
  };

  // Toggle 30-Min Lock Setting
  const handleToggleLockSetting = async (newValue: boolean) => {
    setUpdatingLockSetting(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_SETTING",
          key: "ENFORCE_30MIN_LOCK",
          value: String(newValue),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEnforce30MinLock(newValue);
        toast.success(
          newValue
            ? "30-Minute Entry Lock is now ENFORCED"
            : "30-Minute Entry Lock is now DISABLED"
        );
      } else {
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      toast.error("Network error updating setting");
    } finally {
      setUpdatingLockSetting(false);
    }
  };

  // Helper to read the target for a customer type in the current selected scope
  const getCustomerTarget = (customer: CustomerTypeKey) => {
    if (selectedScope === "ALL") {
      return globalTargets[customer] || DEFAULT_CUSTOMER_TARGETS[customer];
    }
    const lineStr = String(selectedScope);
    const lineOverride = lineOverrides[lineStr]?.[customer];
    return lineOverride || globalTargets[customer] || DEFAULT_CUSTOMER_TARGETS[customer];
  };

  const isScopeOverridden = (customer: CustomerTypeKey) => {
    if (selectedScope === "ALL") return false;
    const lineStr = String(selectedScope);
    return Boolean(lineOverrides[lineStr]?.[customer]);
  };

  // Edit specific target value for a customer type in the current scope
  const handleTargetChange = (
    customer: CustomerTypeKey,
    field: "normal" | "breakfast" | "tea",
    value: string
  ) => {
    const num = Math.max(0, parseInt(value, 10) || 0);

    if (selectedScope === "ALL") {
      setGlobalTargets((prev) => {
        const current = prev[customer] || DEFAULT_CUSTOMER_TARGETS[customer];
        const updated = { ...current, [field]: num };

        // Proportional break calculation if normal production hour changed
        if (field === "normal" && num > 0) {
          if (customer === "PVH") {
            updated.breakfast = Math.round(num * (40 / 60));
            updated.tea = Math.round(num * (45 / 60));
          } else {
            updated.breakfast = Math.round(num * (24 / 40));
            updated.tea = Math.round(num * (32 / 40));
          }
        }

        return { ...prev, [customer]: updated };
      });
    } else {
      const lineStr = String(selectedScope);
      setLineOverrides((prev) => {
        const current =
          prev[lineStr]?.[customer] ||
          globalTargets[customer] ||
          DEFAULT_CUSTOMER_TARGETS[customer];
        const updated = { ...current, [field]: num };

        if (field === "normal" && num > 0) {
          if (customer === "PVH") {
            updated.breakfast = Math.round(num * (40 / 60));
            updated.tea = Math.round(num * (45 / 60));
          } else {
            updated.breakfast = Math.round(num * (24 / 40));
            updated.tea = Math.round(num * (32 / 40));
          }
        }

        return {
          ...prev,
          [lineStr]: {
            ...prev[lineStr],
            [customer]: updated,
          },
        };
      });
    }
  };

  // Reset target to standard baseline preset
  const handleResetToBaseline = (customer: CustomerTypeKey) => {
    const baseline = DEFAULT_CUSTOMER_TARGETS[customer];
    if (selectedScope === "ALL") {
      setGlobalTargets((prev) => ({
        ...prev,
        [customer]: { ...baseline },
      }));
      toast.success(
        `${customer === "PVH" ? "PV Products" : "Other Customers"} reset to standard baseline`
      );
    } else {
      const lineStr = String(selectedScope);
      setLineOverrides((prev) => {
        const lineObj = { ...(prev[lineStr] || {}) };
        delete lineObj[customer];
        return {
          ...prev,
          [lineStr]: lineObj,
        };
      });
      toast.success(
        `MD Line ${selectedScope} ${customer === "PVH" ? "PV" : "Other"} reset to standard targets`
      );
    }
  };

  // Save Target Settings
  const handleSaveTargets = async () => {
    setSaving(true);
    const loadingToast = toast.loading("Saving customer target configurations...");

    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CUSTOMER_TARGETS",
          customerTargets: globalTargets,
          lineCustomerTargets: lineOverrides,
          applyToOpenDays,
        }),
      });

      const data = await res.json();
      toast.dismiss(loadingToast);

      if (res.ok && data.success) {
        toast.success(
          data.message || "Customer target settings saved successfully!"
        );
      } else {
        toast.error(data.error || "Failed to save target settings");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Network error while saving target settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ───────────────────────────────────────────────────────────────── */}
      {/* PAGE HEADER                                                       */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          <Target className="text-blue-600" size={28} />
          <span>Target Settings</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Configure production targets for each customer type (PV Products and Other Customers)
        </p>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* SYSTEM PREFERENCES (Consolidated)                                */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Override Badge Display Switch */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Sliders size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-sm">
                  Daily Input &quot;Override&quot; Tag
                </h3>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    showOverrideBadge
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {showOverrideBadge ? "VISIBLE" : "HIDDEN"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Display amber Override tag on operator input page
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={showOverrideBadge}
            disabled={updatingSetting || loading}
            onClick={() => handleToggleOverrideBadge(!showOverrideBadge)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
              showOverrideBadge ? "bg-blue-600" : "bg-slate-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                showOverrideBadge ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* 30-Min Lock Window Switch */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-sm">
                  30-Min Output Entry Lock Window
                </h3>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    enforce30MinLock
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {enforce30MinLock ? "ENFORCED" : "DISABLED"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Lock entries after 30 mins; Admins retain full override access
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enforce30MinLock}
            disabled={updatingLockSetting || loading}
            onClick={() => handleToggleLockSetting(!enforce30MinLock)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
              enforce30MinLock ? "bg-blue-600" : "bg-slate-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                enforce30MinLock ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* MAIN TARGET SETTINGS CONSOLE: By Customer Type                   */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-5 sm:p-7">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
          <div>
            <h2 className="font-extrabold text-slate-900 text-lg sm:text-xl flex items-center gap-2.5">
              <Sparkles size={22} className="text-blue-600" />
              <span>Target Settings by Customer Type</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Set hourly, break, and tea targets for each customer type (PV Products and Other Customers)
            </p>
          </div>

          {/* Scope Selector Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex max-w-full overflow-x-auto touch-scroll p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-xs">
              <button
                type="button"
                onClick={() => setSelectedScope("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  selectedScope === "ALL"
                    ? "bg-white text-blue-700 shadow-sm font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers size={13} />
                <span>All Lines (Standard)</span>
              </button>

              {MD_LINES.map((line) => {
                const isSelected = selectedScope === line;
                const hasCustom =
                  Boolean(lineOverrides[String(line)]?.PVH) ||
                  Boolean(lineOverrides[String(line)]?.OTHER);
                return (
                  <button
                    key={`scope-tab-${line}`}
                    type="button"
                    onClick={() => setSelectedScope(line)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      isSelected
                        ? "bg-white text-blue-700 shadow-sm font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>MD Line - {line}</span>
                    {hasCustom && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto ml-auto">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToOpenDays}
                  onChange={(e) => setApplyToOpenDays(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="hidden sm:inline">Apply to active days</span>
              </label>

              <button
                type="button"
                onClick={handleSaveTargets}
                disabled={saving || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                <span>Save Targets</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scope Context Banner */}
        <div className="mb-6 p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Editing Targets for:</span>
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-extrabold text-[11px]">
              {selectedScope === "ALL"
                ? "Standard (All MD Lines)"
                : `MD Line - ${selectedScope} Specific`}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {selectedScope === "ALL"
              ? "These targets apply to any MD Line running the selected customer type."
              : `Overrides standard targets specifically for MD Line ${selectedScope}.`}
          </span>
        </div>

        {/* 2 Customer Type Cards Grid: PV Products & Other Customers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ─── CARD 1: PV Products ─────────────────────────────────── */}
          {(() => {
            const current = getCustomerTarget("PVH");
            const shiftTotal = current.normal * 6 + current.breakfast + current.tea;
            const dayTotal = shiftTotal * 2;
            const isCustom = isScopeOverridden("PVH");

            return (
              <div className="rounded-2xl border-2 border-blue-200/90 bg-gradient-to-b from-blue-50/40 via-white to-slate-50/30 p-5 sm:p-6 flex flex-col justify-between shadow-sm transition-all">
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                        <Users size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-lg">
                          PV Products
                        </h3>
                        <p className="text-xs text-blue-700 font-semibold">
                          Standard Target: 60 cartons/hour
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCustom && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          Custom
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResetToBaseline("PVH")}
                        title="Reset to baseline 60 / 40 / 45"
                        className="text-[11px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 cursor-pointer transition-colors p-1"
                      >
                        <RotateCcw size={12} />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Editable Inputs */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs mb-5 space-y-3.5">
                    {/* Normal Hour */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          Normal Production Hour:
                        </label>
                        <span className="text-[11px] text-slate-400 font-medium">Standard Slot</span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          value={current.normal}
                          onChange={(e) => handleTargetChange("PVH", "normal", e.target.value)}
                          className="w-full h-10 px-3.5 pr-14 bg-slate-50 border border-slate-300 rounded-lg text-base font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                          ctns/hr
                        </span>
                      </div>
                    </div>

                    {/* Break Slots (Breakfast / Dinner & Tea Break) */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">
                          Breakfast / Dinner Hour:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={current.breakfast}
                            onChange={(e) => handleTargetChange("PVH", "breakfast", e.target.value)}
                            className="w-full h-9 px-3 pr-10 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                          />
                          <span className="absolute right-2.5 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                            ctns
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">
                          Tea Break Hour:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={current.tea}
                            onChange={(e) => handleTargetChange("PVH", "tea", e.target.value)}
                            className="w-full h-9 px-3 pr-10 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                          />
                          <span className="absolute right-2.5 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                            ctns
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Summary: Shift & Day Totals */}
                <div className="pt-3.5 border-t border-blue-200/70 bg-blue-50/50 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 py-3.5 rounded-b-2xl">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Shift Target (8h)
                      </span>
                      <span className="text-base font-black text-slate-800">
                        {shiftTotal} <span className="text-xs font-normal text-slate-500">ctns</span>
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Full Day Target (16h)
                      </span>
                      <span className="text-base font-black text-blue-700">
                        {dayTotal} <span className="text-xs font-normal text-slate-500">ctns</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─── CARD 2: Other Customers ─────────────────────────────── */}
          {(() => {
            const current = getCustomerTarget("OTHER");
            const shiftTotal = current.normal * 6 + current.breakfast + current.tea;
            const dayTotal = shiftTotal * 2;
            const isCustom = isScopeOverridden("OTHER");

            return (
              <div className="rounded-2xl border-2 border-violet-200/90 bg-gradient-to-b from-violet-50/40 via-white to-slate-50/30 p-5 sm:p-6 flex flex-col justify-between shadow-sm transition-all">
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-xs">
                        <Users size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-lg">
                          Other Customers
                        </h3>
                        <p className="text-xs text-violet-700 font-semibold">
                          Standard Target: {DEFAULT_CUSTOMER_TARGETS.OTHER.normal} cartons/hour
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCustom && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          Custom
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResetToBaseline("OTHER")}
                        title={`Reset to baseline ${DEFAULT_CUSTOMER_TARGETS.OTHER.normal} / ${DEFAULT_CUSTOMER_TARGETS.OTHER.breakfast} / ${DEFAULT_CUSTOMER_TARGETS.OTHER.tea}`}
                        className="text-[11px] font-bold text-slate-400 hover:text-violet-600 flex items-center gap-1 cursor-pointer transition-colors p-1"
                      >
                        <RotateCcw size={12} />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Editable Inputs */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs mb-5 space-y-3.5">
                    {/* Normal Hour */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          Normal Production Hour:
                        </label>
                        <span className="text-[11px] text-slate-400 font-medium">Standard Slot</span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          value={current.normal}
                          onChange={(e) => handleTargetChange("OTHER", "normal", e.target.value)}
                          className="w-full h-10 px-3.5 pr-14 bg-slate-50 border border-slate-300 rounded-lg text-base font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                          ctns/hr
                        </span>
                      </div>
                    </div>

                    {/* Break Slots (Breakfast / Dinner & Tea Break) */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">
                          Breakfast / Dinner Hour:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={current.breakfast}
                            onChange={(e) => handleTargetChange("OTHER", "breakfast", e.target.value)}
                            className="w-full h-9 px-3 pr-10 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
                          />
                          <span className="absolute right-2.5 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                            ctns
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">
                          Tea Break Hour:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={current.tea}
                            onChange={(e) => handleTargetChange("OTHER", "tea", e.target.value)}
                            className="w-full h-9 px-3 pr-10 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
                          />
                          <span className="absolute right-2.5 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                            ctns
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Summary: Shift & Day Totals */}
                <div className="pt-3.5 border-t border-violet-200/70 bg-violet-50/50 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 py-3.5 rounded-b-2xl">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Shift Target (8h)
                      </span>
                      <span className="text-base font-black text-slate-800">
                        {shiftTotal} <span className="text-xs font-normal text-slate-500">ctns</span>
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Full Day Target (16h)
                      </span>
                      <span className="text-base font-black text-violet-700">
                        {dayTotal} <span className="text-xs font-normal text-slate-500">ctns</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* Factory Standard Reference Note                                  */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
        <div className="flex items-start gap-3 text-xs text-slate-600">
          <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-slate-800">Standard Customer Target Calculation Reference:</p>
            <p className="text-slate-600 leading-relaxed">
              • <strong className="text-blue-700">PV Products:</strong> Standard {globalTargets.PVH?.normal ?? 60} cartons/hour (Breakfast/Dinner: {globalTargets.PVH?.breakfast ?? 40} ctns, Tea: {globalTargets.PVH?.tea ?? 45} ctns) • {(globalTargets.PVH?.normal ?? 60) * 6 + (globalTargets.PVH?.breakfast ?? 40) + (globalTargets.PVH?.tea ?? 45)} ctns per shift (8h) • {((globalTargets.PVH?.normal ?? 60) * 6 + (globalTargets.PVH?.breakfast ?? 40) + (globalTargets.PVH?.tea ?? 45)) * 2} ctns per day (16h).
            </p>
            <p className="text-slate-600 leading-relaxed">
              • <strong className="text-violet-700">Other Customers:</strong> Standard {globalTargets.OTHER?.normal ?? 40} cartons/hour (Breakfast/Dinner: {globalTargets.OTHER?.breakfast ?? 24} ctns, Tea: {globalTargets.OTHER?.tea ?? 32} ctns) • {(globalTargets.OTHER?.normal ?? 40) * 6 + (globalTargets.OTHER?.breakfast ?? 24) + (globalTargets.OTHER?.tea ?? 32)} ctns per shift (8h) • {((globalTargets.OTHER?.normal ?? 40) * 6 + (globalTargets.OTHER?.breakfast ?? 24) + (globalTargets.OTHER?.tea ?? 32)) * 2} ctns per day (16h).
            </p>
            <p className="text-[11px] text-slate-400 pt-1">
              Operators choose whether an MD Line is running PV Products or Other Customers when operating shifts on the Daily Input page. The targets above are automatically assigned to all slots based on the chosen customer type.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TargetSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      }
    >
      <TargetSettingsContent />
    </Suspense>
  );
}
