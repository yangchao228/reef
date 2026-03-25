import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import {
  createSqlClient,
  ensureRepoRecord,
  moduleDefaults,
  upsertMarkdownEntries,
} from "./import-lib.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERT_FAILED:${message}`);
  }
}

async function main() {
  const sql = createSqlClient();
  const schemaName = `reef_v2_verify_${Date.now()}`;
  const primaryWorkspaceSlug = "verify-space";
  const primaryAdminLogin = "verify-admin";
  const schemaPath = path.resolve(process.cwd(), "db/init/002_multitenant_v2.sql");
  const schemaSql = (await fs.readFile(schemaPath, "utf8")).replace(
    /^CREATE EXTENSION IF NOT EXISTS pgcrypto;\n\n/,
    "",
  );

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await sql.unsafe(`CREATE SCHEMA ${schemaName}`);
    await sql.unsafe(`SET search_path TO ${schemaName}, public`);
    await sql.unsafe(schemaSql);

    const userRows = await sql`
      INSERT INTO users (github_login, name, email, account_status)
      VALUES (${primaryAdminLogin}, 'Verify Admin', 'verify-admin@local.invalid', 'active')
      RETURNING id
    `;
    const workspaceRows = await sql`
      INSERT INTO workspaces (owner_user_id, slug, name, visibility)
      VALUES (${userRows[0].id}, ${primaryWorkspaceSlug}, 'Verify Space', 'private')
      RETURNING id
    `;
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${workspaceRows[0].id}, ${userRows[0].id}, 'owner')
    `;

    const { repoId, workspaceId } = await ensureRepoRecord(
      sql,
      "human30",
      moduleDefaults.human30,
      {
        githubOwner: "local",
        githubRepo: "human30",
        watchPaths: ["content/human30"],
        meta: { source: "verify" },
      },
      primaryWorkspaceSlug,
    );

    assert(Boolean(workspaceId), "ensureRepoRecord should resolve v2 workspace_id");

    await upsertMarkdownEntries(
      sql,
      repoId,
      [
        {
          filePath: "notes/hello-world.md",
          frontmatter: {
            title: "Hello Reef",
            slug: "hello-reef",
            category: "methodology",
            tags: ["reef", "schema"],
            status: "published",
            date: "2026-03-20T00:00:00.000Z",
          },
          body: "Schema verification body",
          rawFile: "---\ntitle: Hello Reef\n---\nSchema verification body",
          githubSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        },
      ],
      workspaceId,
    );

    const contentRows = await sql`
      SELECT
        ci.slug,
        ci.workspace_id,
        rr.workspace_id AS repo_workspace_id,
        c.workspace_id AS category_workspace_id
      FROM content_items ci
      JOIN repo_registry rr ON rr.id = ci.repo_id
      JOIN categories c ON c.id = ci.category_id
      WHERE ci.slug = 'hello-reef'
    `;

    assert(contentRows.length === 1, "content item should be inserted");
    assert(
      contentRows[0].workspace_id === workspaceId &&
        contentRows[0].repo_workspace_id === workspaceId &&
        contentRows[0].category_workspace_id === workspaceId,
      "repo/category/content should share workspace_id",
    );

    const syncLogColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ${schemaName}
        AND table_name = 'sync_logs'
    `;

    const syncLogColumnNames = new Set(syncLogColumns.map((row) => row.column_name));
    assert(syncLogColumnNames.has("trigger_scope"), "sync_logs.trigger_scope should exist");
    assert(syncLogColumnNames.has("failure_category"), "sync_logs.failure_category should exist");
    assert(syncLogColumnNames.has("recovery_action"), "sync_logs.recovery_action should exist");
    assert(syncLogColumnNames.has("compensation_run_id"), "sync_logs.compensation_run_id should exist");
    assert(syncLogColumnNames.has("is_retryable"), "sync_logs.is_retryable should exist");
    assert(syncLogColumnNames.has("operator_summary"), "sync_logs.operator_summary should exist");

    const authorRows = await sql`
      INSERT INTO comment_authors (workspace_id, nickname, fingerprint)
      VALUES (${workspaceId}, 'Verifier', 'fingerprint-1')
      ON CONFLICT (workspace_id, fingerprint)
      DO UPDATE SET nickname = EXCLUDED.nickname
      RETURNING id
    `;

    const authorRowsAgain = await sql`
      INSERT INTO comment_authors (workspace_id, nickname, fingerprint)
      VALUES (${workspaceId}, 'Verifier Renamed', 'fingerprint-1')
      ON CONFLICT (workspace_id, fingerprint)
      DO UPDATE SET nickname = EXCLUDED.nickname
      RETURNING id
    `;

    assert(
      authorRows[0].id === authorRowsAgain[0].id,
      "same fingerprint should be reused inside one workspace",
    );

    const secondaryWorkspace = await sql`
      INSERT INTO users (github_login, name, email, account_status)
      VALUES ('verify-secondary-admin', 'Verify Secondary Admin', 'verify-secondary@local.invalid', 'active')
      RETURNING id
    `;

    const secondaryWorkspaceRows = await sql`
      INSERT INTO workspaces (owner_user_id, slug, name, visibility)
      VALUES (
        ${secondaryWorkspace[0].id},
        'secondary-space',
        'Secondary Space',
        'private'
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (
        ${secondaryWorkspaceRows[0].id},
        ${secondaryWorkspace[0].id},
        'owner'
      )
    `;

    const crossWorkspaceAuthor = await sql`
      INSERT INTO comment_authors (workspace_id, nickname, fingerprint)
      VALUES (${secondaryWorkspaceRows[0].id}, 'Verifier', 'fingerprint-1')
      RETURNING id
    `;

    assert(
      crossWorkspaceAuthor[0].id !== authorRows[0].id,
      "same fingerprint should be allowed across different workspaces",
    );

    console.log(`Verified v2 schema successfully in schema ${schemaName}.`);
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
