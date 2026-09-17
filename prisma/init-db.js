const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { neonConfig } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

neonConfig.webSocketConstructor = globalThis.WebSocket;

async function initDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set!');
  }

  console.log('Connecting to Neon PostgreSQL via PrismaNeon...');
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('📦 Step 1: Creating Enums and Types...');

    const enums = [
      `DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN CREATE TYPE "DayStatus" AS ENUM ('OPEN', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN CREATE TYPE "Shift" AS ENUM ('MORNING', 'EVENING'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
      `DO $$ BEGIN CREATE TYPE "TargetSource" AS ENUM ('DEFAULT', 'OVERRIDE'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    ];

    for (const sql of enums) {
      await prisma.$executeRawUnsafe(sql);
    }
    console.log('  ✅ Enums verified/created');

    console.log('📦 Step 2: Creating Tables...');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'OPERATOR',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "work_days" (
        "id" TEXT NOT NULL,
        "work_date" DATE NOT NULL,
        "status" "DayStatus" NOT NULL DEFAULT 'OPEN',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "work_days_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "md_time_slots" (
        "id" TEXT NOT NULL,
        "shift" "Shift" NOT NULL,
        "start_time" TEXT NOT NULL,
        "end_time" TEXT NOT NULL,
        "sequence_no" INTEGER NOT NULL,
        "default_target" INTEGER NOT NULL DEFAULT 120,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT "md_time_slots_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "md_output_entries" (
        "id" TEXT NOT NULL,
        "work_day_id" TEXT NOT NULL,
        "time_slot_id" TEXT NOT NULL,
        "actual_cartons" INTEGER,
        "target_cartons" INTEGER NOT NULL,
        "target_source" "TargetSource" NOT NULL DEFAULT 'DEFAULT',
        "entered_by" TEXT,
        "entered_at" TIMESTAMP(3),
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "md_output_entries_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "target_overrides" (
        "id" TEXT NOT NULL,
        "output_entry_id" TEXT NOT NULL,
        "old_target" INTEGER NOT NULL,
        "new_target" INTEGER NOT NULL,
        "reason" TEXT NOT NULL,
        "changed_by" TEXT NOT NULL,
        "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "target_overrides_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" TEXT NOT NULL,
        "user_id" TEXT,
        "action" TEXT NOT NULL,
        "entity_type" TEXT NOT NULL,
        "entity_id" TEXT NOT NULL,
        "details_json" JSONB,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('  ✅ Tables created');

    console.log('📦 Step 3: Creating Indexes and Foreign Keys...');

    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "work_days_work_date_key" ON "work_days"("work_date");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "md_time_slots_sequence_no_key" ON "md_time_slots"("sequence_no");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "md_output_entries_work_day_id_time_slot_id_key" ON "md_output_entries"("work_day_id", "time_slot_id");`);

    // Foreign keys (safely added if not present)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'md_output_entries_work_day_id_fkey') THEN
          ALTER TABLE "md_output_entries" ADD CONSTRAINT "md_output_entries_work_day_id_fkey" FOREIGN KEY ("work_day_id") REFERENCES "work_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'md_output_entries_time_slot_id_fkey') THEN
          ALTER TABLE "md_output_entries" ADD CONSTRAINT "md_output_entries_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "md_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_overrides_output_entry_id_fkey') THEN
          ALTER TABLE "target_overrides" ADD CONSTRAINT "target_overrides_output_entry_id_fkey" FOREIGN KEY ("output_entry_id") REFERENCES "md_output_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    console.log('  ✅ Indexes and Foreign Keys established');

    console.log('🌱 Step 4: Seeding 16 Time Slots...');
    const timeSlots = [
      { shift: 'MORNING', startTime: '05:30', endTime: '06:30', sequenceNo: 1, defaultTarget: 120 },
      { shift: 'MORNING', startTime: '06:30', endTime: '07:30', sequenceNo: 2, defaultTarget: 120 },
      { shift: 'MORNING', startTime: '07:30', endTime: '08:30', sequenceNo: 3, defaultTarget: 80 },  // Breakfast
      { shift: 'MORNING', startTime: '08:30', endTime: '09:30', sequenceNo: 4, defaultTarget: 120 },
      { shift: 'MORNING', startTime: '09:30', endTime: '10:30', sequenceNo: 5, defaultTarget: 120 },
      { shift: 'MORNING', startTime: '10:30', endTime: '11:30', sequenceNo: 6, defaultTarget: 120 },
      { shift: 'MORNING', startTime: '11:30', endTime: '12:30', sequenceNo: 7, defaultTarget: 90 },  // Morning tea
      { shift: 'MORNING', startTime: '12:30', endTime: '13:30', sequenceNo: 8, defaultTarget: 120 },

      { shift: 'EVENING', startTime: '13:30', endTime: '14:30', sequenceNo: 9, defaultTarget: 120 },
      { shift: 'EVENING', startTime: '14:30', endTime: '15:30', sequenceNo: 10, defaultTarget: 120 },
      { shift: 'EVENING', startTime: '15:30', endTime: '16:30', sequenceNo: 11, defaultTarget: 90 },  // Evening tea
      { shift: 'EVENING', startTime: '16:30', endTime: '17:30', sequenceNo: 12, defaultTarget: 120 },
      { shift: 'EVENING', startTime: '17:30', endTime: '18:30', sequenceNo: 13, defaultTarget: 120 },
      { shift: 'EVENING', startTime: '18:30', endTime: '19:30', sequenceNo: 14, defaultTarget: 120 },
      { shift: 'EVENING', startTime: '19:30', endTime: '20:30', sequenceNo: 15, defaultTarget: 80 },  // Dinner
      { shift: 'EVENING', startTime: '20:30', endTime: '21:30', sequenceNo: 16, defaultTarget: 120 },
    ];

    for (const slot of timeSlots) {
      await prisma.mdTimeSlot.upsert({
        where: { sequenceNo: slot.sequenceNo },
        update: slot,
        create: slot,
      });
    }
    console.log('  ✅ 16 Time slots seeded successfully');

    console.log('🌱 Step 5: Seeding Default Admin User...');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        name: 'System Admin',
        username: 'admin',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log('  ✅ Default Admin user created (username: admin, password: admin123)');

    console.log('🔍 Step 6: Verifying Tables & Records...');
    const slotCount = await prisma.mdTimeSlot.count();
    const userCount = await prisma.user.count();
    console.log(`  📊 Verification: ${slotCount} time slots, ${userCount} users in database`);

    console.log('🎉 Database initialization completed successfully!');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

initDatabase();
