// Seed script for MD Carton Output System
// Creates 16 time slots and a default admin user
// Run with: npm run db:init or npx tsx prisma/seed.ts

import prisma from "../src/lib/prisma";
import { Shift, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

// 16 time slots as per Section 2.3 of the documentation
const timeSlots = [
  // Morning Shift (8 slots)
  { shift: Shift.MORNING, startTime: "05:30", endTime: "06:30", sequenceNo: 1, defaultTarget: 120 },
  { shift: Shift.MORNING, startTime: "06:30", endTime: "07:30", sequenceNo: 2, defaultTarget: 120 },
  { shift: Shift.MORNING, startTime: "07:30", endTime: "08:30", sequenceNo: 3, defaultTarget: 80 },  // Breakfast
  { shift: Shift.MORNING, startTime: "08:30", endTime: "09:30", sequenceNo: 4, defaultTarget: 120 },
  { shift: Shift.MORNING, startTime: "09:30", endTime: "10:30", sequenceNo: 5, defaultTarget: 120 },
  { shift: Shift.MORNING, startTime: "10:30", endTime: "11:30", sequenceNo: 6, defaultTarget: 120 },
  { shift: Shift.MORNING, startTime: "11:30", endTime: "12:30", sequenceNo: 7, defaultTarget: 90 },  // Morning tea
  { shift: Shift.MORNING, startTime: "12:30", endTime: "13:30", sequenceNo: 8, defaultTarget: 120 },

  // Evening Shift (8 slots)
  { shift: Shift.EVENING, startTime: "13:30", endTime: "14:30", sequenceNo: 9,  defaultTarget: 120 },
  { shift: Shift.EVENING, startTime: "14:30", endTime: "15:30", sequenceNo: 10, defaultTarget: 120 },
  { shift: Shift.EVENING, startTime: "15:30", endTime: "16:30", sequenceNo: 11, defaultTarget: 90 },  // Evening tea
  { shift: Shift.EVENING, startTime: "16:30", endTime: "17:30", sequenceNo: 12, defaultTarget: 120 },
  { shift: Shift.EVENING, startTime: "17:30", endTime: "18:30", sequenceNo: 13, defaultTarget: 120 },
  { shift: Shift.EVENING, startTime: "18:30", endTime: "19:30", sequenceNo: 14, defaultTarget: 120 },
  { shift: Shift.EVENING, startTime: "19:30", endTime: "20:30", sequenceNo: 15, defaultTarget: 80 },  // Dinner
  { shift: Shift.EVENING, startTime: "20:30", endTime: "21:30", sequenceNo: 16, defaultTarget: 120 },
];

async function main() {
  console.log("🌱 Seeding database...");

  // Seed time slots
  console.log("  Creating 16 time slots...");
  for (const slot of timeSlots) {
    await prisma.mdTimeSlot.upsert({
      where: { sequenceNo: slot.sequenceNo },
      update: slot,
      create: slot,
    });
  }
  console.log("  ✅ Time slots created");

  // Seed default admin user
  console.log("  Creating default admin user...");
  const hashedPassword = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      displayPassword: "admin123",
    },
    create: {
      name: "System Admin",
      username: "admin",
      password: hashedPassword,
      displayPassword: "admin123",
      role: Role.ADMIN,
    },
  });
  console.log("  ✅ Admin user created (admin / admin123)");

  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
