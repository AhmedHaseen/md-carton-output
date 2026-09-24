// API: Output Entries — Update carton counts
// PATCH: Update actual carton count for a specific entry

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateCartonCount } from "@/lib/validation";
import { formatTime } from "@/lib/calculations";
import { auth } from "@/lib/auth";
import {
  getSlotTargetForCustomer,
  DEFAULT_CUSTOMER_TARGETS,
  CustomerTargetConfig,
  LineCustomerTargetConfig,
  CustomerTypeKey,
} from "@/lib/target-config";

// PATCH /api/output-entries  { entryId, actualCartons?, customerType?, userId? }
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const userRole = session?.user?.role;
    const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

    const body = await request.json();
    const { entryId, actualCartons, customerType, userId } = body;

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
              error: `Update window closed: carton output must be submitted within 30 minutes of slot completion (closed at ${formatTime(entry.timeSlot.endTime)} + 30m). Please contact an Admin or Manager for assistance.`,
              isLocked: true,
            },
            { status: 403 }
          );
        }
      }
    }

    const updateData: any = {};

    // ─── Hourly Customer Type Update ────────────────────────────────
    if (customerType !== undefined) {
      if (customerType !== "PVH" && customerType !== "OTHER") {
        return NextResponse.json(
          { error: "Invalid customer type. Must be PVH or OTHER." },
          { status: 400 }
        );
      }

      // Lock check: once actual cartons are entered, customer type is locked for operators
      if (entry.actualCartons !== null && !isAdminOrManager) {
        return NextResponse.json(
          {
            error: "Customer type is locked because production cartons have already been entered for this hour slot.",
            isLocked: true,
          },
          { status: 403 }
        );
      }

      // Fetch dynamic target configuration
      let customerTargets: CustomerTargetConfig = { ...DEFAULT_CUSTOMER_TARGETS };
      let lineTargets: LineCustomerTargetConfig = {};
      try {
        const settings = await prisma.systemSetting.findMany({
          where: { key: { in: ["CUSTOMER_TARGET_CONFIG", "LINE_TARGET_CONFIG"] } },
        });
        for (const s of settings) {
          if (s.key === "CUSTOMER_TARGET_CONFIG" && s.value) {
            try {
              customerTargets = JSON.parse(s.value);
            } catch {}
          }
          if (s.key === "LINE_TARGET_CONFIG" && s.value) {
            try {
              lineTargets = JSON.parse(s.value);
            } catch {}
          }
        }
      } catch {}

      const newTarget = getSlotTargetForCustomer(
        entry.timeSlot.sequenceNo,
        customerType as CustomerTypeKey,
        entry.mdLine,
        lineTargets,
        customerTargets
      );

      updateData.customerType = customerType;
      updateData.targetCartons = newTarget;
      updateData.targetSource = "OVERRIDE";

      if (entry.customerType !== customerType || entry.targetCartons !== newTarget) {
        try {
          await prisma.targetOverride.create({
            data: {
              outputEntryId: entry.id,
              oldTarget: entry.targetCartons,
              newTarget,
              reason: `Customer switched to ${customerType === "PVH" ? "PV Products" : "Other Customers"} for ${entry.timeSlot.startTime}–${entry.timeSlot.endTime}`,
              changedBy: session?.user?.name || session?.user?.username || "Operator",
            },
          });
        } catch (overrideErr) {
          console.error("Failed to create TargetOverride:", overrideErr);
        }
      }
    }

    // ─── Actual Carton Count Update ─────────────────────────────────
    if (actualCartons !== undefined) {
      const cartonValue = actualCartons === null || actualCartons === "" ? null : actualCartons;

      if (cartonValue !== null) {
        const validation = validateCartonCount(cartonValue);
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400 }
          );
        }
        updateData.actualCartons = Number(cartonValue);
      } else {
        updateData.actualCartons = null;
      }
      updateData.enteredBy = session?.user?.id || userId || null;
      updateData.enteredAt = new Date();
    }

    // Update the entry
    const updated = await prisma.mdOutputEntry.update({
      where: { id: entryId },
      data: updateData,
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
    const message = error instanceof Error ? error.message : "Failed to update entry";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
