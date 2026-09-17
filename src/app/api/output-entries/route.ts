// API: Output Entries — Update carton counts
// PATCH: Update actual carton count for a specific entry

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateCartonCount } from "@/lib/validation";

// PATCH /api/output-entries  { entryId, actualCartons, userId? }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { entryId, actualCartons, userId } = body;

    if (!entryId) {
      return NextResponse.json(
        { error: "Entry ID is required" },
        { status: 400 }
      );
    }

    // Find the entry and check if day is open
    const entry = await prisma.mdOutputEntry.findUnique({
      where: { id: entryId },
      include: { workDay: true },
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
    const oldValue = entry.actualCartons;
    const updated = await prisma.$transaction(async (tx) => {
      const updatedEntry = await tx.mdOutputEntry.update({
        where: { id: entryId },
        data: {
          actualCartons: cartonValue !== null ? Number(cartonValue) : null,
          enteredBy: userId || null,
          enteredAt: new Date(),
        },
        include: { timeSlot: true },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: userId || null,
          action: oldValue === null ? "CREATE" : "UPDATE",
          entityType: "MdOutputEntry",
          entityId: entryId,
          detailsJson: {
            oldValue,
            newValue: cartonValue !== null ? Number(cartonValue) : null,
            timeSlot: `${updatedEntry.timeSlot.startTime}-${updatedEntry.timeSlot.endTime}`,
          },
        },
      });

      return updatedEntry;
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
