import "dotenv/config";
import { defineConfig } from "prisma/config";

// Remove channel_binding=require which can cause issues with Prisma's query engine
const rawUrl = process.env.DATABASE_URL || "";
const dbUrl = rawUrl ? rawUrl.replace("&channel_binding=require", "") : "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(dbUrl ? { datasource: { url: dbUrl } } : {}),
});
