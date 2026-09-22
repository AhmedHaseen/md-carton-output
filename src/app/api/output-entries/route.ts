// API: Output Entries — Update carton counts
// PATCH: Update actual carton count for a specific entry

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateCartonCount } from "@/lib/validation";
import { auth } from "@/lib/auth";

// PATCH /api/output-entries  { entryId, actualCartons, userId? }
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const userRole = session?.user?.role;
    const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

    const body = await request.json();
    const { entryId, actualCartons, userId } = body;

    if (!entryId) {
      return NextResponse.json(
        { error: "Entry ID is required" },
        { status: 400 }
      );
    }

    // Find the entry with workDay and timeSlot
    const entry = await prisma.mdOutputEntry.findUnique({
      where: { id: entryId },
      include: { workDay: true, timeSlot: true },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    if (entry.workDay.status === "CLOSED") {
      return NextResponse.json(
        { error: "This day is closed. No edits allowed." },
        { status: 403 }
      );
    }

    // ─── 30-Minute Entry Lock Window Enforcement ───────────────────
    if (!isAdminOrManager) {
      let enforce30MinLock = true;
      try {
        const lockSetting = await prisma.systemSetting.findUnique({
          where: { key: "ENFORCE_30MIN_LOCK" },
        });
        if (lockSetting && lockSetting.value === "false") {
          enforce30MinLock = false;
        }
      } catch {
        // fallback to true
      }

      if (enforce30MinLock) {
        const workDateStr = entry.workDay.workDate.toISOString().split("T")[0];
        const slotEnd = new Date(`${workDateStr}T${entry.timeSlot.endTime}:00`);
        const cutoff = new Date(slotEnd.getTime() + 30 * 60 * 1000);
        const now = new Date();

        if (now > cutoff) {
          return NextResponse.json(
            {
              error: `Update window closed: carton output must be submitted within 30 minutes of slot completion (closed at ${entry.timeSlot.endTime} + 30m). Please contact an Admin or Manager for assistance.`,
              isLocked: true,
            },
            { status: 403 }
          );
        }
      }
    }

    // Validate the carton count (allow null to clear)
    const cartonValue = actualCartons === null || actualCartons === "" ? null : actualCartons;

    if (cartonValue !== null) {
      const validation = validateCartonCount(cartonValue);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }
    }

    // Update the entry
    const updated = await prisma.mdOutputEntry.update({
      where: { id: entryId },
      data: {
        actualCartons: cartonValue !== null ? Number(cartonValue) : null,
        enteredBy: session?.user?.id || userId || null,
        enteredAt: new Date(),
      },
      include: { timeSlot: true },
    });

    // Fetch all entries for this day to recalculate cumulative totals
    const allEntries = await prisma.mdOutputEntry.findMany({
      where: { workDayId: entry.workDayId },
      include: { timeSlot: true },
      orderBy: { timeSlot: { sequenceNo: "asc" } },
    });

    return NextResponse.json({ entry: updated, allEntries });
  } catch (error) {
    console.error("PATCH /api/output-entries error:", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}
