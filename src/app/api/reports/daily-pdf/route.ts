// API: Reports — Daily PDF generation
// GET /api/reports/daily-pdf?date=2026-09-15

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");

    if (!dateStr) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const workDay = await prisma.workDay.findUnique({
      where: { workDate: new Date(dateStr + "T00:00:00.000Z") },
      include: {
        entries: {
          include: { timeSlot: true },
          orderBy: { timeSlot: { sequenceNo: "asc" } },
        },
      },
    });

    if (!workDay) {
      return NextResponse.json({ error: "No data found for this date" }, { status: 404 });
    }

    // Return structured data for client-side PDF generation
    // (jsPDF runs on the client for simpler setup)
    const morningEntries = workDay.entries.filter(
      (e) => e.timeSlot.shift === "MORNING"
    );
    const eveningEntries = workDay.entries.filter(
      (e) => e.timeSlot.shift === "EVENING"
    );

    const completedEntries = workDay.entries.filter(
      (e) => e.actualCartons !== null
    );
    const totalActual = completedEntries.reduce(
      (sum, e) => sum + (e.actualCartons ?? 0),
      0
    );
    const totalTarget = workDay.entries.reduce(
      (sum, e) => sum + e.targetCartons,
      0
    );

    const morningActual = morningEntries
      .filter((e) => e.actualCartons !== null)
      .reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
    const morningTarget = morningEntries.reduce(
      (sum, e) => sum + e.targetCartons,
      0
    );
    const eveningActual = eveningEntries
      .filter((e) => e.actualCartons !== null)
      .reduce((sum, e) => sum + (e.actualCartons ?? 0), 0);
    const eveningTarget = eveningEntries.reduce(
      (sum, e) => sum + e.targetCartons,
      0
    );

    // Build cumulative values separately per shift
    let morningCumulative = 0;
    let eveningCumulative = 0;
    const entriesWithCumulative = workDay.entries.map((e) => {
      let cumulative: number | null = null;
      if (e.actualCartons !== null) {
        if (e.timeSlot.shift === "MORNING") {
          morningCumulative += e.actualCartons;
          cumulative = morningCumulative;
        } else {
          eveningCumulative += e.actualCartons;
          cumulative = eveningCumulative;
        }
      }
      return {
        shift: e.timeSlot.shift,
        startTime: e.timeSlot.startTime,
        endTime: e.timeSlot.endTime,
        target: e.targetCartons,
        actual: e.actualCartons,
        variance:
          e.actualCartons !== null
            ? e.actualCartons - e.targetCartons
            : null,
        cumulative,
        targetSource: e.targetSource,
      };
    });

    return NextResponse.json({
      date: dateStr,
      status: workDay.status,
      kpis: {
        totalActual,
        totalTarget,
        achievementPercent:
          totalTarget > 0
            ? Math.round((totalActual / totalTarget) * 100 * 10) / 10
            : 0,
        totalVariance: totalActual - totalTarget,
        completedSlots: completedEntries.length,
        totalSlots: workDay.entries.length,
        morningActual,
        morningTarget,
        eveningActual,
        eveningTarget,
      },
      entries: entriesWithCumulative,
    });
  } catch (error) {
    console.error("GET /api/reports/daily-pdf error:", error);
    return NextResponse.json(
      { error: "Failed to generate report data" },
      { status: 500 }
    );
  }
}
