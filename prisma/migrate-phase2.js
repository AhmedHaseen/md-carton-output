const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { neonConfig } = require('@neondatabase/serverless');
require('dotenv').config();

neonConfig.webSocketConstructor = globalThis.WebSocket;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is missing!');
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString: url });
const prisma = new PrismaClient({ adapter });

// Target config for backfilling
const BREAKFAST_SLOTS = [3, 15];
const TEA_SLOTS = [7, 11];

function getTarget(seq, customerType) {
  if (customerType === 'PVH') {
    if (BREAKFAST_SLOTS.includes(seq)) return 80;
    if (TEA_SLOTS.includes(seq)) return 90;
    return 120;
  } else {
    if (BREAKFAST_SLOTS.includes(seq)) return 15;
    if (TEA_SLOTS.includes(seq)) return 20;
    return 25;
  }
}

async function migrateAndBackfill() {
  try {
    console.log('🚀 Phase 2 Database Migration Starting...');

    // 1. Create Enum
    console.log('Step 1: Creating CustomerType enum if not exists...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN 
        CREATE TYPE "CustomerType" AS ENUM ('PVH', 'OTHER'); 
      EXCEPTION WHEN duplicate_object THEN null; 
      END $$;
    `);
    console.log('  ✅ CustomerType enum verified');

    // 2. Add columns
    console.log('Step 2: Adding md_line and customer_type columns...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "md_output_entries" ADD COLUMN IF NOT EXISTS "md_line" INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE "md_output_entries" ADD COLUMN IF NOT EXISTS "customer_type" "CustomerType" NOT NULL DEFAULT 'PVH';
      END $$;
    `);
    console.log('  ✅ Columns added or verified');

    // 3. Update unique index
    console.log('Step 3: Updating unique index...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "md_output_entries" DROP CONSTRAINT IF EXISTS "md_output_entries_work_day_id_time_slot_id_key";
      EXCEPTION WHEN OTHERS THEN null;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "md_output_entries_work_day_id_time_slot_id_key";`);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "md_output_entries_work_day_id_time_slot_id_md_line_key" 
      ON "md_output_entries"("work_day_id", "time_slot_id", "md_line");
    `);
    console.log('  ✅ Unique index updated for 3 MD lines');

    // 4. Backfill existing work days with MD Line 2 and Line 3
    console.log('Step 4: Checking existing work days to backfill MD Line 2 & 3...');
    const workDays = await prisma.workDay.findMany({
      include: {
        entries: {
          select: { id: true, mdLine: true, timeSlotId: true }
        }
      }
    });

    const timeSlots = await prisma.mdTimeSlot.findMany({
      orderBy: { sequenceNo: 'asc' }
    });

    console.log(`  Found ${workDays.length} work days in database.`);

    let backfilledCount = 0;
    for (const wd of workDays) {
      const existingLines = new Set(wd.entries.map(e => e.mdLine));
      
      // Check Line 2
      if (!existingLines.has(2)) {
        console.log(`  Backfilling MD Line 2 for work day ${wd.workDate.toISOString().slice(0, 10)}...`);
        const line2Entries = timeSlots.map(slot => ({
          workDayId: wd.id,
          timeSlotId: slot.id,
          mdLine: 2,
          customerType: 'PVH',
          targetCartons: getTarget(slot.sequenceNo, 'PVH'),
          targetSource: 'DEFAULT',
          actualCartons: null,
        }));
        await prisma.mdOutputEntry.createMany({ data: line2Entries });
        backfilledCount += line2Entries.length;
      }

      // Check Line 3
      if (!existingLines.has(3)) {
        console.log(`  Backfilling MD Line 3 for work day ${wd.workDate.toISOString().slice(0, 10)}...`);
        const line3Entries = timeSlots.map(slot => ({
          workDayId: wd.id,
          timeSlotId: slot.id,
          mdLine: 3,
          customerType: 'OTHER',
          targetCartons: getTarget(slot.sequenceNo, 'OTHER'),
          targetSource: 'DEFAULT',
          actualCartons: null,
        }));
        await prisma.mdOutputEntry.createMany({ data: line3Entries });
        backfilledCount += line3Entries.length;
      }
    }

    console.log(`  ✅ Backfilled ${backfilledCount} entries for existing work days.`);
    console.log('🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

migrateAndBackfill();
