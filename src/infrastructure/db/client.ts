import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import { schema } from "@/infrastructure/db/schema";

const globalForDatabase = globalThis as typeof globalThis & {
  postgresClient?: ReturnType<typeof postgres>;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

const client =
  globalForDatabase.postgresClient ??
  postgres(env.databaseUrl, {
    prepare: false,
  });

export const db =
  globalForDatabase.db ??
  drizzle({
    client,
    schema,
  });

if (env.nodeEnv !== "production") {
  globalForDatabase.postgresClient = client;
  globalForDatabase.db = db;
}
