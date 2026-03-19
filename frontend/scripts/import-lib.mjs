import crypto from "node:crypto";
import path from "node:path";

import postgres from "postgres";

export const moduleDefaults = {
  human30: { name: "Human 3.0 专栏", displayType: "blog" },
  openclaw: { name: "养虾日记", displayType: "timeline" },
  bookmarks: { name: "收藏夹", displayType: "bookmarks" },
};

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

export async function ensureRepoRecord(
  sql,
  moduleSlug,
  defaults,
  repoConfig,
) {
  const repoRows = await sql`
    INSERT INTO repo_registry (
      slug,
      name,
      github_owner,
      github_repo,
      display_type,
      watch_paths,
      meta
    )
    VALUES (
      ${moduleSlug},
      ${defaults.name},
      ${repoConfig.githubOwner},
      ${repoConfig.githubRepo},
      ${defaults.displayType},
      string_to_array(${repoConfig.watchPaths.join("|||")}, '|||'),
      ${JSON.stringify(repoConfig.meta ?? {})}
    )
    ON CONFLICT (slug)
    DO UPDATE SET
      name = EXCLUDED.name,
      github_owner = EXCLUDED.github_owner,
      github_repo = EXCLUDED.github_repo,
      display_type = EXCLUDED.display_type,
      watch_paths = EXCLUDED.watch_paths,
      meta = EXCLUDED.meta
    RETURNING id
  `;

  return repoRows[0].id;
}

export async function upsertMarkdownEntries(sql, repoId, entries) {
  const importedPaths = [];

  for (const entry of entries) {
    const categorySlug = String(entry.frontmatter.category ?? "uncategorized");
    const tags = normalizeTags(entry.frontmatter.tags);
    const publishedAt = entry.frontmatter.date
      ? new Date(entry.frontmatter.date).toISOString()
      : new Date().toISOString();

    const categoryRows = await sql`
      INSERT INTO categories (slug, name)
      VALUES (${categorySlug}, ${normalizeCategoryName(categorySlug)})
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    const githubSha =
      entry.githubSha ??
      crypto.createHash("sha1").update(entry.rawFile).digest("hex");

    await sql`
      INSERT INTO content_items (
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
