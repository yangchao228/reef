import path from "node:path";

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

declare global {
  var __reefSql: ReturnType<typeof postgres> | undefined;
  var __reefSqlDatabaseUrl: string | undefined;
}

function resolveDatabaseUrl() {
  return process.env.DATABASE_URL ?? "postgres://reef:reef@localhost:5432/reef";
}

function normalizeWorkspaceSlug(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export function getSql() {
  const databaseUrl = resolveDatabaseUrl();
  if (!globalThis.__reefSql || globalThis.__reefSqlDatabaseUrl !== databaseUrl) {
    globalThis.__reefSqlDatabaseUrl = databaseUrl;
    globalThis.__reefSql = postgres(databaseUrl, {
      idle_timeout: 5,
      max: 1,
      prepare: false,
    });
  }

  return globalThis.__reefSql;
}

export function getConfiguredWorkspaceSlug() {
  return normalizeWorkspaceSlug(process.env.REEF_WORKSPACE_SLUG);
}

export function getTargetWorkspaceSlug() {
  const workspaceSlug = getConfiguredWorkspaceSlug();
  if (!workspaceSlug) {
    throw new Error("REEF_WORKSPACE_SLUG_MISSING");
  }

  return workspaceSlug;
}
