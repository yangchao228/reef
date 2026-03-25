import { getSql } from "@/lib/db";
import { buildModuleDefinition } from "@/lib/modules";
import { parseStoredSyncErrorDetail } from "@/lib/sync/logging.mjs";
import {
  AdminCommentRecord,
  AdminSyncLogRecord,
  CategorySummary,
  CommentRecord,
  ContentItem,
  DisplayType,
  ModuleDefinition,
  ModuleSlug,
} from "@/lib/types";

function resolveWorkspaceSlug(workspaceSlug?: string | null) {
  const normalized = workspaceSlug?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function splitMarkdownBody(content: string) {
  return content
    .split(/\n\s*\n/g)
    .map((segment) => segment.replace(/^#{1,6}\s+/gm, "").trim())
    .filter(Boolean);
}

function mapContentRow(row: {
  id: string;
  module: ModuleSlug;
  module_name: string;
  module_display_type: DisplayType;
  module_meta: unknown;
  slug: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  category_name: string | null;
  tags: string[] | null;
  published_at: string | Date | null;
  content_raw: string;
  source_url: string | null;
  source_platform: ContentItem["sourcePlatform"] | null;
  view_count: number | null;
  like_count: number | string | null;
  comment_count: number | string | null;
}): ContentItem {
  return {
    id: row.id,
    module: row.module,
    moduleMeta: buildModuleDefinition({
      slug: row.module,
      name: row.module_name,
      displayType: row.module_display_type,
      meta: row.module_meta,
    }),
    slug: row.slug,
    title: row.title ?? "未命名内容",
    summary: row.summary ?? "",
    category: row.category ?? "uncategorized",
    categoryName: row.category_name ?? row.category ?? "uncategorized",
    tags: row.tags ?? [],
    publishedAt:
      (row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at) ?? new Date(0).toISOString(),
    content: splitMarkdownBody(row.content_raw),
    sourceUrl: row.source_url ?? undefined,
    sourcePlatform: row.source_platform ?? undefined,
    stats: {
      views: Number(row.view_count ?? 0),
      likes: Number(row.like_count ?? 0),
      comments: Number(row.comment_count ?? 0),
    },
  };
}

async function runContentQuery(whereClause?: {
  module?: string;
  category?: string;
  tag?: string;
  slug?: string;
}, workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    id: string;
    module: ModuleSlug;
    module_name: string;
    module_display_type: DisplayType;
    module_meta: unknown;
    slug: string;
    title: string | null;
    summary: string | null;
      category: string | null;
      category_name: string | null;
      tags: string[] | null;
    published_at: string | Date | null;
    content_raw: string;
    source_url: string | null;
    source_platform: ContentItem["sourcePlatform"] | null;
    view_count: number | null;
    like_count: number | string | null;
    comment_count: number | string | null;
  }[]>`
    SELECT
      ci.id,
      rr.slug AS module,
      rr.name AS module_name,
      rr.display_type AS module_display_type,
      rr.meta AS module_meta,
      ci.slug,
      ci.title,
      ci.summary,
      c.slug AS category,
      c.name AS category_name,
      ci.tags,
      ci.published_at,
      ci.content_raw,
      ci.source_url,
      ci.source_platform,
      ci.view_count,
      (
        SELECT COUNT(*)::int
        FROM likes l
        WHERE l.content_item_id = ci.id
          AND l.workspace_id = ci.workspace_id
      ) AS like_count,
      (
        SELECT COUNT(*)::int
        FROM comments cm
        WHERE cm.content_item_id = ci.id
          AND cm.workspace_id = ci.workspace_id
          AND cm.status = 'approved'
      ) AS comment_count
    FROM content_items ci
    JOIN repo_registry rr ON rr.id = ci.repo_id AND rr.workspace_id = ci.workspace_id
    LEFT JOIN categories c ON c.id = ci.category_id AND c.workspace_id = ci.workspace_id
    WHERE ci.status = 'published'
      AND rr.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
      ${whereClause?.module ? sql`AND rr.slug = ${whereClause.module}` : sql``}
      ${whereClause?.category ? sql`AND c.slug = ${whereClause.category}` : sql``}
      ${whereClause?.tag ? sql`AND ${whereClause.tag} = ANY(ci.tags)` : sql``}
      ${whereClause?.slug ? sql`AND ci.slug = ${whereClause.slug}` : sql``}
    ORDER BY ci.published_at DESC NULLS LAST, ci.synced_at DESC NULLS LAST
  `;

  return rows.map(mapContentRow);
}

export async function listAllContent(workspaceSlug?: string | null) {
  return runContentQuery(undefined, workspaceSlug);
}

export async function listModuleContent(
  module: string,
  filters?: { category?: string; tag?: string },
  workspaceSlug?: string | null,
) {
  return runContentQuery({
    module,
    category: filters?.category,
    tag: filters?.tag,
  }, workspaceSlug);
}

export async function getContentByModuleAndSlug(
  module: string,
  slug: string,
  workspaceSlug?: string | null,
) {
  const items = await runContentQuery({ module, slug }, workspaceSlug);
  return items[0] ?? null;
}

export async function listLatestItems(limit = 6, workspaceSlug?: string | null) {
  const items = await runContentQuery(undefined, workspaceSlug);
  return items.slice(0, limit);
}

export async function listCategories(workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    slug: string;
    name: string;
    count: number | string;
    modules: string[];
  }[]>`
    SELECT
      c.slug,
      c.name,
      COUNT(ci.id)::int AS count,
      ARRAY_AGG(DISTINCT rr.slug ORDER BY rr.slug) AS modules
    FROM categories c
    JOIN content_items ci ON ci.category_id = c.id AND ci.workspace_id = c.workspace_id
    JOIN repo_registry rr ON rr.id = ci.repo_id AND rr.workspace_id = ci.workspace_id
    WHERE ci.status = 'published'
      AND c.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
    GROUP BY c.slug, c.name
    ORDER BY count DESC, c.name ASC
  `;

  return rows.map(
    (row): CategorySummary => ({
      slug: row.slug,
      name: row.name,
      count: Number(row.count),
      modules: row.modules,
    }),
  );
}

export async function listModules(workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    slug: string;
    name: string;
    display_type: DisplayType;
    meta: unknown;
  }[]>`
    SELECT rr.slug, rr.name, rr.display_type, rr.meta
    FROM repo_registry rr
    WHERE rr.workspace_id = (
      SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
    )
    ORDER BY rr.sort_order ASC, rr.name ASC
  `;

  return rows.map((row): ModuleDefinition =>
    buildModuleDefinition({
      slug: row.slug,
      name: row.name,
      displayType: row.display_type,
      meta: row.meta,
    }),
  );
}

export async function listItemsByCategory(categorySlug: string) {
  return runContentQuery({ category: categorySlug }, undefined);
}

export async function listItemsByCategoryInWorkspace(
  categorySlug: string,
  workspaceSlug?: string | null,
) {
  return runContentQuery({ category: categorySlug }, workspaceSlug);
}

export async function listItemsByTag(tag: string, workspaceSlug?: string | null) {
  return runContentQuery({ tag }, workspaceSlug);
}

export async function searchContent(query: string, workspaceSlug?: string | null) {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }

  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    id: string;
    module: ModuleSlug;
    module_name: string;
    module_display_type: DisplayType;
    module_meta: unknown;
    slug: string;
    title: string | null;
    summary: string | null;
      category: string | null;
      category_name: string | null;
      tags: string[] | null;
    published_at: string | Date | null;
    content_raw: string;
    source_url: string | null;
    source_platform: ContentItem["sourcePlatform"] | null;
    view_count: number | null;
    like_count: number | string | null;
    comment_count: number | string | null;
  }[]>`
    SELECT
      ci.id,
      rr.slug AS module,
      rr.name AS module_name,
      rr.display_type AS module_display_type,
      rr.meta AS module_meta,
      ci.slug,
      ci.title,
      ci.summary,
      c.slug AS category,
      c.name AS category_name,
      ci.tags,
      ci.published_at,
      ci.content_raw,
      ci.source_url,
      ci.source_platform,
      ci.view_count,
      (
        SELECT COUNT(*)::int
        FROM likes l
        WHERE l.content_item_id = ci.id
          AND l.workspace_id = ci.workspace_id
      ) AS like_count,
      (
        SELECT COUNT(*)::int
        FROM comments cm
        WHERE cm.content_item_id = ci.id
          AND cm.workspace_id = ci.workspace_id
          AND cm.status = 'approved'
      ) AS comment_count
    FROM content_items ci
    JOIN repo_registry rr ON rr.id = ci.repo_id AND rr.workspace_id = ci.workspace_id
    LEFT JOIN categories c ON c.id = ci.category_id AND c.workspace_id = ci.workspace_id
    WHERE ci.status = 'published'
      AND rr.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
      AND (
        ci.title ILIKE ${`%${normalized}%`}
        OR ci.summary ILIKE ${`%${normalized}%`}
        OR ci.content_raw ILIKE ${`%${normalized}%`}
        OR ${normalized} = ANY(ci.tags)
      )
    ORDER BY ci.published_at DESC NULLS LAST
  `;

  return rows.map(mapContentRow);
}

export async function listAllTags(workspaceSlug?: string | null) {
  const items = await runContentQuery(undefined, workspaceSlug);
  return Array.from(new Set(items.flatMap((item) => item.tags))).sort();
}

export async function getCategoryName(categorySlug: string, workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return categorySlug;
  }
  const rows = await sql<{ name: string }[]>`
    SELECT name
    FROM categories
    WHERE slug = ${categorySlug}
      AND workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
    LIMIT 1
  `;
  return rows[0]?.name ?? categorySlug;
}

async function getContentBySlugRecord(slug: string, workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return null;
  }
  const rows = await sql<{ id: string; workspace_id: string }[]>`
    SELECT id, workspace_id
    FROM content_items
    WHERE slug = ${slug}
      AND workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function recordView(
  slug: string,
  fingerprint: string,
  isAdmin = false,
  workspaceSlug?: string | null,
) {
  const sql = getSql();
  const contentItem = await getContentBySlugRecord(slug, workspaceSlug);
  if (!contentItem) {
    return 0;
  }

  if (!isAdmin && fingerprint) {
    await sql`
      INSERT INTO view_events (workspace_id, content_item_id, fingerprint)
      VALUES (${contentItem.workspace_id}, ${contentItem.id}, ${fingerprint})
      ON CONFLICT (workspace_id, content_item_id, fingerprint, bucket_date) DO NOTHING
    `;

    const inserted = await sql<{ count: number | string }[]>`
      SELECT COUNT(*)::int AS count
      FROM view_events
      WHERE content_item_id = ${contentItem.id}
        AND fingerprint = ${fingerprint}
        AND workspace_id = ${contentItem.workspace_id}
        AND bucket_date = CURRENT_DATE
    `;

    if (Number(inserted[0]?.count ?? 0) === 1) {
      await sql`
        UPDATE content_items
        SET view_count = view_count + 1
        WHERE id = ${contentItem.id}
      `;
    }
  }

  const count = await sql<{ view_count: number }[]>`
    SELECT view_count FROM content_items WHERE id = ${contentItem.id} LIMIT 1
  `;

  return Number(count[0]?.view_count ?? 0);
}

export async function toggleLike(slug: string, fingerprint: string, workspaceSlug?: string | null) {
  const sql = getSql();
  const contentItem = await getContentBySlugRecord(slug, workspaceSlug);
  if (!contentItem || !fingerprint) {
    return { likes: 0, liked: false };
  }

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM likes
    WHERE content_item_id = ${contentItem.id}
      AND fingerprint = ${fingerprint}
      AND workspace_id = ${contentItem.workspace_id}
    LIMIT 1
  `;

  if (existing[0]?.id) {
    await sql`
      DELETE FROM likes
      WHERE id = ${existing[0].id}
    `;
  } else {
    await sql`
      INSERT INTO likes (workspace_id, content_item_id, fingerprint)
      VALUES (${contentItem.workspace_id}, ${contentItem.id}, ${fingerprint})
    `;
  }

  const count = await sql<{ count: number | string }[]>`
    SELECT COUNT(*)::int AS count
    FROM likes
    WHERE content_item_id = ${contentItem.id}
      AND workspace_id = ${contentItem.workspace_id}
  `;

  return {
    likes: Number(count[0]?.count ?? 0),
    liked: !existing[0]?.id,
  };
}

export async function getApprovedComments(slug: string, workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    id: string;
    slug: string;
    nickname: string;
    body: string;
    status: CommentRecord["status"];
    created_at: string | Date;
  }[]>`
    SELECT
      cm.id,
      ci.slug,
      ca.nickname,
      cm.body,
      cm.status,
      cm.created_at
    FROM comments cm
    JOIN content_items ci ON ci.id = cm.content_item_id AND ci.workspace_id = cm.workspace_id
    JOIN comment_authors ca ON ca.id = cm.author_id AND ca.workspace_id = cm.workspace_id
    WHERE ci.slug = ${slug}
      AND ci.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
      AND cm.status = 'approved'
    ORDER BY cm.created_at DESC
  `;

  return rows.map(
    (row): CommentRecord => ({
      id: row.id,
      slug: row.slug,
      nickname: row.nickname,
      body: row.body,
      status: row.status,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    }),
  );
}

export async function createComment(
  slug: string,
  nickname: string,
  body: string,
  fingerprint: string,
  workspaceSlug?: string | null,
) {
  const sql = getSql();
  const contentItem = await getContentBySlugRecord(slug, workspaceSlug);
  if (!contentItem) {
    throw new Error("CONTENT_NOT_FOUND");
  }

  const authors = await sql<{ id: string }[]>`
    INSERT INTO comment_authors (workspace_id, nickname, fingerprint)
    VALUES (${contentItem.workspace_id}, ${nickname}, ${fingerprint})
    ON CONFLICT (workspace_id, fingerprint)
    DO UPDATE SET nickname = EXCLUDED.nickname
    RETURNING id
  `;

  await sql`
    INSERT INTO comments (workspace_id, content_item_id, author_id, body, status)
    VALUES (
      ${contentItem.workspace_id},
      ${contentItem.id},
      ${authors[0].id},
      ${body},
      'pending'
    )
  `;
}

export async function listPendingComments(workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    id: string;
    slug: string;
    nickname: string;
    body: string;
    status: CommentRecord["status"];
    created_at: string | Date;
    module: ModuleSlug;
    title: string;
  }[]>`
    SELECT
      cm.id,
      ci.slug,
      ca.nickname,
      cm.body,
      cm.status,
      cm.created_at,
      rr.slug AS module,
      ci.title
    FROM comments cm
    JOIN content_items ci ON ci.id = cm.content_item_id AND ci.workspace_id = cm.workspace_id
    JOIN repo_registry rr ON rr.id = ci.repo_id AND rr.workspace_id = ci.workspace_id
    JOIN comment_authors ca ON ca.id = cm.author_id AND ca.workspace_id = cm.workspace_id
    WHERE cm.status = 'pending'
      AND cm.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
    ORDER BY cm.created_at DESC
  `;

  return rows.map(
    (row): AdminCommentRecord => ({
      id: row.id,
      slug: row.slug,
      nickname: row.nickname,
      body: row.body,
      status: row.status,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      module: row.module,
      title: row.title,
    }),
  );
}

export async function listRecentSyncLogs(limit = 12, workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return [];
  }
  const rows = await sql<{
    id: string;
    module: ModuleSlug;
    repo_name: string;
    trigger_type: AdminSyncLogRecord["triggerType"];
    commit_sha: string | null;
    files_added: number | string | null;
    files_modified: number | string | null;
    files_removed: number | string | null;
    status: AdminSyncLogRecord["status"];
    error_detail: string | null;
    failure_category: string | null;
    recovery_action: string | null;
    compensation_run_id: string | null;
    is_retryable: boolean | null;
    operator_summary: string | null;
    started_at: string | Date;
    finished_at: string | Date | null;
  }[]>`
    SELECT
      sl.id,
      rr.slug AS module,
      rr.name AS repo_name,
      sl.trigger_type,
      sl.commit_sha,
      sl.files_added,
      sl.files_modified,
      sl.files_removed,
      sl.status,
      sl.error_detail,
      sl.failure_category,
      sl.recovery_action,
      sl.compensation_run_id,
      sl.is_retryable,
      sl.operator_summary,
      sl.started_at,
      sl.finished_at
    FROM sync_logs sl
    JOIN repo_registry rr ON rr.id = sl.repo_id AND rr.workspace_id = sl.workspace_id
    WHERE sl.workspace_id = (
      SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
    )
    ORDER BY sl.started_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row): AdminSyncLogRecord => {
    const parsedError = parseStoredSyncErrorDetail(row.error_detail);

    return {
      id: row.id,
      module: row.module,
      repoName: row.repo_name,
      triggerType: row.trigger_type,
      commitSha: row.commit_sha ?? undefined,
      filesAdded: Number(row.files_added ?? 0),
      filesModified: Number(row.files_modified ?? 0),
      filesRemoved: Number(row.files_removed ?? 0),
      status: row.status,
      errorCode: parsedError.errorCode,
      errorMessage: parsedError.errorMessage,
      failureCategory: row.failure_category ?? parsedError.failureCategory,
      recoveryAction: row.recovery_action ?? parsedError.recoveryAction,
      compensationRunId: row.compensation_run_id ?? undefined,
      isRetryable:
        typeof row.is_retryable === "boolean"
          ? row.is_retryable
          : parsedError.isRetryable,
      operatorSummary: row.operator_summary ?? parsedError.operatorSummary,
      startedAt:
        row.started_at instanceof Date
          ? row.started_at.toISOString()
          : row.started_at,
      finishedAt:
        row.finished_at instanceof Date
          ? row.finished_at.toISOString()
          : row.finished_at ?? undefined,
    };
  });
}

export async function reviewComment(
  id: string,
  decision: "approved" | "rejected",
  workspaceSlug?: string | null,
) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return null;
  }
  const rows = await sql<{
    id: string;
    slug: string;
    nickname: string;
    body: string;
    status: CommentRecord["status"];
    created_at: string | Date;
    module: ModuleSlug;
    title: string;
  }[]>`
    UPDATE comments cm
    SET status = ${decision}
    FROM content_items ci, repo_registry rr, comment_authors ca
    WHERE cm.id = ${id}
      AND cm.status = 'pending'
      AND cm.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
      AND ci.id = cm.content_item_id
      AND ci.workspace_id = cm.workspace_id
      AND rr.id = ci.repo_id
      AND rr.workspace_id = ci.workspace_id
      AND ca.id = cm.author_id
      AND ca.workspace_id = cm.workspace_id
    RETURNING
      cm.id,
      ci.slug,
      ca.nickname,
      cm.body,
      cm.status,
      cm.created_at,
      rr.slug AS module,
      ci.title
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    nickname: row.nickname,
    body: row.body,
    status: row.status,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    module: row.module,
    title: row.title,
  } satisfies AdminCommentRecord;
}

export async function getModuleMeta(moduleSlug: string, workspaceSlug?: string | null) {
  const sql = getSql();
  const targetWorkspaceSlug = resolveWorkspaceSlug(workspaceSlug);
  if (!targetWorkspaceSlug) {
    return null;
  }
  const rows = await sql<{
    slug: string;
    name: string;
    display_type: DisplayType;
    meta: unknown;
  }[]>`
    SELECT rr.slug, rr.name, rr.display_type, rr.meta
    FROM repo_registry rr
    WHERE rr.slug = ${moduleSlug}
      AND rr.workspace_id = (
        SELECT id FROM workspaces WHERE slug = ${targetWorkspaceSlug} LIMIT 1
      )
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  return buildModuleDefinition({
    slug: rows[0].slug,
    name: rows[0].name,
    displayType: rows[0].display_type,
    meta: rows[0].meta,
  });
}
