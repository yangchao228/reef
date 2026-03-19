import path from "node:path";

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

declare global {
  var __reefSql: ReturnType<typeof postgres> | undefined;
}

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://reef:reef@localhost:5432/reef";

export function getSql() {
  if (!globalThis.__reefSql) {
    globalThis.__reefSql = postgres(databaseUrl, {
      idle_timeout: 5,
      max: 1,
      prepare: false,
    });
  }

  return globalThis.__reefSql;
}
