// Factory Shift Rotation Logic for MD Carton Output Digitalization System
// Anchor: Week of September 14, 2026 - September 20, 2026
// Morning Shift: Shift A | Evening Shift: Shift B
// Following week (Sep 21 - Sep 27): Morning: Shift B | Evening: Shift A
// Automatically alternates on a weekly basis.

export interface ShiftTeamDuty {
  morningTeam: "A" | "B";
  eveningTeam: "A" | "B";
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  weekLabel: string; // "Sep 14 – Sep 20, 2026"
  diffWeeks: number;
  isCurrentWeek?: boolean;
}

// Fixed anchor week
export const ROTATION_ANCHOR_DATE = "2026-09-14"; // Monday

/**
 * Parse YYYY-MM-DD or ISO string or Date object to local Date at midnight
 */
export function parseLocalDate(dateInput: Date | string): Date {
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }
  const str = String(dateInput).trim();
  const cleanStr = str.includes("T") ? str.split("T")[0] : str.split(" ")[0];
  const parts = cleanStr.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  const fallback = new Date(dateInput);
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0);
}

/**
 * Format local Date object to YYYY-MM-DD
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get the Monday (start of week) for any date
 */
export function getMondayOfWeek(dateInput: Date | string): Date {
  const date = parseLocalDate(dateInput);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday, 0, 0, 0, 0);
  return monday;
}

/**
 * Get Sunday (end of week) from a Monday date
 */
export function getSundayOfWeek(mondayDate: Date): Date {
  return new Date(
    mondayDate.getFullYear(),
    mondayDate.getMonth(),
    mondayDate.getDate() + 6,
    23,
    59,
    59,
    999
  );
}

/**
 * Get default shift team assignments (Morning & Evening) for any given date
 */
export function getDefaultShiftTeams(dateInput: Date | string): ShiftTeamDuty {
  const targetMonday = getMondayOfWeek(dateInput);
  const anchorMonday = parseLocalDate(ROTATION_ANCHOR_DATE);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((targetMonday.getTime() - anchorMonday.getTime()) / msPerDay);
  const diffWeeks = Math.floor(diffDays / 7);

  // Even week (0, 2, 4...) -> Morning: A, Evening: B
  // Odd week (1, 3, 5...)  -> Morning: B, Evening: A
  const isEvenWeek = (((diffWeeks % 2) + 2) % 2) === 0;

  const morningTeam: "A" | "B" = isEvenWeek ? "A" : "B";
  const eveningTeam: "A" | "B" = isEvenWeek ? "B" : "A";

  const targetSunday = getSundayOfWeek(targetMonday);

  const startMonth = targetMonday.toLocaleString("en-US", { month: "short" });
  const endMonth = targetSunday.toLocaleString("en-US", { month: "short" });
  const startDay = targetMonday.getDate();
  const endDay = targetSunday.getDate();
  const year = targetMonday.getFullYear();

  const weekLabel =
    startMonth === endMonth
      ? `${startMonth} ${startDay} – ${endDay}, ${year}`
      : `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;

  return {
    morningTeam,
    eveningTeam,
    weekStart: formatLocalDate(targetMonday),
    weekEnd: formatLocalDate(targetSunday),
    weekLabel,
    diffWeeks,
  };
}

/**
 * Generate weekly schedule rows for Admin shift viewer (e.g. past 1 week to next 6 weeks)
 */
export function getWeeklyRotationSchedules(
  currentDateInput: Date | string = new Date(),
  pastWeeks = 1,
  futureWeeks = 6
): ShiftTeamDuty[] {
  const currentMonday = getMondayOfWeek(currentDateInput);
  const currentWeekStartStr = formatLocalDate(currentMonday);

  const schedules: ShiftTeamDuty[] = [];

  for (let offset = -pastWeeks; offset <= futureWeeks; offset++) {
    const monday = new Date(
      currentMonday.getFullYear(),
      currentMonday.getMonth(),
      currentMonday.getDate() + offset * 7,
      0,
      0,
      0,
      0
    );
    const dateStr = formatLocalDate(monday);
    const duty = getDefaultShiftTeams(dateStr);
    duty.isCurrentWeek = duty.weekStart === currentWeekStartStr;
    schedules.push(duty);
  }

  return schedules;
}
