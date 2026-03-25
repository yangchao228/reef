import { getSql } from "@/lib/db";
import { UserSummary } from "@/lib/types";
import { normalizeGithubLogin } from "@/lib/user-session";

function mapUserRow(row: {
  github_login: string;
  name: string | null;
  workspace_count: number | string;
}): UserSummary {
  return {
    githubLogin: row.github_login,
    name: row.name ?? undefined,
    workspaceCount: Number(row.workspace_count ?? 0),
  };
}

export async function getUserSummary(githubLogin?: string | null) {
  const normalized = normalizeGithubLogin(githubLogin);
  if (!normalized) {
    return null;
  }

  const sql = getSql();
  const rows = await sql<{
    github_login: string;
    name: string | null;
    workspace_count: number | string;
  }[]>`
    SELECT
      u.github_login,
      u.name,
      COUNT(DISTINCT wm.workspace_id)::int AS workspace_count
    FROM users u
    LEFT JOIN workspace_members wm ON wm.user_id = u.id
    WHERE u.github_login = ${normalized}
      AND u.account_status = 'active'
    GROUP BY u.id, u.github_login, u.name
    LIMIT 1
  `;

  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function ensureUserByGithubLogin({
  githubLogin,
  name,
  githubUserId,
  avatarUrl,
  email,
}: {
  githubLogin: string;
  name?: string | null;
  githubUserId?: number | null;
  avatarUrl?: string | null;
  email?: string | null;
}) {
  const normalizedLogin = normalizeGithubLogin(githubLogin);
  if (!normalizedLogin) {
    throw new Error("GITHUB_LOGIN_REQUIRED");
  }

  const sql = getSql();
  const rows = await sql<{
    id: string;
    github_login: string;
    name: string | null;
  }[]>`
    INSERT INTO users (github_user_id, github_login, name, avatar_url, email, account_status)
    VALUES (
      ${githubUserId ?? null},
      ${normalizedLogin},
      ${name?.trim() || null},
      ${avatarUrl?.trim() || null},
      ${email?.trim() || null},
      'active'
    )
    ON CONFLICT (github_login)
    DO UPDATE SET
      github_user_id = COALESCE(EXCLUDED.github_user_id, users.github_user_id),
      name = COALESCE(EXCLUDED.name, users.name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
      email = COALESCE(EXCLUDED.email, users.email),
      account_status = 'active',
      updated_at = NOW()
    RETURNING id, github_login, name
  `;

  return rows[0];
}
