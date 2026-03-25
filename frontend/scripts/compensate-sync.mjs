import path from "node:path";

import dotenv from "dotenv";

import {
  getTargetWorkspaceSlug,
  parseArgs,
} from "./import-lib.mjs";
import {
  isCompensationGuardErrorCode,
  runWorkspaceCompensationSync,
} from "../lib/sync/compensation.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function parseBooleanFlag(value) {
  if (value == null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || normalized === "true" || normalized === "1" || normalized === "yes";
}

function parsePositiveInteger(value) {
  if (value == null) {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceSlug = args.workspace?.trim() || getTargetWorkspaceSlug();
  const moduleSlug = args.module?.trim() || null;
  const onlyFailed = parseBooleanFlag(args["only-failed"]);
  const purgeMissing = args["purge-missing"] == null
    ? true
    : parseBooleanFlag(args["purge-missing"]);
  const limit = parsePositiveInteger(args.limit) ?? 100;
  const dedupeWindowMinutes = parsePositiveInteger(args["dedupe-window-minutes"]) ?? 10;

  const summary = await runWorkspaceCompensationSync({
    workspaceSlug,
    moduleSlug,
    onlyFailed,
    purgeMissing,
    limit,
    dedupeWindowMinutes,
  });

  if (summary.scanned === 0) {
    console.log(`No compensation targets found in workspace "${workspaceSlug}".`);
    return;
  }

  for (const event of summary.events) {
    const prefix =
      event.status === "completed"
        ? "[done]"
        : event.status === "failed"
        ? "[fail]"
        : "[skip]";
    const message =
      event.status === "failed" && event.code
        ? `${event.code} ${event.message}`
        : event.message;
    const stream = event.status === "failed" ? console.error : console.log;
    stream(`${prefix} ${event.moduleSlug}: ${message}`);
  }

  console.log(
    `Compensation sync summary for "${workspaceSlug}" (${summary.compensationRunId}): attempted=${summary.attempted}, completed=${summary.completed}, failed=${summary.failed}, skipped=${summary.skipped}.`,
  );

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const errorCode =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : "SYNC_FAILED";
  if (isCompensationGuardErrorCode(errorCode)) {
    console.log(`[skip] ${error.message}`);
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});
