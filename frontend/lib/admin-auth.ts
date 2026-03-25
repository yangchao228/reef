import path from "node:path";

import dotenv from "dotenv";

import { getSql } from "@/lib/db";
import { resolveWorkspaceSlug } from "@/lib/workspace";
import { resolveUserLogin } from "@/lib/user-session";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

type HeaderSource = Headers | { get(name: string): string | null | undefined };
type CookieSource = {
  get(name: string): { value: string } | string | undefined;
};

export type AdminAccessResult = {
  allowed: boolean;
  workspaceSlug: string | null;
  reason:
    | "AUTHORIZED"
    | "MISSING_WORKSPACE"
    | "MISSING_IDENTITY"
    | "NOT_WORKSPACE_ADMIN";
  actor: {
    githubLogin: string | null;
    role: "owner" | "admin" | null;
  };
};

export async function getAdminAccess(
  headers: HeaderSource,
  cookies?: CookieSource | null,
): Promise<AdminAccessResult> {
  const workspaceSlug = resolveWorkspaceSlug(headers, cookies);
  const githubLogin = resolveUserLogin(headers, cookies);

  if (!workspaceSlug) {
    return {
      allowed: false,
      workspaceSlug: null,
      reason: "MISSING_WORKSPACE",
      actor: {
        githubLogin,
        role: null,
      },
    };
  }

  if (!githubLogin) {
    return {
      allowed: false,
      workspaceSlug,
      reason: "MISSING_IDENTITY",
      actor: {
        githubLogin: null,
        role: null,
      },
    };
  }

  const sql = getSql();
  const rows = await sql<{ role: "owner" | "admin" }[]>`
    SELECT wm.role
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    JOIN users u ON u.id = wm.user_id
    WHERE w.slug = ${workspaceSlug}
      AND u.github_login = ${githubLogin}
      AND u.account_status = 'active'
      AND wm.role IN ('owner', 'admin')
    LIMIT 1
  `;

  if (rows.length === 0) {
    return {
      allowed: false,
      workspaceSlug,
      reason: "NOT_WORKSPACE_ADMIN",
      actor: {
        githubLogin,
        role: null,
      },
    };
  }

  return {
    allowed: true,
    workspaceSlug,
    reason: "AUTHORIZED",
    actor: {
      githubLogin,
      role: rows[0].role,
    },
  };
}
