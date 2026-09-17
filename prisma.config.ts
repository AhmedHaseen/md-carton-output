import "dotenv/config";
import { defineConfig } from "prisma/config";

// Remove channel_binding=require which can cause issues with Prisma's query engine
const dbUrl = process.env.DATABASE_URL!.replace("&channel_binding=require", "");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: dbUrl,
  },
});
