// API: Seed — Initialize database with time slots and admin user
// POST /api/seed (call once after migration)

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

const timeSlots = [
  { shift: "MORNING" as const, startTime: "05:30", endTime: "06:30", sequenceNo: 1, defaultTarget: 120 },
  { shift: "MORNING" as const, startTime: "06:30", endTime: "07:30", sequenceNo: 2, defaultTarget: 120 },
  { shift: "MORNING" as const, startTime: "07:30", endTime: "08:30", sequenceNo: 3, defaultTarget: 80 },
  { shift: "MORNING" as const, startTime: "08:30", endTime: "09:30", sequenceNo: 4, defaultTarget: 120 },
  { shift: "MORNING" as const, startTime: "09:30", endTime: "10:30", sequenceNo: 5, defaultTarget: 120 },
  { shift: "MORNING" as const, startTime: "10:30", endTime: "11:30", sequenceNo: 6, defaultTarget: 120 },
  { shift: "MORNING" as const, startTime: "11:30", endTime: "12:30", sequenceNo: 7, defaultTarget: 90 },
  { shift: "MORNING" as const, startTime: "12:30", endTime: "13:30", sequenceNo: 8, defaultTarget: 120 },
  { shift: "EVENING" as const, startTime: "13:30", endTime: "14:30", sequenceNo: 9, defaultTarget: 120 },
  { shift: "EVENING" as const, startTime: "14:30", endTime: "15:30", sequenceNo: 10, defaultTarget: 120 },
  { shift: "EVENING" as const, startTime: "15:30", endTime: "16:30", sequenceNo: 11, defaultTarget: 90 },
  { shift: "EVENING" as const, startTime: "16:30", endTime: "17:30", sequenceNo: 12, defaultTarget: 120 },
  { shift: "EVENING" as const, startTime: "17:30", endTime: "18:30", sequenceNo: 13, defaultTarget: 120 },
  { shift: "EVENING" as const, startTime: "18:30", endTime: "19:30", sequenceNo: 14, defaultTarget: 120 },
  { shift: "EVENING" as const, startTime: "19:30", endTime: "20:30", sequenceNo: 15, defaultTarget: 80 },
  { shift: "EVENING" as const, startTime: "20:30", endTime: "21:30", sequenceNo: 16, defaultTarget: 120 },
];

export async function POST() {
  try {
    // Seed time slots
    for (const slot of timeSlots) {
      await prisma.mdTimeSlot.upsert({
        where: { sequenceNo: slot.sequenceNo },
        update: slot,
        create: slot,
      });
    }

    // Seed admin user
    const hashedPassword = await bcrypt.hash("admin123", 12);
    await prisma.user.upsert({
      where: { username: "admin" },
      update: {},
      create: {
        name: "System Admin",
        username: "admin",
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    return NextResponse.json({
      message: "Database seeded successfully",
      timeSlotsCreated: timeSlots.length,
      adminUser: "admin / admin123",
    });
  } catch (error) {
    console.error("POST /api/seed error:", error);
    return NextResponse.json(
      { error: "Failed to seed database" },
      { status: 500 }
    );
  }
}
