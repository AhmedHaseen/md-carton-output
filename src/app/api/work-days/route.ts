// API: Work Days — Create/Get working days
// GET: Fetch a work day by date (creates if new)
// POST: Create a work day with all 16 time slot entries

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultShiftTeams } from "@/lib/shift-rotation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/work-days?date=2026-09-15
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");

    if (!dateStr) {
      return NextResponse.json(
        { error: "Date parameter is required" },
        { status: 400 }
      );
    }

    // Find existing work day with its entries and time slot info
    let workDay = await prisma.workDay.findUnique({
      where: { workDate: new Date(dateStr + "T00:00:00.000Z") },
      include: {
        entries: {
          include: {
            timeSlot: true,
          },
          orderBy: {
            timeSlot: { sequenceNo: "asc" },
          },
        },
      },
    });

    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    };

    // Calculate default rotation duty for this date
    const defaultDuty = getDefaultShiftTeams(dateStr);

    // Fetch system settings
    let showOverrideBadge = true;
    let enforce30MinLock = true;
    try {
      const settings = await prisma.systemSetting.findMany({
        where: { key: { in: ["SHOW_OVERRIDE_BADGE", "ENFORCE_30MIN_LOCK"] } },
      });
      for (const s of settings) {
        if (s.key === "SHOW_OVERRIDE_BADGE" && s.value === "false") {
          showOverrideBadge = false;
        }
        if (s.key === "ENFORCE_30MIN_LOCK" && s.value === "false") {
          enforce30MinLock = false;
        }
      }
    } catch {
      // fallback to defaults
    }

    if (!workDay) {
      return NextResponse.json(
        { workDay: null, exists: false, defaultDuty, settings: { showOverrideBadge, enforce30MinLock } },
        { headers }
      );
    }

    // If day exists but shift teams were null, automatically backfill from weekly rotation
    if (!workDay.morningTeam || !workDay.eveningTeam) {
      workDay = await prisma.workDay.update({
        where: { id: workDay.id },
        data: {
          morningTeam: workDay.morningTeam || defaultDuty.morningTeam,
          eveningTeam: workDay.eveningTeam || defaultDuty.eveningTeam,
        },
        include: {
          entries: {
            include: { timeSlot: true },
            orderBy: { timeSlot: { sequenceNo: "asc" } },
          },
        },
      });
    }

    return NextResponse.json(
      { workDay, exists: true, defaultDuty, settings: { showOverrideBadge, enforce30MinLock } },
      { headers }
    );
  } catch (error) {
    console.error("GET /api/work-days error:", error);
    return NextResponse.json(
      { error: "Failed to fetch work day" },
      { status: 500 }
    );
  }
}

// POST /api/work-days  { date: "2026-09-15" }
// Creates the work day and generates all 16 time slot entries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date } = body;

    if (!date) {
      return NextResponse.json(
        { error: "Date is required" },
        { status: 400 }
      );
    }

    const workDate = new Date(date + "T00:00:00.000Z");

    // Check if already exists
    const existing = await prisma.workDay.findUnique({
      where: { workDate },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Work day already exists for this date" },
        { status: 409 }
      );
    }

    // Get all active time slots
    const timeSlots = await prisma.mdTimeSlot.findMany({
      where: { isActive: true },
      orderBy: { sequenceNo: "asc" },
    });

    if (timeSlots.length === 0) {
      return NextResponse.json(
        { error: "No time slots configured. Please seed the database first." },
        { status: 500 }
      );
    }

    // Calculate default rotation duty for this date
    const defaultDuty = getDefaultShiftTeams(date);

    // Create work day with all entries in a transaction
    const workDay = await prisma.$transaction(async (tx) => {
      // Create the work day with default shift teams
      const newDay = await tx.workDay.create({
        data: {
          workDate,
          status: "OPEN",
          morningTeam: body.morningTeam || defaultDuty.morningTeam,
          eveningTeam: body.eveningTeam || defaultDuty.eveningTeam,
        },
      });

      // Create an output entry for each time slot with default targets
      await tx.mdOutputEntry.createMany({
        data: timeSlots.map((slot) => ({
          workDayId: newDay.id,
          timeSlotId: slot.id,
          targetCartons: slot.defaultTarget,
          targetSource: "DEFAULT" as const,
          actualCartons: null,
        })),
      });

      // Return the complete work day with entries
      return tx.workDay.findUnique({
        where: { id: newDay.id },
        include: {
          entries: {
            include: { timeSlot: true },
            orderBy: { timeSlot: { sequenceNo: "asc" } },
          },
        },
      });
    });

    return NextResponse.json({ workDay, exists: true, defaultDuty }, { status: 201 });
  } catch (error) {
    console.error("POST /api/work-days error:", error);
    return NextResponse.json(
      { error: "Failed to create work day" },
      { status: 500 }
    );
  }
}

// PATCH /api/work-days { workDayId, shift: "MORNING" | "EVENING", team: "A" | "B", userId? }
// Assigns the shift team and automatically pairs the other shift's team (A <-> B)
// Restricted to Admin and Manager only
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const userRole = session?.user?.role;
    if (!session?.user || (userRole !== "ADMIN" && userRole !== "MANAGER")) {
      return NextResponse.json(
        { error: "Access denied. Shift rotation settings can only be modified by Admin or Manager accounts." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { workDayId, shift, team, userId } = body;

    if (!workDayId) {
      return NextResponse.json(
        { error: "workDayId is required" },
        { status: 400 }
      );
    }

    if (shift !== "MORNING" && shift !== "EVENING") {
      return NextResponse.json(
        { error: "shift must be 'MORNING' or 'EVENING'" },
        { status: 400 }
      );
    }

    if (team !== "A" && team !== "B") {
      return NextResponse.json(
        { error: "team must be 'A' or 'B'" },
        { status: 400 }
      );
    }

    // Determine reciprocal pairing
    let morningTeam: string;
    let eveningTeam: string;

    if (shift === "MORNING") {
      morningTeam = team;
      eveningTeam = team === "A" ? "B" : "A";
    } else {
      eveningTeam = team;
      morningTeam = team === "A" ? "B" : "A";
    }

    const updated = await prisma.$transaction(async (tx) => {
      const workDay = await tx.workDay.update({
        where: { id: workDayId },
        data: {
          morningTeam,
          eveningTeam,
        },
        include: {
          entries: {
            include: { timeSlot: true },
            orderBy: { timeSlot: { sequenceNo: "asc" } },
          },
        },
      });

      return workDay;
    });

    return NextResponse.json({ workDay: updated, success: true });
  } catch (error) {
    console.error("PATCH /api/work-days error:", error);
    return NextResponse.json(
      { error: "Failed to update shift teams" },
      { status: 500 }
    );
  }
}
