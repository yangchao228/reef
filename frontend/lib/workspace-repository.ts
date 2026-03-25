import { getSql } from "@/lib/db";
import { WorkspaceSummary } from "@/lib/types";
import { normalizeGithubLogin } from "@/lib/user-session";

function mapWorkspaceRow(row: {
  slug: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  content_count: number | string;
  module_count: number | string;
  updated_at: string | Date;
  membership_role?: "owner" | "admin" | "editor" | "viewer" | null;
}): WorkspaceSummary {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    contentCount: Number(row.content_count ?? 0),
    moduleCount: Number(row.module_count ?? 0),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    membershipRole: row.membership_role ?? undefined,
  };
}

export async function listSelectableWorkspaces(viewerGithubLogin?: string | null) {
  const normalizedViewer = normalizeGithubLogin(viewerGithubLogin);
  const sql = getSql();
  const rows = await sql<{
    slug: string;
    name: string;
    description: string | null;
    visibility: "public" | "private";
    content_count: number | string;
    module_count: number | string;
    updated_at: string | Date;
    membership_role: "owner" | "admin" | "editor" | "viewer" | null;
  }[]>`
    SELECT
      w.slug,
      w.name,
      w.description,
      w.visibility,
      COUNT(DISTINCT ci.id)::int AS content_count,
      COUNT(DISTINCT rr.id)::int AS module_count,
      w.updated_at,
      wm.role AS membership_role
    FROM workspaces w
    LEFT JOIN users viewer
      ON viewer.github_login = ${normalizedViewer}
      AND viewer.account_status = 'active'
    LEFT JOIN workspace_members wm
      ON wm.workspace_id = w.id
      AND wm.user_id = viewer.id
    LEFT JOIN repo_registry rr ON rr.workspace_id = w.id
    LEFT JOIN content_items ci
      ON ci.workspace_id = w.id
      AND ci.status = 'published'
    WHERE w.archived_at IS NULL
    GROUP BY
      w.id,
      w.slug,
      w.name,
      w.description,
      w.visibility,
      w.updated_at,
      wm.role
    ORDER BY
      CASE WHEN wm.role IS NULL THEN 1 ELSE 0 END,
      w.updated_at DESC,
      w.name ASC
  `;

  return rows.map(mapWorkspaceRow);
}

export async function getWorkspaceSummary(workspaceSlug?: string | null) {
  const normalized = workspaceSlug?.trim();
  if (!normalized) {
    return null;
  }

  const sql = getSql();
  const rows = await sql<{
    slug: string;
    name: string;
    description: string | null;
    visibility: "public" | "private";
    content_count: number | string;
    module_count: number | string;
    updated_at: string | Date;
  }[]>`
    SELECT
      w.slug,
      w.name,
      w.description,
      w.visibility,
      COUNT(DISTINCT ci.id)::int AS content_count,
      COUNT(DISTINCT rr.id)::int AS module_count,
      w.updated_at
    FROM workspaces w
    LEFT JOIN repo_registry rr ON rr.workspace_id = w.id
    LEFT JOIN content_items ci
      ON ci.workspace_id = w.id
      AND ci.status = 'published'
    WHERE w.slug = ${normalized}
      AND w.archived_at IS NULL
    GROUP BY w.id, w.slug, w.name, w.description, w.visibility, w.updated_at
    LIMIT 1
  `;

  return rows[0] ? mapWorkspaceRow(rows[0]) : null;
}

export class WorkspaceCreationError extends Error {
  constructor(
    public readonly code: "WORKSPACE_SLUG_TAKEN",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceCreationError";
  }
}

export async function createWorkspaceForUser({
  ownerUserId,
  workspaceSlug,
  workspaceName,
  description,
  visibility = "private",
}: {
  ownerUserId: string;
  workspaceSlug: string;
  workspaceName: string;
  description?: string | null;
  visibility?: "public" | "private";
}) {
  const sql = getSql();

  try {
    const workspaceRows = await sql<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      visibility: "public" | "private";
      updated_at: string | Date;
    }[]>`
      INSERT INTO workspaces (owner_user_id, slug, name, description, visibility)
      VALUES (
        ${ownerUserId},
        ${workspaceSlug},
        ${workspaceName},
        ${description?.trim() || null},
        ${visibility}
      )
      RETURNING id, slug, name, description, visibility, updated_at
    `;
    const workspace = workspaceRows[0];

    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${workspace.id}, ${ownerUserId}, 'owner')
      ON CONFLICT (workspace_id, user_id)
      DO UPDATE SET role = 'owner'
    `;

    return mapWorkspaceRow({
      ...workspace,
      content_count: 0,
      module_count: 0,
      membership_role: "owner",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new WorkspaceCreationError(
        "WORKSPACE_SLUG_TAKEN",
        `Workspace slug "${workspaceSlug}" is already in use.`,
      );
    }

    throw error;
  }
}
