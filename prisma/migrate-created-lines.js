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

async function main() {
  try {
    console.log('Adding created_lines column to work_days table...');
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "work_days" ADD COLUMN IF NOT EXISTS "created_lines" INTEGER[] DEFAULT '{}';
      END $$;
    `);
    console.log('Column created_lines added or verified.');

    // For existing work days that already have entries, mark all lines 1, 2, 3 as created
    console.log('Backfilling existing work days with created_lines = [1, 2, 3]...');
    const updated = await prisma.$executeRawUnsafe(`
      UPDATE "work_days"
      SET "created_lines" = ARRAY[1, 2, 3]
      WHERE "created_lines" IS NULL OR array_length("created_lines", 1) IS NULL;
    `);
    console.log(`Updated ${updated} work days with created_lines = [1, 2, 3].`);

    const days = await prisma.workDay.findMany({
      select: { id: true, workDate: true, createdLines: true },
      take: 10,
    });
    console.log('Sample work days in DB:', days);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
