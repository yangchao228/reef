import { randomUUID } from "node:crypto";
import crypto from "node:crypto";

import { createSqlClient } from "../../scripts/import-lib.mjs";
import { syncGitHubModule } from "./github.mjs";
import { buildSyncErrorPayload } from "./logging.mjs";

const DEFAULT_COMPENSATION_DEDUPE_WINDOW_MINUTES = 10;

function createCompensationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export function getCompensationTriggerScope({ moduleSlug = null, onlyFailed = false }) {
  if (moduleSlug) {
    return "module";
  }

  return onlyFailed ? "only_failed" : "all";
}

export function createCompensationAdvisoryLockKey(workspaceSlug) {
  const normalized = workspaceSlug.trim().toLowerCase();
  const digest = crypto.createHash("sha256").update(`reef:compensation:${normalized}`).digest("hex");
  const first16 = digest.slice(0, 16);
  const value = BigInt(`0x${first16}`);
  const maxSignedBigInt = BigInt("0x7fffffffffffffff");

  return value & maxSignedBigInt;
}

export function isCompensationGuardErrorCode(code) {
  return code === "COMPENSATION_ALREADY_RUNNING" || code === "COMPENSATION_RECENT_DUPLICATE";
}

async function acquireCompensationLock(sql, workspaceSlug) {
  const lockKey = createCompensationAdvisoryLockKey(workspaceSlug);
  const rows = await sql`
    SELECT pg_try_advisory_lock(${lockKey}) AS locked
  `;

  return {
    lockKey,
    locked: Boolean(rows[0]?.locked),
  };
}

async function releaseCompensationLock(sql, lockKey) {
  await sql`
    SELECT pg_advisory_unlock(${lockKey})
  `;
}

async function findRecentCompensationRun(sql, {
  workspaceSlug,
  moduleSlug,
  triggerScope,
  dedupeWindowMinutes,
}) {
  const rows = await sql`
    SELECT
      sl.compensation_run_id,
      sl.started_at,
      rr.slug AS module_slug
    FROM sync_logs sl
    JOIN workspaces w ON w.id = sl.workspace_id
    JOIN repo_registry rr ON rr.id = sl.repo_id AND rr.workspace_id = sl.workspace_id
    WHERE w.slug = ${workspaceSlug}
      AND sl.compensation_run_id IS NOT NULL
      AND sl.trigger_type = 'cron'
      AND sl.trigger_scope = ${triggerScope}
      AND sl.started_at >= NOW() - (${dedupeWindowMinutes}::text || ' minutes')::interval
      AND (${moduleSlug ?? null}::text IS NULL OR rr.slug = ${moduleSlug ?? null})
    ORDER BY sl.started_at DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function listCompensationTargets(sql, {
  workspaceSlug,
  moduleSlug,
  onlyFailed,
  limit,
}) {
  const rows = await sql`
    SELECT
      rr.id AS repo_id,
      rr.workspace_id,
      rr.slug AS module_slug,
      rr.name AS module_name,
      rr.display_type,
      rr.github_owner,
      rr.github_repo,
      rr.meta->>'source' AS source,
      rr.meta->>'branch' AS branch,
      rr.watch_paths,
      recent_sync.status AS recent_status,
      recent_sync.started_at AS recent_started_at
    FROM repo_registry rr
    JOIN workspaces w ON w.id = rr.workspace_id
    LEFT JOIN LATERAL (
      SELECT sl.status, sl.started_at
      FROM sync_logs sl
      WHERE sl.repo_id = rr.id
        AND sl.workspace_id = rr.workspace_id
      ORDER BY sl.started_at DESC
      LIMIT 1
    ) recent_sync ON true
    WHERE w.slug = ${workspaceSlug}
      AND w.archived_at IS NULL
      AND (${moduleSlug ?? null}::text IS NULL OR rr.slug = ${moduleSlug ?? null})
      AND (${onlyFailed}::boolean = false OR recent_sync.status = 'failed')
    ORDER BY
      CASE WHEN recent_sync.status = 'failed' THEN 0 ELSE 1 END,
      rr.sort_order ASC,
      rr.name ASC
    LIMIT ${limit ?? 100}
  `;

  return rows;
}

export async function runWorkspaceCompensationSync({
  workspaceSlug,
  moduleSlug = null,
  onlyFailed = false,
  purgeMissing = true,
  limit = 100,
  dedupeWindowMinutes = DEFAULT_COMPENSATION_DEDUPE_WINDOW_MINUTES,
  sqlClient,
}) {
  const rootSql = sqlClient ?? createSqlClient();
  const shouldCloseRootSql = !sqlClient;
  const sql = !sqlClient && typeof rootSql.reserve === "function"
    ? await rootSql.reserve()
    : rootSql;
  const shouldReleaseReservedSql = sql !== rootSql && typeof sql.release === "function";
  const triggerScope = getCompensationTriggerScope({ moduleSlug, onlyFailed });
  const lock = await acquireCompensationLock(sql, workspaceSlug);

  if (!lock.locked) {
    if (shouldReleaseReservedSql) {
      await sql.release();
    }
    if (shouldCloseRootSql) {
      await rootSql.end();
    }
    throw createCompensationError(
      "COMPENSATION_ALREADY_RUNNING",
      `workspace "${workspaceSlug}" 当前已有补偿同步在执行中。`,
      {
        workspaceSlug,
      },
    );
  }

  try {
    const recentRun = await findRecentCompensationRun(sql, {
      workspaceSlug,
      moduleSlug,
      triggerScope,
      dedupeWindowMinutes,
    });

    if (recentRun) {
      throw createCompensationError(
        "COMPENSATION_RECENT_DUPLICATE",
        `workspace "${workspaceSlug}" 在 ${dedupeWindowMinutes} 分钟内已经执行过同范围补偿。`,
        {
          workspaceSlug,
          moduleSlug,
          triggerScope,
          dedupeWindowMinutes,
          compensationRunId: recentRun.compensation_run_id,
          startedAt: recentRun.started_at,
        },
      );
    }

    const targets = await listCompensationTargets(sql, {
      workspaceSlug,
      moduleSlug,
      onlyFailed,
      limit,
    });

    let attempted = 0;
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    const events = [];
    const compensationRunId = randomUUID();

    for (const target of targets) {
      const source = target.source?.trim() || null;
      const looksLikeLocalFixture =
        target.github_owner === "local" && target.github_repo === target.module_slug;

      if (source !== "github" && source !== null) {
        skipped += 1;
        events.push({
          moduleSlug: target.module_slug,
          status: "skipped",
          code: "SOURCE_NOT_ELIGIBLE",
          message: `source=${source} is not eligible for GitHub compensation sync.`,
          failureCategory: "repo_config_invalid",
          recoveryAction: "inspect_sync_log",
          isRetryable: false,
          operatorSummary:
            "当前模块不是 GitHub 主链同步目标，补偿同步会跳过。请先确认模块来源配置。",
        });
        continue;
      }

      if (!source && looksLikeLocalFixture) {
        skipped += 1;
        events.push({
          moduleSlug: target.module_slug,
          status: "skipped",
          code: "LOCAL_FIXTURE_SKIPPED",
          message: "local fixture repo is not eligible for GitHub compensation sync.",
          failureCategory: "repo_config_invalid",
          recoveryAction: "inspect_sync_log",
          isRetryable: false,
          operatorSummary:
            "当前模块属于本地 fixture/导入模块，不应进入 GitHub 补偿主链。",
        });
        continue;
      }

      const watchPaths = target.watch_paths ?? [];
      if (watchPaths.length === 0) {
        skipped += 1;
        events.push({
          moduleSlug: target.module_slug,
          status: "skipped",
          code: "WATCH_PATHS_EMPTY",
          message: "watch paths are empty.",
          failureCategory: "watch_paths_invalid",
          recoveryAction: "check_module_sync_config",
          isRetryable: false,
          operatorSummary:
            "当前模块缺少 watch paths，补偿同步已跳过。请先补齐模块同步配置。",
        });
        continue;
      }

      attempted += 1;

      try {
        const result = await syncGitHubModule({
          moduleSlug: target.module_slug,
          moduleName: target.module_name,
          displayType: target.display_type,
          owner: target.github_owner,
          repo: target.github_repo,
          branch: target.branch?.trim() || "main",
          watchPaths,
          purgeMissing,
          triggerType: "cron",
          triggerScope,
          existingRepoId: target.repo_id,
          existingWorkspaceId: target.workspace_id,
          targetWorkspaceSlug: workspaceSlug,
          compensationRunId,
          sqlClient: sql,
        });
        completed += 1;
        events.push({
          moduleSlug: target.module_slug,
          status: "completed",
          message: `synced ${result.importedCount} markdown files via ${result.authSource}.`,
        });
      } catch (error) {
        const errorPayload = buildSyncErrorPayload(error);
        failed += 1;
        events.push({
          moduleSlug: target.module_slug,
          status: "failed",
          code: errorPayload.code,
          message: errorPayload.message,
          failureCategory: errorPayload.failureCategory,
          recoveryAction: errorPayload.recoveryAction,
          isRetryable: errorPayload.isRetryable,
          operatorSummary: errorPayload.operatorSummary,
        });
      }
    }

    return {
      compensationRunId,
      workspaceSlug,
      triggerScope,
      dedupeWindowMinutes,
      attempted,
      completed,
      failed,
      skipped,
      scanned: targets.length,
      events,
    };
  } finally {
    await releaseCompensationLock(sql, lock.lockKey).catch(() => {});
    if (shouldReleaseReservedSql) {
      await sql.release();
    }
    if (shouldCloseRootSql) {
      await rootSql.end();
    }
  }
}
