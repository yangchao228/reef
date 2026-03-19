import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import { createSqlClient } from "./import-lib.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

async function main() {
  const sql = createSqlClient();
  const schemaPath = path.resolve(process.cwd(), "db/init/001_schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  await sql.unsafe(schemaSql);
  await sql.end();

  console.log(`Initialized database schema from ${schemaPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
