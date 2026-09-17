// Calculation utilities for the MD Carton Output System
// Implements shift-separated cumulative totals, variance, KPIs per warehouse operations

export interface SlotEntry {
  id: string;
  sequenceNo: number;
  shift: "MORNING" | "EVENING";
  startTime: string;
  endTime: string;
  targetCartons: number;
  actualCartons: number | null;
  targetSource: "DEFAULT" | "OVERRIDE";
}

export interface SlotWithCalculations extends SlotEntry {
  variance: number | null;
  cumulativeActual: number | null;
  status: "PENDING" | "ON_TARGET" | "ABOVE_TARGET" | "BELOW_TARGET";
}

export interface DailyKPIs {
  totalActual: number;
  totalTarget: number;
  completedTarget: number;
  performanceRate: number;
  completedVariance: number;
  achievementPercent: number;
  totalVariance: number;
  completedSlots: number;
  totalSlots: number;
  averagePerSlot: number;
  bestHour: SlotWithCalculations | null;
  belowTargetSlots: number;
  morningTotal: number;
  eveningTotal: number;
  morningTarget: number;
  eveningTarget: number;
}

export interface WeeklyKPIs {
  weeklyTotalActual: number;
  weeklyTotalTarget: number;
  weeklyAchievementPercent: number;
  averageDailyActual: number;
  averageDailyAchievement: number;
  bestDay: { date: string; actual: number } | null;
  worstDay: { date: string; actual: number } | null;
  totalBelowTargetSlots: number;
  morningTotal: number;
  eveningTotal: number;
  workingDays: number;
}

/**
 * Calculate cumulative totals, variance, and status for each slot.
 * NOTE: Cumulative is counted separately for each shift (Morning resets at slot 1, Evening resets at slot 9).
 */
export function calculateSlotData(entries: SlotEntry[]): SlotWithCalculations[] {
  // Sort by sequence number to ensure correct chronological order
  const sorted = [...entries].sort((a, b) => a.sequenceNo - b.sequenceNo);

  let morningCumulative = 0;
  let eveningCumulative = 0;

  return sorted.map((entry) => {
    const hasActual = entry.actualCartons !== null && entry.actualCartons !== undefined;

    let cumulativeActual: number | null = null;
    if (hasActual) {
      if (entry.shift === "MORNING") {
        morningCumulative += entry.actualCartons!;
        cumulativeActual = morningCumulative;
      } else {
        eveningCumulative += entry.actualCartons!;
        cumulativeActual = eveningCumulative;
      }
    }

    const variance = hasActual ? entry.actualCartons! - entry.targetCartons : null;

    let status: SlotWithCalculations["status"] = "PENDING";
    if (hasActual) {
      if (entry.actualCartons! === entry.targetCartons) {
        status = "ON_TARGET";
      } else if (entry.actualCartons! > entry.targetCartons) {
        status = "ABOVE_TARGET";
      } else {
        status = "BELOW_TARGET";
      }
    }

    return {
      ...entry,
      variance,
      cumulativeActual,
      status,
    };
  });
}

/**
 * Calculate daily KPIs from slot data.
 */
export function calculateDailyKPIs(slots: SlotWithCalculations[]): DailyKPIs {
  const completedSlots = slots.filter(
    (s) => s.actualCartons !== null && s.actualCartons !== undefined
  );

  const totalActual = completedSlots.reduce((sum, s) => sum + (s.actualCartons ?? 0), 0);
  const totalTarget = slots.reduce((sum, s) => sum + s.targetCartons, 0);
  const completedTarget = completedSlots.reduce((sum, s) => sum + s.targetCartons, 0);
  const performanceRate = completedTarget > 0 ? (totalActual / completedTarget) * 100 : 0;
  const completedVariance = totalActual - completedTarget;
  const achievementPercent = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const totalVariance = totalActual - totalTarget;
  const averagePerSlot =
    completedSlots.length > 0 ? totalActual / completedSlots.length : 0;

  const belowTargetSlots = completedSlots.filter(
    (s) => s.actualCartons !== null && s.actualCartons! < s.targetCartons
  ).length;

  // Best hour: slot with highest actual output
  const bestHour =
    completedSlots.length > 0
      ? completedSlots.reduce((best, s) =>
          (s.actualCartons ?? 0) > (best.actualCartons ?? 0) ? s : best
        )
      : null;

  // Shift totals
  const morningSlots = completedSlots.filter((s) => s.shift === "MORNING");
  const eveningSlots = completedSlots.filter((s) => s.shift === "EVENING");

  const morningTotal = morningSlots.reduce((sum, s) => sum + (s.actualCartons ?? 0), 0);
  const eveningTotal = eveningSlots.reduce((sum, s) => sum + (s.actualCartons ?? 0), 0);

  const morningTarget = slots
    .filter((s) => s.shift === "MORNING")
    .reduce((sum, s) => sum + s.targetCartons, 0);
  const eveningTarget = slots
    .filter((s) => s.shift === "EVENING")
    .reduce((sum, s) => sum + s.targetCartons, 0);

  return {
    totalActual,
    totalTarget,
    completedTarget,
    performanceRate,
    completedVariance,
    achievementPercent,
    totalVariance,
    completedSlots: completedSlots.length,
    totalSlots: slots.length,
    averagePerSlot,
    bestHour,
    belowTargetSlots,
    morningTotal,
    eveningTotal,
    morningTarget,
    eveningTarget,
  };
}

/**
 * Format time from 24h "HH:MM" to 12h "H:MM AM/PM".
 */
export function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

/**
 * Format time range for display.
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}
