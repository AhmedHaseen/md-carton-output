// API: Work Days — Create/Get working days
// GET: Fetch a work day by date (creates if new)
// POST: Create a work day with all time slot entries for all 3 MD lines

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultShiftTeams } from "@/lib/shift-rotation";
import {
  MD_LINES,
  getDefaultCustomerType,
  getTargetForSlot,
  getSlotTargetFromConfig,
  getSlotTargetForCustomer,
  DEFAULT_CUSTOMER_TARGETS,
} from "@/lib/target-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/work-days?date=2026-09-15&mdLine=1
// GET /api/work-days?startDate=2026-09-15&endDate=2026-09-21 (Range batch query)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    };

    // Fetch system settings once
    let showOverrideBadge = true;
    let enforce30MinLock = true;
    let customerTargets = { ...DEFAULT_CUSTOMER_TARGETS };
    try {
      const settings = await prisma.systemSetting.findMany({
        where: { key: { in: ["SHOW_OVERRIDE_BADGE", "ENFORCE_30MIN_LOCK", "CUSTOMER_TARGET_CONFIG"] } },
      });
      for (const s of settings) {
        if (s.key === "SHOW_OVERRIDE_BADGE" && s.value === "false") {
          showOverrideBadge = false;
        }
        if (s.key === "ENFORCE_30MIN_LOCK" && s.value === "false") {
          enforce30MinLock = false;
        }
        if (s.key === "CUSTOMER_TARGET_CONFIG" && s.value) {
          try {
            customerTargets = JSON.parse(s.value);
          } catch {
            // fallback
          }
        }
      }
    } catch {
      // fallback to defaults
    }

    // ─── Batch Range Query (for Weekly Analysis / Reports) ───────
    if (startDateStr && endDateStr) {
      const workDays = await prisma.workDay.findMany({
        where: {
          workDate: {
            gte: new Date(startDateStr + "T00:00:00.000Z"),
            lte: new Date(endDateStr + "T00:00:00.000Z"),
          },
        },
        include: {
          entries: {
            include: { timeSlot: true },
            orderBy: { timeSlot: { sequenceNo: "asc" } },
          },
        },
        orderBy: { workDate: "asc" },
      });

      return NextResponse.json(
        {
          workDays,
          exists: true,
          settings: { showOverrideBadge, enforce30MinLock, customerTargets },
        },
        { headers }
      );
    }

    // ─── Single Day Query ─────────────────────────────────────────
    if (!dateStr) {
      return NextResponse.json(
        { error: "Date or startDate/endDate parameter is required" },
        { status: 400 }
      );
    }

    // Calculate default rotation duty for this date
    const defaultDuty = getDefaultShiftTeams(dateStr);

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

    if (!workDay) {
      return NextResponse.json(
        { workDay: null, exists: false, defaultDuty, settings: { showOverrideBadge, enforce30MinLock, customerTargets } },
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

    // Ensure all 3 lines have entries for this work day (auto-heal if any line missing)
    // Avoid redundant count query: workDay.entries is already loaded in memory
    const existingEntriesCount = workDay.entries?.length ?? 0;

    if (existingEntriesCount < 48) {
      const allSlots = await prisma.mdTimeSlot.findMany({
        where: { isActive: true },
        orderBy: { sequenceNo: "asc" },
      });
      const existingKeySet = new Set(
        workDay.entries.map((e) => `${e.mdLine}-${e.timeSlotId}`)
      );

      const missingEntries: Array<{
        workDayId: string;
        timeSlotId: string;
        mdLine: number;
        customerType: "PVH" | "OTHER";
        targetCartons: number;
        targetSource: "DEFAULT";
        actualCartons: null;
      }> = [];

      // Check if custom line defaults & targets exist in system settings
      let customLineDefaults: any;
      let customLineTargets: any;
      try {
        const settings = await prisma.systemSetting.findMany({
          where: { key: { in: ["LINE_CUSTOMER_DEFAULTS", "LINE_TARGET_CONFIG"] } },
        });
        for (const s of settings) {
          if (s.key === "LINE_CUSTOMER_DEFAULTS" && s.value) {
            customLineDefaults = JSON.parse(s.value);
          }
          if (s.key === "LINE_TARGET_CONFIG" && s.value) {
            customLineTargets = JSON.parse(s.value);
          }
        }
      } catch {
        // fallback
      }

      for (const line of MD_LINES) {
        const custType = getDefaultCustomerType(line, customLineDefaults);
        const lineTargetCfg = customLineTargets?.[String(line)];
        for (const slot of allSlots) {
          if (!existingKeySet.has(`${line}-${slot.id}`)) {
            const calculatedTarget = getSlotTargetFromConfig(slot.sequenceNo, custType, lineTargetCfg);
            missingEntries.push({
              workDayId: workDay.id,
              timeSlotId: slot.id,
              mdLine: line,
              customerType: custType,
              targetCartons: calculatedTarget,
              targetSource: "DEFAULT" as const,
              actualCartons: null,
            });
          }
        }
      }

      if (missingEntries.length > 0) {
        await prisma.mdOutputEntry.createMany({ data: missingEntries });
        workDay = await prisma.workDay.findUnique({
          where: { id: workDay.id },
          include: {
            entries: {
              include: { timeSlot: true },
              orderBy: { timeSlot: { sequenceNo: "asc" } },
            },
          },
        });
      }
    }

    // workDay.entries contains all 48 entries across all MD lines
    const allLineEntries = workDay ? workDay.entries : [];

    return NextResponse.json(
      {
        workDay,
        exists: true,
        defaultDuty,
        settings: { showOverrideBadge, enforce30MinLock, customerTargets },
        allLineEntries,
      },
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
// Creates the work day and generates entries for all 3 MD lines × 16 time slots = 48 entries
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

    // Create work day with entries for ALL 3 MD lines in a transaction
    const workDay = await prisma.$transaction(async (tx) => {
      // Create the work day with default shift teams
      const newDay = await tx.workDay.create({
        data: {
          workDate,
          status: "OPEN",
          morningTeam: body.morningTeam || defaultDuty.morningTeam,
          eveningTeam: body.eveningTeam || defaultDuty.eveningTeam,
          createdLines: [],
        },
      });

      // Create entries for each MD line × each time slot
      const entryData: Array<{
        workDayId: string;
        timeSlotId: string;
        mdLine: number;
        customerType: "PVH" | "OTHER";
        targetCartons: number;
        targetSource: "DEFAULT";
        actualCartons: null;
      }> = [];

      // Check if custom line defaults & targets exist in system settings
      let customLineDefaults: any;
      let customLineTargets: any;
      let customCustTargets: any;
      try {
        const settings = await tx.systemSetting.findMany({
          where: { key: { in: ["LINE_CUSTOMER_DEFAULTS", "LINE_TARGET_CONFIG", "CUSTOMER_TARGET_CONFIG"] } },
        });
        for (const s of settings) {
          if (s.key === "LINE_CUSTOMER_DEFAULTS" && s.value) {
            customLineDefaults = JSON.parse(s.value);
          }
          if (s.key === "LINE_TARGET_CONFIG" && s.value) {
            customLineTargets = JSON.parse(s.value);
          }
          if (s.key === "CUSTOMER_TARGET_CONFIG" && s.value) {
            customCustTargets = JSON.parse(s.value);
          }
        }
      } catch {
        // fallback
      }

      for (const line of MD_LINES) {
        const custType = getDefaultCustomerType(line, customLineDefaults);
        for (const slot of timeSlots) {
          const calculatedTarget = getSlotTargetForCustomer(
            slot.sequenceNo,
            custType,
            line,
            customLineTargets,
            customCustTargets
          );
          entryData.push({
            workDayId: newDay.id,
            timeSlotId: slot.id,
            mdLine: line,
            customerType: custType,
            targetCartons: calculatedTarget,
            targetSource: "DEFAULT" as const,
            actualCartons: null,
          });
        }
      }

      await tx.mdOutputEntry.createMany({ data: entryData });

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
  } catch (error: any) {
    console.error("POST /api/work-days error:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to create work day",
        details: String(error?.stack || error),
      },
      { status: 500 }
    );
  }
}

// PATCH /api/work-days
// Handles:
// 1) Customer type change for an MD line: { workDayId, mdLine, customerType }
// 2) Shift team assignment: { workDayId, shift: "MORNING" | "EVENING", team: "A" | "B" }
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const userRole = session?.user?.role;
    const body = await request.json();
    const { workDayId } = body;

    if (!workDayId) {
      return NextResponse.json(
        { error: "workDayId is required" },
        { status: 400 }
      );
    }

    // Branch 1: Customer type update for a specific MD Line (supports both shifts independently)
    if (
      body.mdLine !== undefined &&
      (body.morningCustomerType !== undefined ||
        body.eveningCustomerType !== undefined ||
        body.customerType !== undefined)
    ) {
      const { mdLine, customerType, morningCustomerType, eveningCustomerType, shift } = body;
      const lineNum = Number(mdLine);
      if (![1, 2, 3].includes(lineNum)) {
        return NextResponse.json({ error: "Invalid mdLine. Only MD lines 1, 2, or 3 are allowed." }, { status: 400 });
      }

      const slots = await prisma.mdTimeSlot.findMany({ orderBy: { sequenceNo: "asc" } });

      let customCustTargets: any;
      let customLineTargets: any;
      try {
        const settings = await prisma.systemSetting.findMany({
          where: { key: { in: ["CUSTOMER_TARGET_CONFIG", "LINE_TARGET_CONFIG"] } },
        });
        for (const s of settings) {
          if (s.key === "CUSTOMER_TARGET_CONFIG" && s.value) {
            customCustTargets = JSON.parse(s.value);
          }
          if (s.key === "LINE_TARGET_CONFIG" && s.value) {
            customLineTargets = JSON.parse(s.value);
          }
        }
      } catch {
        // fallback
      }

      await prisma.$transaction(
        async (tx) => {
          const updatePromises: Promise<any>[] = [];

          for (const slot of slots) {
            let slotCustomerType: "PVH" | "OTHER" | undefined;

            if (slot.shift === "MORNING") {
              if (morningCustomerType) slotCustomerType = morningCustomerType;
              else if (shift === "MORNING" && customerType) slotCustomerType = customerType;
              else if (!shift && customerType) slotCustomerType = customerType;
            } else if (slot.shift === "EVENING") {
              if (eveningCustomerType) slotCustomerType = eveningCustomerType;
              else if (shift === "EVENING" && customerType) slotCustomerType = customerType;
              else if (!shift && customerType) slotCustomerType = customerType;
            }

            if (slotCustomerType && (slotCustomerType === "PVH" || slotCustomerType === "OTHER")) {
              const newTarget = getSlotTargetForCustomer(
                slot.sequenceNo,
                slotCustomerType,
                lineNum,
                customLineTargets,
                customCustTargets
              );
              // CRITICAL: Only update slots that have NOT been entered yet (actualCartons: null).
              // Already entered slots (actualCartons !== null) strictly retain their existing customer type, targets, and data!
              updatePromises.push(
                tx.mdOutputEntry.updateMany({
                  where: {
                    workDayId,
                    mdLine: lineNum,
                    timeSlotId: slot.id,
                    targetSource: "DEFAULT",
                    actualCartons: null,
                  },
                  data: {
                    customerType: slotCustomerType,
                    targetCartons: newTarget,
                  },
                })
              );
            }
          }

          if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
          }

          // Add this line to createdLines if not already present
          const currentWorkDay = await tx.workDay.findUnique({
            where: { id: workDayId },
            select: { createdLines: true },
          });
          const existingLines = currentWorkDay?.createdLines || [];
          if (!existingLines.includes(lineNum)) {
            await tx.workDay.update({
              where: { id: workDayId },
              data: {
                createdLines: [...existingLines, lineNum].sort((a, b) => a - b),
              },
            });
          }
        },
        { timeout: 25000, maxWait: 15000 }
      );

      const updatedWorkDay = await prisma.workDay.findUnique({
        where: { id: workDayId },
        include: {
          entries: {
            include: { timeSlot: true },
            orderBy: { timeSlot: { sequenceNo: "asc" } },
          },
        },
      });

      return NextResponse.json({ workDay: updatedWorkDay, success: true });
    }

    // Branch 2: Shift team assignment (Restricted to Admin and Manager)
    if (!session?.user || (userRole !== "ADMIN" && userRole !== "MANAGER")) {
      return NextResponse.json(
        { error: "Access denied. Shift rotation settings can only be modified by Admin or Manager accounts." },
        { status: 403 }
      );
    }

    const { shift, team } = body;

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
