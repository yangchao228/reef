import { getSql } from "@/lib/db";
import { parseStoredSyncErrorDetail } from "@/lib/sync/logging.mjs";
import {
  AdminModuleBindingRecord,
  GitHubAppInstallationSummary,
} from "@/lib/types";

async function getWorkspaceRecord(workspaceSlug: string) {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM workspaces
    WHERE slug = ${workspaceSlug}
      AND archived_at IS NULL
    LIMIT 1
  `;

  return rows[0] ?? null;
}

function mapInstallationRow(row: {
  id: string;
  github_installation_id: number | string;
  github_account_login: string;
  github_account_type: "user" | "organization";
  permissions: Record<string, unknown> | null;
  events: string[] | null;
  updated_at: string | Date;
}): GitHubAppInstallationSummary {
  return {
    id: row.id,
    githubInstallationId: Number(row.github_installation_id),
    githubAccountLogin: row.github_account_login,
    githubAccountType: row.github_account_type,
    permissions: row.permissions ?? {},
    events: row.events ?? [],
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export class AdminSettingsError extends Error {
  constructor(
    public readonly code:
      | "WORKSPACE_NOT_FOUND"
      | "INSTALLATION_CONFLICT"
      | "INSTALLATION_NOT_FOUND"
      | "MODULE_NOT_FOUND"
      | "MODULE_SYNC_CONFIG_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "AdminSettingsError";
  }
}

export async function listWorkspaceGitHubInstallations(workspaceSlug: string) {
  const sql = getSql();
  const rows = await sql<{
    id: string;
    github_installation_id: number | string;
    github_account_login: string;
    github_account_type: "user" | "organization";
    permissions: Record<string, unknown> | null;
    events: string[] | null;
    updated_at: string | Date;
  }[]>`
    SELECT
      gai.id,
      gai.github_installation_id,
      gai.github_account_login,
      gai.github_account_type,
      gai.permissions,
      gai.events,
      gai.updated_at
    FROM github_app_installations gai
    JOIN workspaces w ON w.id = gai.workspace_id
    WHERE w.slug = ${workspaceSlug}
      AND w.archived_at IS NULL
    ORDER BY gai.updated_at DESC, gai.github_account_login ASC
  `;

  return rows.map(mapInstallationRow);
}

export async function listWorkspaceModuleBindings(workspaceSlug: string) {
  const sql = getSql();
  const rows = await sql<{
    id: string;
    slug: string;
    name: string;
    github_owner: string;
    github_repo: string;
    branch: string | null;
    watch_paths: string[] | null;
    sync_status: "pending" | "completed" | "failed" | null;
    sync_trigger_type: "webhook" | "cron" | "manual" | null;
    sync_error_detail: string | null;
    sync_failure_category: string | null;
    sync_recovery_action: string | null;
    sync_compensation_run_id: string | null;
    sync_is_retryable: boolean | null;
    sync_operator_summary: string | null;
    sync_started_at: string | Date | null;
    sync_finished_at: string | Date | null;
    installation_id: string | null;
    github_installation_id: number | string | null;
    github_account_login: string | null;
  }[]>`
    SELECT
      rr.id,
      rr.slug,
      rr.name,
      rr.github_owner,
      rr.github_repo,
      rr.meta->>'branch' AS branch,
      rr.watch_paths,
      sl.status AS sync_status,
      sl.trigger_type AS sync_trigger_type,
      sl.error_detail AS sync_error_detail,
      sl.failure_category AS sync_failure_category,
      sl.recovery_action AS sync_recovery_action,
      sl.compensation_run_id AS sync_compensation_run_id,
      sl.is_retryable AS sync_is_retryable,
      sl.operator_summary AS sync_operator_summary,
      sl.started_at AS sync_started_at,
      sl.finished_at AS sync_finished_at,
      gai.id AS installation_id,
      gai.github_installation_id,
      gai.github_account_login
    FROM repo_registry rr
    JOIN workspaces w ON w.id = rr.workspace_id
    LEFT JOIN LATERAL (
      SELECT
        sl.status,
        sl.trigger_type,
        sl.error_detail,
        sl.failure_category,
        sl.recovery_action,
        sl.compensation_run_id,
        sl.is_retryable,
        sl.operator_summary,
        sl.started_at,
        sl.finished_at
      FROM sync_logs sl
      WHERE sl.repo_id = rr.id
        AND sl.workspace_id = rr.workspace_id
      ORDER BY sl.started_at DESC
      LIMIT 1
    ) sl ON true
    LEFT JOIN github_app_installations gai
      ON gai.id = rr.github_app_installation_id
     AND gai.workspace_id = rr.workspace_id
    WHERE w.slug = ${workspaceSlug}
      AND w.archived_at IS NULL
    ORDER BY rr.sort_order ASC, rr.name ASC
  `;

  return rows.map(
    (row): AdminModuleBindingRecord => {
      const parsedSyncError = parseStoredSyncErrorDetail(row.sync_error_detail);

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        githubOwner: row.github_owner,
        githubRepo: row.github_repo,
        branch: row.branch?.trim() || "main",
        watchPaths: row.watch_paths ?? [],
        recentSync:
          row.sync_status && row.sync_trigger_type && row.sync_started_at
            ? {
                status: row.sync_status,
                triggerType: row.sync_trigger_type,
                startedAt:
                  row.sync_started_at instanceof Date
                    ? row.sync_started_at.toISOString()
                    : row.sync_started_at,
                finishedAt:
                  row.sync_finished_at instanceof Date
                    ? row.sync_finished_at.toISOString()
                    : row.sync_finished_at ?? undefined,
                errorCode: parsedSyncError.errorCode,
                errorMessage: parsedSyncError.errorMessage,
                failureCategory:
                  row.sync_failure_category ?? parsedSyncError.failureCategory,
                recoveryAction:
                  row.sync_recovery_action ?? parsedSyncError.recoveryAction,
                compensationRunId: row.sync_compensation_run_id ?? undefined,
                isRetryable:
                  typeof row.sync_is_retryable === "boolean"
                    ? row.sync_is_retryable
                    : parsedSyncError.isRetryable,
                operatorSummary:
                  row.sync_operator_summary ?? parsedSyncError.operatorSummary,
              }
            : undefined,
        currentInstallation:
          row.installation_id && row.github_installation_id && row.github_account_login
            ? {
                id: row.installation_id,
                githubInstallationId: Number(row.github_installation_id),
                githubAccountLogin: row.github_account_login,
              }
            : undefined,
      };
    },
  );
}

export async function upsertWorkspaceGitHubInstallation({
  workspaceSlug,
  githubInstallationId,
  githubAccountLogin,
  githubAccountType,
  permissions,
  events,
  installedByUserId,
}: {
  workspaceSlug: string;
  githubInstallationId: number;
  githubAccountLogin: string;
  githubAccountType: "user" | "organization";
  permissions?: Record<string, unknown>;
  events?: string[];
  installedByUserId?: string | null;
}) {
  const sql = getSql();
  const workspace = await getWorkspaceRecord(workspaceSlug);
  if (!workspace) {
    throw new AdminSettingsError(
      "WORKSPACE_NOT_FOUND",
      `Workspace "${workspaceSlug}" not found.`,
    );
  }

  const existingByInstallation = await sql<{ id: string }[]>`
    SELECT id
    FROM github_app_installations
    WHERE github_installation_id = ${githubInstallationId}
    LIMIT 1
  `;
  const existingByLogin = await sql<{ id: string }[]>`
    SELECT id
    FROM github_app_installations
    WHERE workspace_id = ${workspace.id}
      AND github_account_login = ${githubAccountLogin}
    LIMIT 1
  `;
  const targetId = existingByInstallation[0]?.id ?? existingByLogin[0]?.id ?? null;

  try {
    if (targetId) {
      const rows = await sql<{
        id: string;
        github_installation_id: number | string;
        github_account_login: string;
        github_account_type: "user" | "organization";
        permissions: Record<string, unknown> | null;
        events: string[] | null;
        updated_at: string | Date;
      }[]>`
        UPDATE github_app_installations
        SET workspace_id = ${workspace.id},
            github_installation_id = ${githubInstallationId},
            github_account_login = ${githubAccountLogin},
            github_account_type = ${githubAccountType},
            permissions = ${JSON.stringify(permissions ?? {})}::jsonb,
            events = ${sql.array(events ?? [])},
            installed_by_user_id = ${installedByUserId ?? null}
        WHERE id = ${targetId}
        RETURNING
          id,
          github_installation_id,
          github_account_login,
          github_account_type,
          permissions,
          events,
          updated_at
      `;

      return mapInstallationRow(rows[0]);
    }

    const rows = await sql<{
      id: string;
      github_installation_id: number | string;
      github_account_login: string;
      github_account_type: "user" | "organization";
      permissions: Record<string, unknown> | null;
      events: string[] | null;
      updated_at: string | Date;
    }[]>`
      INSERT INTO github_app_installations (
        workspace_id,
        github_installation_id,
        github_account_login,
        github_account_type,
        permissions,
        events,
        installed_by_user_id
      )
      VALUES (
        ${workspace.id},
        ${githubInstallationId},
        ${githubAccountLogin},
        ${githubAccountType},
        ${JSON.stringify(permissions ?? {})}::jsonb,
        ${sql.array(events ?? [])},
        ${installedByUserId ?? null}
      )
      RETURNING
        id,
        github_installation_id,
        github_account_login,
        github_account_type,
        permissions,
        events,
        updated_at
    `;

    return mapInstallationRow(rows[0]);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AdminSettingsError(
        "INSTALLATION_CONFLICT",
        "当前 installation 与 workspace 绑定信息冲突。",
      );
    }

    throw error;
  }
}

export async function getWorkspaceModuleSyncTarget({
  workspaceSlug,
  moduleSlug,
}: {
  workspaceSlug: string;
  moduleSlug: string;
}) {
  const sql = getSql();
  const workspace = await getWorkspaceRecord(workspaceSlug);
  if (!workspace) {
    throw new AdminSettingsError(
      "WORKSPACE_NOT_FOUND",
      `Workspace "${workspaceSlug}" not found.`,
    );
  }

  const rows = await sql<{
    id: string;
    workspace_id: string;
    slug: string;
    github_owner: string;
    github_repo: string;
    branch: string | null;
    watch_paths: string[] | null;
  }[]>`
    SELECT
      rr.id,
      rr.workspace_id,
      rr.slug,
      rr.github_owner,
      rr.github_repo,
      rr.meta->>'branch' AS branch,
      rr.watch_paths
    FROM repo_registry rr
    WHERE rr.workspace_id = ${workspace.id}
      AND rr.slug = ${moduleSlug}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new AdminSettingsError(
      "MODULE_NOT_FOUND",
      `Module "${moduleSlug}" not found in workspace "${workspaceSlug}".`,
    );
  }

  const watchPaths = row.watch_paths ?? [];
  if (watchPaths.length === 0) {
    throw new AdminSettingsError(
      "MODULE_SYNC_CONFIG_INVALID",
      `Module "${moduleSlug}" does not have any watch paths configured.`,
    );
  }

  return {
    repoId: row.id,
    workspaceId: row.workspace_id,
    moduleSlug: row.slug,
    githubOwner: row.github_owner,
    githubRepo: row.github_repo,
    branch: row.branch?.trim() || "main",
    watchPaths,
  };
}

export async function updateModuleInstallationBinding({
  workspaceSlug,
  moduleSlug,
  installationRowId,
}: {
  workspaceSlug: string;
  moduleSlug: string;
  installationRowId?: string | null;
}) {
  const sql = getSql();
  const workspace = await getWorkspaceRecord(workspaceSlug);
  if (!workspace) {
    throw new AdminSettingsError(
      "WORKSPACE_NOT_FOUND",
      `Workspace "${workspaceSlug}" not found.`,
    );
  }

  if (installationRowId) {
    const installationRows = await sql<{ id: string }[]>`
      SELECT id
      FROM github_app_installations
      WHERE id = ${installationRowId}
        AND workspace_id = ${workspace.id}
      LIMIT 1
    `;
    if (!installationRows[0]?.id) {
      throw new AdminSettingsError(
        "INSTALLATION_NOT_FOUND",
        "目标 installation 不存在，或不属于当前 workspace。",
      );
    }
  }

  const rows = await sql<{ id: string }[]>`
    UPDATE repo_registry
    SET github_app_installation_id = ${installationRowId ?? null}
    WHERE workspace_id = ${workspace.id}
      AND slug = ${moduleSlug}
    RETURNING id
  `;

  if (!rows[0]?.id) {
    throw new AdminSettingsError(
      "MODULE_NOT_FOUND",
      `Module "${moduleSlug}" not found in workspace "${workspaceSlug}".`,
    );
  }
}

export async function autoBindModulesForInstallation({
  workspaceSlug,
  installationRowId,
  githubAccountLogin,
}: {
  workspaceSlug: string;
  installationRowId: string;
  githubAccountLogin: string;
}) {
  const sql = getSql();
  const workspace = await getWorkspaceRecord(workspaceSlug);
  if (!workspace) {
    throw new AdminSettingsError(
      "WORKSPACE_NOT_FOUND",
      `Workspace "${workspaceSlug}" not found.`,
    );
  }

  const rows = await sql<{ slug: string }[]>`
    UPDATE repo_registry
    SET github_app_installation_id = ${installationRowId}
    WHERE workspace_id = ${workspace.id}
      AND github_app_installation_id IS NULL
      AND LOWER(github_owner) = LOWER(${githubAccountLogin})
    RETURNING slug
  `;

  return {
    count: rows.length,
    modules: rows.map((row) => row.slug),
  };
}
