import { defineConfig } from "drizzle-kit";

const rawConnectionString = process.env.DATABASE_URL ?? process.env.PG_URL;

if (!rawConnectionString) {
  throw new Error("Missing DATABASE_URL or PG_URL for Drizzle.");
}

const connectionUrl = new URL(rawConnectionString);

connectionUrl.searchParams.delete("directConnection");

export default defineConfig({
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionUrl.toString(),
  },
  verbose: true,
  strict: true,
});
