// API: Targets — Comprehensive Target Management (Daily, Weekly, Monthly & Line-Customer Allocation)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateTargetOverride } from "@/lib/validation";
import { auth } from "@/lib/auth";
import {
  TARGET_CONFIG,
  getTargetForSlot,
  getDefaultCustomerType,
  getSlotTargetFromConfig,
  getSlotTargetForCustomer,
  DEFAULT_CUSTOMER_TARGETS,
  type CustomerTargetConfig,
  type LineCustomerTargetConfig,
  MD_LINES,
  CustomerTypeKey,
} from "@/lib/target-config";
import { getDefaultShiftTeams } from "@/lib/shift-rotation";

// Helper to get system settings
async function getSystemSettings() {
  let showOverrideBadge = true;
  let enforce30MinLock = true;
  let customerTargets: CustomerTargetConfig = { ...DEFAULT_CUSTOMER_TARGETS };
  let lineCustomerTargets: LineCustomerTargetConfig = {};
  let lineCustomerDefaults: Record<string, CustomerTypeKey> = {
    "1": "PVH",
    "2": "PVH",
    "3": "OTHER",
  };
  let lineTargetConfigs: Record<string, { normal: number; breakfast?: number; tea?: number }> = {
    "1": { normal: 60, breakfast: 40, tea: 45 },
    "2": { normal: 60, breakfast: 40, tea: 45 },
    "3": { normal: 40, breakfast: 24, tea: 32 },
  };

  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            "SHOW_OVERRIDE_BADGE",
            "ENFORCE_30MIN_LOCK",
            "CUSTOMER_TARGET_CONFIG",
            "LINE_TARGET_CONFIG",
            "LINE_CUSTOMER_DEFAULTS",
          ],
        },
      },
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
          // keep fallback
        }
      }
      if (s.key === "LINE_TARGET_CONFIG" && s.value) {
        try {
          lineCustomerTargets = JSON.parse(s.value);
          lineTargetConfigs = JSON.parse(s.value);
        } catch {
          // keep fallback
        }
      }
      if (s.key === "LINE_CUSTOMER_DEFAULTS" && s.value) {
        try {
          lineCustomerDefaults = JSON.parse(s.value);
        } catch {
          // keep fallback
        }
      }
    }
  } catch {
    // fallback
  }

  return { showOverrideBadge, enforce30MinLock, customerTargets, lineCustomerTargets, lineCustomerDefaults, lineTargetConfigs };
}

// GET /api/targets
// Supports:
// 1. ?date=YYYY-MM-DD (Daily)
// 2. ?scope=WEEK&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD (Weekly)
// 3. ?scope=MONTH&month=YYYY-MM (Monthly)
// 4. (No params) Default slots, baseline targets, and settings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const scope = searchParams.get("scope"); // "WEEK" | "MONTH" | null
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const month = searchParams.get("month"); // e.g. "2026-09"

    const {
      showOverrideBadge,
      enforce30MinLock,
      customerTargets,
      lineCustomerTargets,
      lineCustomerDefaults,
    } = await getSystemSettings();

    const timeSlots = await prisma.mdTimeSlot.findMany({
      where: { isActive: true },
      orderBy: { sequenceNo: "asc" },
    });

    // ─── Scope: WEEK ────────────────────────────────────────────────
    if (scope === "WEEK" && startDate && endDate) {
      const start = new Date(startDate + "T00:00:00.000Z");
      const end = new Date(endDate + "T23:59:59.999Z");

      const workDays = await prisma.workDay.findMany({
        where: {
          workDate: { gte: start, lte: end },
        },
        include: {
          entries: {
            include: { timeSlot: true, overrides: { orderBy: { changedAt: "desc" } } },
            orderBy: [{ mdLine: "asc" }, { timeSlot: { sequenceNo: "asc" } }],
          },
        },
        orderBy: { workDate: "asc" },
      });

      return NextResponse.json({
        scope: "WEEK",
        startDate,
        endDate,
        workDays,
        timeSlots,
        targetConfig: TARGET_CONFIG,
        customerTargets,
        lineCustomerTargets,
        lineCustomerDefaults,
        settings: { showOverrideBadge, enforce30MinLock },
      });
    }

    // ─── Scope: MONTH ───────────────────────────────────────────────
    if (scope === "MONTH" && month && /^\d{4}-\d{2}$/.test(month)) {
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

      const workDays = await prisma.workDay.findMany({
        where: {
          workDate: { gte: start, lte: end },
        },
        include: {
          entries: {
            include: { timeSlot: true, overrides: { orderBy: { changedAt: "desc" } } },
            orderBy: [{ mdLine: "asc" }, { timeSlot: { sequenceNo: "asc" } }],
          },
        },
        orderBy: { workDate: "asc" },
      });

      return NextResponse.json({
        scope: "MONTH",
        month,
        workDays,
        timeSlots,
        targetConfig: TARGET_CONFIG,
        customerTargets,
        lineCustomerTargets,
        lineCustomerDefaults,
        settings: { showOverrideBadge, enforce30MinLock },
      });
    }

    // ─── No specific date: return defaults ──────────────────────────
    if (!dateStr) {
      return NextResponse.json({
        timeSlots,
        targetConfig: TARGET_CONFIG,
        customerTargets,
        lineCustomerTargets,
        lineCustomerDefaults,
        settings: { showOverrideBadge, enforce30MinLock },
      });
    }

    // ─── Scope: SINGLE DAY ──────────────────────────────────────────
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
          orderBy: [
            { mdLine: "asc" },
            { timeSlot: { sequenceNo: "asc" } },
          ],
        },
      },
    });

    if (!workDay) {
      return NextResponse.json(
        {
          error: "Work day not found",
          workDay: null,
          timeSlots,
          targetConfig: TARGET_CONFIG,
          customerTargets,
          lineCustomerTargets,
          lineCustomerDefaults,
          settings: { showOverrideBadge, enforce30MinLock },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      workDay,
      timeSlots,
      targetConfig: TARGET_CONFIG,
      customerTargets,
      lineCustomerTargets,
      lineCustomerDefaults,
      settings: { showOverrideBadge, enforce30MinLock },
    });
  } catch (error) {
    console.error("GET /api/targets error:", error);
    return NextResponse.json({ error: "Failed to fetch targets" }, { status: 500 });
  }
}

// POST /api/targets
// Handles:
// 1. action: "UPDATE_CUSTOMER_TARGETS" — Set targets for each customer type (PV & Other) with optional line overrides
// 2. action: "UPDATE_LINE_DEFAULTS" — Legacy alias for target updates
// 3. action: "BATCH_TARGET_UPDATE" — Daily, Weekly, Monthly target setup across dates
// 4. action: "ALLOCATE_CUSTOMER" — Allocate any customer (PV or OTHER) to any MD Line (Line 1, 2, 3)
export async function POST(request: NextRequest) {
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
    const { action } = body;

    // ─── 1. Target Settings by Customer Type (PV & Other) ─────────────
    if (action === "UPDATE_CUSTOMER_TARGETS" || action === "UPDATE_LINE_DEFAULTS") {
      const {
        customerTargets,
        lineCustomerTargets,
        lineDefaults,
        lineTargetConfigs,
        applyToOpenDays = true,
      } = body;

      // Save global customer targets
      const effectiveCustomerTargets = customerTargets || {
        PVH: lineTargetConfigs?.["1"] || lineTargetConfigs?.["2"] || DEFAULT_CUSTOMER_TARGETS.PVH,
        OTHER: lineTargetConfigs?.["3"] || DEFAULT_CUSTOMER_TARGETS.OTHER,
      };

      await prisma.systemSetting.upsert({
        where: { key: "CUSTOMER_TARGET_CONFIG" },
        create: {
          key: "CUSTOMER_TARGET_CONFIG",
          value: JSON.stringify(effectiveCustomerTargets),
        },
        update: {
          value: JSON.stringify(effectiveCustomerTargets),
        },
      });

      // Save line-specific overrides if provided
      const effectiveLineTargets = lineCustomerTargets || lineTargetConfigs;
      if (effectiveLineTargets && typeof effectiveLineTargets === "object") {
        await prisma.systemSetting.upsert({
          where: { key: "LINE_TARGET_CONFIG" },
          create: {
            key: "LINE_TARGET_CONFIG",
            value: JSON.stringify(effectiveLineTargets),
          },
          update: {
            value: JSON.stringify(effectiveLineTargets),
          },
        });
      }

      if (lineDefaults && typeof lineDefaults === "object") {
        await prisma.systemSetting.upsert({
          where: { key: "LINE_CUSTOMER_DEFAULTS" },
          create: {
            key: "LINE_CUSTOMER_DEFAULTS",
            value: JSON.stringify(lineDefaults),
          },
          update: {
            value: JSON.stringify(lineDefaults),
          },
        });
      }

      let updatedDaysCount = 0;
      let totalUpdatedEntries = 0;
      if (applyToOpenDays) {
        const openDays = await prisma.workDay.findMany({
          where: { status: "OPEN" },
          include: { entries: { include: { timeSlot: true } } },
        });

        const author = session?.user?.name || session?.user?.username || "Admin";

        for (const day of openDays) {
          const overridesToCreate: Array<{
            outputEntryId: string;
            oldTarget: number;
            newTarget: number;
            reason: string;
            changedBy: string;
          }> = [];
          const entriesToUpdate: Array<{ id: string; target: number }> = [];

          for (const entry of day.entries) {
            if (!entry.timeSlot) continue;

            const calculatedTarget = Math.round(
              Number(
                getSlotTargetForCustomer(
                  entry.timeSlot.sequenceNo,
                  entry.customerType,
                  entry.mdLine,
                  effectiveLineTargets,
                  effectiveCustomerTargets
                )
              )
            );

            if (entry.targetCartons !== calculatedTarget) {
              overridesToCreate.push({
                outputEntryId: entry.id,
                oldTarget: entry.targetCartons,
                newTarget: calculatedTarget,
                reason: `Customer target settings updated by Admin for ${entry.customerType === "PVH" ? "PV Products" : "Other Customers"}`,
                changedBy: author,
              });
              entriesToUpdate.push({ id: entry.id, target: calculatedTarget });
            }
          }

          if (overridesToCreate.length > 0) {
            updatedDaysCount++;
            await prisma.$transaction(
              async (tx) => {
                await tx.targetOverride.createMany({
                  data: overridesToCreate,
                });

                // Group entries by new target value to minimize update calls
                const byTarget = new Map<number, string[]>();
                for (const item of entriesToUpdate) {
                  const list = byTarget.get(item.target) || [];
                  list.push(item.id);
                  byTarget.set(item.target, list);
                }

                for (const [targetVal, ids] of byTarget.entries()) {
                  await tx.mdOutputEntry.updateMany({
                    where: { id: { in: ids } },
                    data: {
                      targetCartons: targetVal,
                      targetSource: "OVERRIDE",
                    },
                  });
                }
              },
              { timeout: 25000, maxWait: 10000 }
            );
            totalUpdatedEntries += entriesToUpdate.length;
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Customer targets updated successfully${updatedDaysCount > 0 ? ` (applied to ${updatedDaysCount} active work day(s))` : ""}`,
        customerTargets: effectiveCustomerTargets,
        lineCustomerTargets: effectiveLineTargets,
        updatedDaysCount,
        totalUpdatedEntries,
      });
    }

    // ─── 2. Allocate Customer to an MD Line for a Day/Shift ─────────
    if (action === "ALLOCATE_CUSTOMER") {
      const { date, mdLine, shift, customerType, reason, changedBy } = body;
      if (!date || !mdLine || !customerType) {
        return NextResponse.json(
          { error: "date, mdLine, and customerType are required" },
          { status: 400 }
        );
      }

      const lineNum = Number(mdLine);
      const custType = customerType as CustomerTypeKey;
      const workDate = new Date(date + "T00:00:00.000Z");

      // Find or create the work day
      let workDay = await prisma.workDay.findUnique({
        where: { workDate },
        include: { entries: { include: { timeSlot: true } } },
      });

      const timeSlots = await prisma.mdTimeSlot.findMany({
        where: { isActive: true },
        orderBy: { sequenceNo: "asc" },
      });

      if (!workDay) {
        const defaultDuty = getDefaultShiftTeams(date);
        workDay = await prisma.$transaction(async (tx) => {
          const newDay = await tx.workDay.create({
            data: {
              workDate,
              status: "OPEN",
              morningTeam: defaultDuty.morningTeam,
              eveningTeam: defaultDuty.eveningTeam,
              createdLines: [],
            },
          });

          const entryData = [];
          for (const l of MD_LINES) {
            const defaultLineCust = l === lineNum ? custType : getDefaultCustomerType(l);
            for (const slot of timeSlots) {
              entryData.push({
                workDayId: newDay.id,
                timeSlotId: slot.id,
                mdLine: l,
                customerType: defaultLineCust,
                targetCartons: getTargetForSlot(slot.sequenceNo, defaultLineCust),
                targetSource: "DEFAULT" as const,
                actualCartons: null,
              });
            }
          }
          await tx.mdOutputEntry.createMany({ data: entryData });

          return tx.workDay.findUnique({
            where: { id: newDay.id },
            include: { entries: { include: { timeSlot: true } } },
          });
        });
      }

      if (!workDay) {
        return NextResponse.json({ error: "Failed to initialize work day" }, { status: 500 });
      }

      // Filter entries to update
      const entriesToUpdate = workDay.entries.filter((e) => {
        if (e.mdLine !== lineNum) return false;
        if (shift && shift !== "ALL" && e.timeSlot.shift !== shift) return false;
        return true;
      });

      const auditReason = reason || `Re-allocated MD Line ${lineNum} to ${custType === "PVH" ? "PV" : "Other"} Customers`;
      const author = changedBy || session?.user?.name || session?.user?.username || "Admin";

      const overridesToCreate: Array<{
        outputEntryId: string;
        oldTarget: number;
        newTarget: number;
        reason: string;
        changedBy: string;
      }> = [];
      const entriesToModify: Array<{ id: string; target: number }> = [];

      for (const entry of entriesToUpdate) {
        if (!entry.timeSlot) continue;
        const newTarget = getTargetForSlot(entry.timeSlot.sequenceNo, custType);
        if (entry.targetCartons !== newTarget || entry.customerType !== custType) {
          overridesToCreate.push({
            outputEntryId: entry.id,
            oldTarget: entry.targetCartons,
            newTarget,
            reason: auditReason,
            changedBy: author,
          });
          entriesToModify.push({ id: entry.id, target: newTarget });
        }
      }

      if (overridesToCreate.length > 0) {
        await prisma.$transaction(
          async (tx) => {
            await tx.targetOverride.createMany({ data: overridesToCreate });

            const byTarget = new Map<number, string[]>();
            for (const item of entriesToModify) {
              const list = byTarget.get(item.target) || [];
              list.push(item.id);
              byTarget.set(item.target, list);
            }

            for (const [targetVal, ids] of byTarget.entries()) {
              await tx.mdOutputEntry.updateMany({
                where: { id: { in: ids } },
                data: {
                  customerType: custType,
                  targetCartons: targetVal,
                  targetSource: "OVERRIDE",
                },
              });
            }
          },
          { timeout: 25000, maxWait: 10000 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `MD Line ${lineNum} allocated to ${custType === "PVH" ? "PV" : "Other Customers"} successfully`,
        updatedCount: entriesToUpdate.length,
      });
    }

    // ─── 3. Batch Target Setup (Daily, Weekly, Monthly) ──────────────
    if (action === "BATCH_TARGET_UPDATE") {
      const {
        dates, // Array of YYYY-MM-DD
        mdLine, // 1 | 2 | 3 | "ALL"
        shift, // "MORNING" | "EVENING" | "ALL"
        customerType, // "PVH" | "OTHER" | "KEEP"
        targetMode, // "BASELINE" | "CUSTOM"
        customTarget, // number (normal slot target)
        customBreakTarget, // number
        customTeaTarget, // number
        reason,
        changedBy,
      } = body;

      if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return NextResponse.json(
          { error: "At least one target date must be specified" },
          { status: 400 }
        );
      }

      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { error: "Reason for target change is required for compliance" },
          { status: 400 }
        );
      }

      const activeTimeSlots = await prisma.mdTimeSlot.findMany({
        where: { isActive: true },
        orderBy: { sequenceNo: "asc" },
      });

      const { lineCustomerDefaults } = await getSystemSettings();
      const author = changedBy || session?.user?.name || session?.user?.username || "Admin";

      let totalUpdatedEntries = 0;
      let totalCreatedDays = 0;

      for (const dateStr of dates) {
        const workDate = new Date(dateStr + "T00:00:00.000Z");

        // Find or create work day
        let workDay = await prisma.workDay.findUnique({
          where: { workDate },
          include: { entries: { include: { timeSlot: true } } },
        });

        if (!workDay) {
          totalCreatedDays++;
          const defaultDuty = getDefaultShiftTeams(dateStr);

          workDay = await prisma.$transaction(async (tx) => {
            const newDay = await tx.workDay.create({
              data: {
                workDate,
                status: "OPEN",
                morningTeam: defaultDuty.morningTeam,
                eveningTeam: defaultDuty.eveningTeam,
                createdLines: [],
              },
            });

            const entryData = [];
            for (const l of MD_LINES) {
              const defaultLineCust = getDefaultCustomerType(l, lineCustomerDefaults);
              for (const slot of activeTimeSlots) {
                entryData.push({
                  workDayId: newDay.id,
                  timeSlotId: slot.id,
                  mdLine: l,
                  customerType: defaultLineCust,
                  targetCartons: getTargetForSlot(slot.sequenceNo, defaultLineCust),
                  targetSource: "DEFAULT" as const,
                  actualCartons: null,
                });
              }
            }
            await tx.mdOutputEntry.createMany({ data: entryData });

            return tx.workDay.findUnique({
              where: { id: newDay.id },
              include: { entries: { include: { timeSlot: true } } },
            });
          });
        }

        if (!workDay) continue;

        // Determine matching entries
        const targetLines = mdLine === "ALL" ? [1, 2, 3] : [Number(mdLine)];
        const targetShift = shift || "ALL";

        const matchingEntries = workDay.entries.filter((e) => {
          if (!targetLines.includes(e.mdLine)) return false;
          if (targetShift !== "ALL" && e.timeSlot.shift !== targetShift) return false;
          return true;
        });

        const overridesToCreate: Array<{
          outputEntryId: string;
          oldTarget: number;
          newTarget: number;
          reason: string;
          changedBy: string;
        }> = [];
        const updatesGrouped = new Map<string, { custType: CustomerTypeKey; target: number; ids: string[] }>();

        for (const entry of matchingEntries) {
          if (!entry.timeSlot) continue;
          // Determine Customer Type
          let newCustType: CustomerTypeKey = entry.customerType;
          if (customerType === "PVH" || customerType === "OTHER") {
            newCustType = customerType;
          }

          // Determine Target Cartons
          let newTarget = entry.targetCartons;
          const seq = entry.timeSlot.sequenceNo;
          const isBreakfast = seq === 3 || seq === 15;
          const isTea = seq === 7 || seq === 11;

          if (targetMode === "BASELINE") {
            newTarget = getTargetForSlot(seq, newCustType);
          } else if (targetMode === "CUSTOM" && customTarget !== undefined) {
            const baseNum = Number(customTarget);
            if (isBreakfast) {
              newTarget =
                customBreakTarget !== undefined
                  ? Number(customBreakTarget)
                  : Math.round(baseNum * (40 / 60));
            } else if (isTea) {
              newTarget =
                customTeaTarget !== undefined
                  ? Number(customTeaTarget)
                  : Math.round(baseNum * (45 / 60));
            } else {
              newTarget = baseNum;
            }
          }

          // Apply override if target or customer changed
          if (newTarget !== entry.targetCartons || newCustType !== entry.customerType) {
            overridesToCreate.push({
              outputEntryId: entry.id,
              oldTarget: entry.targetCartons,
              newTarget,
              reason: reason.trim(),
              changedBy: author,
            });

            const groupKey = `${newCustType}_${newTarget}`;
            const existingGroup = updatesGrouped.get(groupKey) || {
              custType: newCustType,
              target: newTarget,
              ids: [],
            };
            existingGroup.ids.push(entry.id);
            updatesGrouped.set(groupKey, existingGroup);

            totalUpdatedEntries++;
          }
        }

        if (overridesToCreate.length > 0) {
          await prisma.$transaction(
            async (tx) => {
              await tx.targetOverride.createMany({ data: overridesToCreate });

              for (const group of updatesGrouped.values()) {
                await tx.mdOutputEntry.updateMany({
                  where: { id: { in: group.ids } },
                  data: {
                    targetCartons: group.target,
                    customerType: group.custType,
                    targetSource: "OVERRIDE",
                  },
                });
              }
            },
            { timeout: 25000, maxWait: 10000 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully applied target updates across ${dates.length} days (${totalUpdatedEntries} slot entries updated)`,
        updatedDaysCount: dates.length,
        createdDaysCount: totalCreatedDays,
        updatedEntriesCount: totalUpdatedEntries,
      });
    }

    return NextResponse.json({ error: "Invalid action specified" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/targets error:", error);
    const message = error instanceof Error ? error.message : "Failed to process target request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/targets { entryId, newTarget, customerType, reason, changedBy }
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
    const { entryId, newTarget, customerType, reason, changedBy } = body;

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

    const result = await prisma.$transaction(
      async (tx) => {
        // Create override record
        await tx.targetOverride.create({
          data: {
            outputEntryId: entryId,
            oldTarget: entry.targetCartons,
            newTarget: Number(newTarget),
            reason: reason.trim(),
            changedBy: changedBy || session?.user?.name || session?.user?.username || "Admin",
          },
        });

        // Update the entry's target and optionally customerType
        const updateData: any = {
          targetCartons: Number(newTarget),
          targetSource: "OVERRIDE",
        };

        if (customerType === "PVH" || customerType === "OTHER") {
          updateData.customerType = customerType;
        }

        const updated = await tx.mdOutputEntry.update({
          where: { id: entryId },
          data: updateData,
          include: { timeSlot: true },
        });

        return updated;
      },
      { timeout: 15000, maxWait: 10000 }
    );

    return NextResponse.json({ entry: result });
  } catch (error) {
    console.error("PATCH /api/targets error:", error);
    return NextResponse.json({ error: "Failed to override target" }, { status: 500 });
  }
}
