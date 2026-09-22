// API: Targets — Override and manage targets
// PATCH: Override target for a specific entry
// GET: Get target overrides for a date

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateTargetOverride } from "@/lib/validation";
import { auth } from "@/lib/auth";

// GET /api/targets?date=2026-09-15
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");

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
      // fallback to true
    }

    if (!dateStr) {
      // Return all default time slots
      const timeSlots = await prisma.mdTimeSlot.findMany({
        where: { isActive: true },
        orderBy: { sequenceNo: "asc" },
      });
      return NextResponse.json({ timeSlots, settings: { showOverrideBadge, enforce30MinLock } });
    }

    // Get overrides for a specific date
    const workDay = await prisma.workDay.findUnique({
      where: { workDate: new Date(dateStr + "T00:00:00.000Z") },
      include: {
        entries: {
          include: {
            timeSlot: true,
            overrides: {
              orderBy: { changedAt: "desc" },
            },
          },
          orderBy: { timeSlot: { sequenceNo: "asc" } },
        },
      },
    });

    if (!workDay) {
      return NextResponse.json({ error: "Work day not found", settings: { showOverrideBadge, enforce30MinLock } }, { status: 404 });
    }

    return NextResponse.json({ workDay, settings: { showOverrideBadge, enforce30MinLock } });
  } catch (error) {
    console.error("GET /api/targets error:", error);
    return NextResponse.json({ error: "Failed to fetch targets" }, { status: 500 });
  }
}

// PATCH /api/targets  { entryId, newTarget, reason, changedBy }
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user || (role !== "ADMIN" && role !== "MANAGER")) {
      return NextResponse.json(
        { error: "Access denied. Admin or Manager role required." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { entryId, newTarget, reason, changedBy } = body;

    if (!entryId) {
      return NextResponse.json({ error: "Entry ID is required" }, { status: 400 });
    }

    const validation = validateTargetOverride(newTarget, reason);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const entry = await prisma.mdOutputEntry.findUnique({
      where: { id: entryId },
      include: { workDay: true },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.workDay.status === "CLOSED") {
      return NextResponse.json({ error: "Day is closed" }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create override record
      await tx.targetOverride.create({
        data: {
          outputEntryId: entryId,
          oldTarget: entry.targetCartons,
          newTarget: Number(newTarget),
          reason,
          changedBy: changedBy || "system",
        },
      });

      // Update the entry's target
      const updated = await tx.mdOutputEntry.update({
        where: { id: entryId },
        data: {
          targetCartons: Number(newTarget),
          targetSource: "OVERRIDE",
        },
        include: { timeSlot: true },
      });

      return updated;
    });

    return NextResponse.json({ entry: result });
  } catch (error) {
    console.error("PATCH /api/targets error:", error);
    return NextResponse.json({ error: "Failed to override target" }, { status: 500 });
  }
}
