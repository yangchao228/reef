import crypto from "node:crypto";
import path from "node:path";

import postgres from "postgres";

export const moduleDefaults = {
  human30: { name: "Human 3.0 专栏", displayType: "blog" },
  openclaw: { name: "养虾日记", displayType: "timeline" },
  bookmarks: { name: "收藏夹", displayType: "bookmarks" },
};

export const supportedDisplayTypes = new Set(["blog", "timeline", "bookmarks"]);

export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

export function normalizeTags(tags) {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag));
  }
  return String(tags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeCategoryName(category) {
  return category
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function deriveSlug(frontmatterSlug, filePath) {
  if (frontmatterSlug) {
    return String(frontmatterSlug);
  }

  return path.basename(filePath, path.extname(filePath));
}

export function deriveTitle(frontmatterTitle, filePath) {
  if (frontmatterTitle) {
    return String(frontmatterTitle);
  }

  return path.basename(filePath, path.extname(filePath));
}

export function deriveSummary(summary, body) {
  if (summary) {
    return String(summary);
  }

  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function createSqlClient() {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://reef:reef@localhost:5432/reef";
  return postgres(databaseUrl, { prepare: false });
}

function normalizeWorkspaceSlug(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
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

function resolveWorkspaceSlug(workspaceSlug) {
  return workspaceSlug ?? getTargetWorkspaceSlug();
}

export async function getWorkspaceId(sql, workspaceSlug) {
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  const rows = await sql`
    SELECT id
    FROM workspaces
    WHERE slug = ${targetWorkspaceSlug}
    LIMIT 1
  `;

  if (!rows[0]?.id) {
    throw new Error(`WORKSPACE_NOT_FOUND:${targetWorkspaceSlug}`);
  }

  return rows[0].id;
}

export async function ensureRepoRecord(
  sql,
  moduleSlug,
  defaults,
  repoConfig,
  workspaceSlug,
) {
  const workspaceId = await getWorkspaceId(sql, workspaceSlug);
  const repoRows = await sql`
    INSERT INTO repo_registry (
      workspace_id,
      slug,
      name,
      github_owner,
      github_repo,
      display_type,
      watch_paths,
      meta
    )
    VALUES (
      ${workspaceId},
      ${moduleSlug},
      ${defaults.name},
      ${repoConfig.githubOwner},
      ${repoConfig.githubRepo},
      ${defaults.displayType},
      string_to_array(${repoConfig.watchPaths.join("|||")}, '|||'),
      ${JSON.stringify(repoConfig.meta ?? {})}
    )
    ON CONFLICT (workspace_id, slug)
    DO UPDATE SET
      name = EXCLUDED.name,
      github_owner = EXCLUDED.github_owner,
      github_repo = EXCLUDED.github_repo,
      display_type = EXCLUDED.display_type,
      watch_paths = EXCLUDED.watch_paths,
      meta = EXCLUDED.meta
    RETURNING id
  `;

  return {
    repoId: repoRows[0].id,
    workspaceId,
  };
}

export async function upsertMarkdownEntries(sql, repoId, entries, workspaceId) {
  const importedPaths = [];

  for (const entry of entries) {
    const categorySlug = String(entry.frontmatter.category ?? "uncategorized");
    const tags = normalizeTags(entry.frontmatter.tags);
    const publishedAt = entry.frontmatter.date
      ? new Date(entry.frontmatter.date).toISOString()
      : new Date().toISOString();

    const categoryRows = await sql`
      INSERT INTO categories (workspace_id, slug, name)
      VALUES (${workspaceId}, ${categorySlug}, ${normalizeCategoryName(categorySlug)})
      ON CONFLICT (workspace_id, slug)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    const githubSha =
      entry.githubSha ??
      crypto.createHash("sha1").update(entry.rawFile).digest("hex");

    await sql`
      INSERT INTO content_items (
        workspace_id,
        repo_id,
        category_id,
        file_path,
        github_sha,
        slug,
        title,
        summary,
        content_raw,
        frontmatter,
        tags,
        source_url,
        source_platform,
        published_at,
        synced_at,
        status
      )
      VALUES (
        ${workspaceId},
        ${repoId},
        ${categoryRows[0].id},
        ${entry.filePath},
        ${githubSha},
        ${deriveSlug(entry.frontmatter.slug, entry.filePath)},
        ${deriveTitle(entry.frontmatter.title, entry.filePath)},
        ${deriveSummary(entry.frontmatter.summary, entry.body)},
        ${entry.body.trim()},
        ${JSON.stringify(entry.frontmatter)},
        ${sql.array(tags)},
        ${entry.frontmatter.source_url ? String(entry.frontmatter.source_url) : null},
        ${entry.frontmatter.source_platform
          ? String(entry.frontmatter.source_platform)
          : null},
        ${publishedAt},
        NOW(),
        ${String(entry.frontmatter.status ?? "published")}
      )
      ON CONFLICT (repo_id, file_path)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        category_id = EXCLUDED.category_id,
        github_sha = EXCLUDED.github_sha,
        slug = EXCLUDED.slug,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        content_raw = EXCLUDED.content_raw,
        frontmatter = EXCLUDED.frontmatter,
        tags = EXCLUDED.tags,
        source_url = EXCLUDED.source_url,
        source_platform = EXCLUDED.source_platform,
        published_at = EXCLUDED.published_at,
        synced_at = NOW(),
        status = EXCLUDED.status
    `;

    importedPaths.push(entry.filePath);
  }

  return importedPaths;
}

export async function purgeMissingEntries(sql, repoId, importedPaths) {
  if (importedPaths.length === 0) {
    return;
  }

  await sql`
    DELETE FROM content_items
    WHERE repo_id = ${repoId}
      AND NOT (file_path = ANY(${sql.array(importedPaths)}))
  `;
}
