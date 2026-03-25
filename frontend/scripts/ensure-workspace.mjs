import path from "node:path";

import dotenv from "dotenv";

import { createSqlClient, parseArgs } from "./import-lib.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function normalizeValue(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceSlug =
    normalizeValue(args.workspace) ?? normalizeValue(process.env.REEF_WORKSPACE_SLUG);
  const workspaceName =
    normalizeValue(args.name) ?? workspaceSlug?.replace(/[-_]+/g, " ") ?? null;
  const githubLogin =
    normalizeValue(args.login) ?? normalizeValue(process.env.REEF_ADMIN_GITHUB_LOGIN);
  const userName =
    normalizeValue(args["user-name"]) ?? githubLogin ?? "Workspace Admin";
  const email =
    normalizeValue(args.email) ?? (githubLogin ? `${githubLogin}@local.invalid` : null);
  const role = normalizeValue(args.role) ?? "owner";

  if (!workspaceSlug || !workspaceName || !githubLogin) {
    console.error(
      "Usage: npm run workspace:ensure -- --workspace <workspace-slug> --name <workspace-name> --login <github-login> [--user-name admin-name] [--email admin-email] [--role owner|admin|editor|viewer]",
    );
    process.exit(1);
  }

  const sql = createSqlClient();

  try {
    const userRows = await sql`
      INSERT INTO users (github_login, name, email, account_status)
      VALUES (${githubLogin}, ${userName}, ${email}, 'active')
      ON CONFLICT (github_login)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        account_status = 'active'
      RETURNING id
    `;

    const userId = userRows[0].id;
    const workspaceRows = await sql`
      INSERT INTO workspaces (owner_user_id, slug, name, visibility)
      VALUES (${userId}, ${workspaceSlug}, ${workspaceName}, 'private')
      ON CONFLICT (slug)
      DO UPDATE SET
        owner_user_id = EXCLUDED.owner_user_id,
        name = EXCLUDED.name
      RETURNING id
    `;

    const workspaceId = workspaceRows[0].id;
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${userId}, ${role})
      ON CONFLICT (workspace_id, user_id)
      DO UPDATE SET role = EXCLUDED.role
    `;

    console.log(
      `Ensured workspace "${workspaceSlug}" with admin "${githubLogin}" (${role}).`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
