// API: Admin — Audit logs and user management
// GET /api/admin/audit-logs?limit=50&action=UPDATE
// GET /api/admin/users
// POST /api/admin/users

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { getWeeklyRotationSchedules, getDefaultShiftTeams } from "@/lib/shift-rotation";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const role = session?.user?.role;
    if (!session?.user || (role !== "ADMIN" && role !== "MANAGER")) {
      return NextResponse.json(
        { error: "Access denied. Admin or Manager role required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "audit", "users", or "shifts"

    if (type === "settings") {
      const allSettings = await prisma.systemSetting.findMany();
      const settingsMap: Record<string, string> = {};
      for (const s of allSettings) {
        settingsMap[s.key] = s.value;
      }
      return NextResponse.json({
        settings: {
          showOverrideBadge: settingsMap["SHOW_OVERRIDE_BADGE"] !== "false",
        },
        raw: settingsMap,
      });
    }

    if (type === "shifts") {
      const dateParam = searchParams.get("date");
      const targetDate = dateParam || new Date();
      const schedules = getWeeklyRotationSchedules(targetDate, 1, 6);
      const startLimit = new Date(schedules[0].weekStart + "T00:00:00.000Z");
      const endLimit = new Date(schedules[schedules.length - 1].weekEnd + "T23:59:59.999Z");

      const existingDays = await prisma.workDay.findMany({
        where: {
          workDate: {
            gte: startLimit,
            lte: endLimit,
          },
        },
        select: {
          id: true,
          workDate: true,
          morningTeam: true,
          eveningTeam: true,
          status: true,
        },
        orderBy: { workDate: "asc" },
      });

      return NextResponse.json({ schedules, existingDays });
    }

    if (type === "users") {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          username: true,
          displayPassword: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ users });
    }

    // Default: audit logs
    const limit = parseInt(searchParams.get("limit") || "50");
    const action = searchParams.get("action");

    const where: any = {};
    if (action) where.action = action;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("GET /api/admin error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const currentRole = session?.user?.role;
    if (!session?.user || (currentRole !== "ADMIN" && currentRole !== "MANAGER")) {
      return NextResponse.json(
        { error: "Access denied. Admin or Manager role required." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // ─── System Settings Actions ─────────────────────────────────────
    if (body.action === "UPDATE_SETTING" || body.type === "settings") {
      const { key, value } = body;
      if (!key || typeof value === "undefined") {
        return NextResponse.json(
          { error: "key and value are required" },
          { status: 400 }
        );
      }

      const stringValue = String(value);

      const setting = await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: stringValue },
        update: { value: stringValue },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE",
          entityType: "SystemSetting",
          entityId: key,
          detailsJson: {
            settingKey: key,
            newValue: stringValue,
            performedBy: session.user.username,
          },
        },
      });

      return NextResponse.json({
        success: true,
        setting,
        showOverrideBadge: stringValue !== "false",
      });
    }

    // ─── Shift Rotation Actions ─────────────────────────────────────
    if (body.type === "shifts" || body.action === "SWAP_WEEK" || body.action === "OVERRIDE_DAY") {
      if (body.action === "SWAP_WEEK") {
        const { weekStart, weekEnd, morningTeam } = body;
        if (!weekStart || !weekEnd || (morningTeam !== "A" && morningTeam !== "B")) {
          return NextResponse.json(
            { error: "weekStart, weekEnd, and morningTeam ('A' or 'B') are required" },
            { status: 400 }
          );
        }
        const eveningTeam = morningTeam === "A" ? "B" : "A";

        const startDate = new Date(weekStart + "T00:00:00.000Z");
        const endDate = new Date(weekEnd + "T23:59:59.999Z");

        const updateResult = await prisma.workDay.updateMany({
          where: {
            workDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          data: {
            morningTeam,
            eveningTeam,
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "UPDATE",
            entityType: "ShiftRotation",
            entityId: `${weekStart}_${weekEnd}`,
            detailsJson: {
              action: "SWAP_WEEK",
              weekStart,
              weekEnd,
              morningTeam,
              eveningTeam,
              daysUpdated: updateResult.count,
              performedBy: session.user.username,
            },
          },
        });

        return NextResponse.json({
          success: true,
          updatedCount: updateResult.count,
          morningTeam,
          eveningTeam,
        });
      }

      if (body.action === "OVERRIDE_DAY") {
        const { date, morningTeam } = body;
        if (!date || (morningTeam !== "A" && morningTeam !== "B")) {
          return NextResponse.json(
            { error: "date and morningTeam ('A' or 'B') are required" },
            { status: 400 }
          );
        }
        const eveningTeam = morningTeam === "A" ? "B" : "A";
        const workDate = new Date(date + "T00:00:00.000Z");

        let workDay = await prisma.workDay.findUnique({ where: { workDate } });
        if (workDay) {
          workDay = await prisma.workDay.update({
            where: { id: workDay.id },
            data: { morningTeam, eveningTeam },
          });
        }

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "UPDATE",
            entityType: "ShiftRotation",
            entityId: date,
            detailsJson: {
              action: "OVERRIDE_DAY",
              date,
              morningTeam,
              eveningTeam,
              performedBy: session.user.username,
            },
          },
        });

        return NextResponse.json({ success: true, workDay });
      }
    }

    const { name, username, password, role } = body;

    if (!name || !username || !password) {
      return NextResponse.json(
        { error: "Name, username, and password are required" },
        { status: 400 }
      );
    }

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        username,
        password: hashedPassword,
        displayPassword: password,
        role: role || "OPERATOR",
      },
      select: {
        id: true,
        name: true,
        username: true,
        displayPassword: true,
        role: true,
        createdAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "User",
        entityId: user.id,
        detailsJson: { name, username, role: role || "OPERATOR" },
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    const currentRole = session?.user?.role;
    if (!session?.user || (currentRole !== "ADMIN" && currentRole !== "MANAGER")) {
      return NextResponse.json(
        { error: "Access denied. Admin or Manager role required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    let userId = searchParams.get("id");

    if (!userId) {
      try {
        const body = await request.json();
        userId = body.id;
      } catch {
        // no body
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Safety check 1: Prevent user from deleting their own active account
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own active account" },
        { status: 400 }
      );
    }

    // Find the target user
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Delete user from database
    await prisma.user.delete({
      where: { id: userId },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE",
        entityType: "User",
        entityId: userId,
        detailsJson: {
          name: targetUser.name,
          username: targetUser.username,
          role: targetUser.role,
          deletedBy: session.user.username,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `User "${targetUser.username}" removed successfully`,
    });
  } catch (error) {
    console.error("DELETE /api/admin error:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
