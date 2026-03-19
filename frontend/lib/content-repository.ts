import { getSql } from "@/lib/db";
import { getModuleBySlug } from "@/lib/modules";
import {
  AdminCommentRecord,
  AdminSyncLogRecord,
  CategorySummary,
  CommentRecord,
  ContentItem,
  ModuleSlug,
} from "@/lib/types";

function splitMarkdownBody(content: string) {
  return content
    .split(/\n\s*\n/g)
    .map((segment) => segment.replace(/^#{1,6}\s+/gm, "").trim())
    .filter(Boolean);
}

function mapContentRow(row: {
  id: string;
  module: ModuleSlug;
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
}) {
  const sql = getSql();
  const rows = await sql<{
    id: string;
    module: ModuleSlug;
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
      (SELECT COUNT(*)::int FROM likes l WHERE l.content_item_id = ci.id) AS like_count,
      (
        SELECT COUNT(*)::int
        FROM comments cm
        WHERE cm.content_item_id = ci.id
          AND cm.status = 'approved'
      ) AS comment_count
    FROM content_items ci
    JOIN repo_registry rr ON rr.id = ci.repo_id
    LEFT JOIN categories c ON c.id = ci.category_id
    WHERE ci.status = 'published'
      ${whereClause?.module ? sql`AND rr.slug = ${whereClause.module}` : sql``}
      ${whereClause?.category ? sql`AND c.slug = ${whereClause.category}` : sql``}
      ${whereClause?.tag ? sql`AND ${whereClause.tag} = ANY(ci.tags)` : sql``}
      ${whereClause?.slug ? sql`AND ci.slug = ${whereClause.slug}` : sql``}
    ORDER BY ci.published_at DESC NULLS LAST, ci.synced_at DESC NULLS LAST
  `;

  return rows.map(mapContentRow);
}

export async function listAllContent() {
  return runContentQuery();
}

export async function listModuleContent(
  module: ModuleSlug,
  filters?: { category?: string; tag?: string },
) {
  return runContentQuery({
    module,
    category: filters?.category,
    tag: filters?.tag,
  });
}

export async function getContentByModuleAndSlug(module: string, slug: string) {
  const items = await runContentQuery({ module, slug });
  return items[0] ?? null;
}

export async function listLatestItems(limit = 6) {
  const items = await listAllContent();
  return items.slice(0, limit);
}

export async function listCategories() {
  const sql = getSql();
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
    JOIN content_items ci ON ci.category_id = c.id
    JOIN repo_registry rr ON rr.id = ci.repo_id
    WHERE ci.status = 'published'
    GROUP BY c.slug, c.name
    ORDER BY count DESC, c.name ASC
  `;

  return rows.map(
    (row): CategorySummary => ({
      slug: row.slug,
      name: row.name,
      count: Number(row.count),
      modules: row.modules as ModuleSlug[],
    }),
  );
}

export async function listItemsByCategory(categorySlug: string) {
  return runContentQuery({ category: categorySlug });
}

export async function listItemsByTag(tag: string) {
  return runContentQuery({ tag });
}

export async function searchContent(query: string) {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }

  const sql = getSql();
  const rows = await sql<{
    id: string;
    module: ModuleSlug;
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
      (SELECT COUNT(*)::int FROM likes l WHERE l.content_item_id = ci.id) AS like_count,
      (
        SELECT COUNT(*)::int
        FROM comments cm
        WHERE cm.content_item_id = ci.id
          AND cm.status = 'approved'
      ) AS comment_count
    FROM content_items ci
    JOIN repo_registry rr ON rr.id = ci.repo_id
    LEFT JOIN categories c ON c.id = ci.category_id
    WHERE ci.status = 'published'
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

export async function listAllTags() {
  const items = await listAllContent();
  return Array.from(new Set(items.flatMap((item) => item.tags))).sort();
}

export async function getCategoryName(categorySlug: string) {
  const sql = getSql();
  const rows = await sql<{ name: string }[]>`
    SELECT name FROM categories WHERE slug = ${categorySlug} LIMIT 1
  `;
  return rows[0]?.name ?? categorySlug;
}

async function getContentIdBySlug(slug: string) {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM content_items WHERE slug = ${slug} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function recordView(slug: string, fingerprint: string, isAdmin = false) {
  const sql = getSql();
  const contentItemId = await getContentIdBySlug(slug);
  if (!contentItemId) {
    return 0;
  }

  if (!isAdmin && fingerprint) {
    await sql`
      INSERT INTO view_events (content_item_id, fingerprint)
      VALUES (${contentItemId}, ${fingerprint})
      ON CONFLICT (content_item_id, fingerprint, bucket_date) DO NOTHING
    `;

    const inserted = await sql<{ count: number | string }[]>`
      SELECT COUNT(*)::int AS count
      FROM view_events
      WHERE content_item_id = ${contentItemId}
        AND fingerprint = ${fingerprint}
        AND bucket_date = CURRENT_DATE
    `;

    if (Number(inserted[0]?.count ?? 0) === 1) {
      await sql`
        UPDATE content_items
        SET view_count = view_count + 1
        WHERE id = ${contentItemId}
      `;
    }
  }

  const count = await sql<{ view_count: number }[]>`
    SELECT view_count FROM content_items WHERE id = ${contentItemId} LIMIT 1
  `;

  return Number(count[0]?.view_count ?? 0);
}

export async function toggleLike(slug: string, fingerprint: string) {
  const sql = getSql();
  const contentItemId = await getContentIdBySlug(slug);
  if (!contentItemId || !fingerprint) {
    return { likes: 0, liked: false };
  }

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM likes
    WHERE content_item_id = ${contentItemId}
      AND fingerprint = ${fingerprint}
    LIMIT 1
  `;

  if (existing[0]?.id) {
    await sql`
      DELETE FROM likes
      WHERE id = ${existing[0].id}
    `;
  } else {
    await sql`
      INSERT INTO likes (content_item_id, fingerprint)
      VALUES (${contentItemId}, ${fingerprint})
    `;
  }

  const count = await sql<{ count: number | string }[]>`
    SELECT COUNT(*)::int AS count
    FROM likes
    WHERE content_item_id = ${contentItemId}
  `;

  return {
    likes: Number(count[0]?.count ?? 0),
    liked: !existing[0]?.id,
  };
}

export async function getApprovedComments(slug: string) {
  const sql = getSql();
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
    JOIN content_items ci ON ci.id = cm.content_item_id
    JOIN comment_authors ca ON ca.id = cm.author_id
    WHERE ci.slug = ${slug}
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
) {
  const sql = getSql();
  const contentItemId = await getContentIdBySlug(slug);
  if (!contentItemId) {
    throw new Error("CONTENT_NOT_FOUND");
  }

  const authors = await sql<{ id: string }[]>`
    INSERT INTO comment_authors (nickname, fingerprint)
    VALUES (${nickname}, ${fingerprint})
    ON CONFLICT (fingerprint)
    DO UPDATE SET nickname = EXCLUDED.nickname
    RETURNING id
  `;

  await sql`
    INSERT INTO comments (content_item_id, author_id, body, status)
    VALUES (${contentItemId}, ${authors[0].id}, ${body}, 'pending')
  `;
}

export async function listPendingComments() {
  const sql = getSql();
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
    JOIN content_items ci ON ci.id = cm.content_item_id
    JOIN repo_registry rr ON rr.id = ci.repo_id
    JOIN comment_authors ca ON ca.id = cm.author_id
    WHERE cm.status = 'pending'
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

function parseSyncErrorDetail(errorDetail: string | null) {
  if (!errorDetail) {
    return {
      errorCode: undefined,
      errorMessage: undefined,
    };
  }

  try {
    const parsed = JSON.parse(errorDetail) as {
      code?: string;
      message?: string;
    };

    return {
      errorCode: parsed.code,
      errorMessage: parsed.message ?? errorDetail,
    };
  } catch {
    return {
      errorCode: undefined,
      errorMessage: errorDetail,
    };
  }
}

export async function listRecentSyncLogs(limit = 12) {
  const sql = getSql();
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
      sl.started_at,
      sl.finished_at
    FROM sync_logs sl
    JOIN repo_registry rr ON rr.id = sl.repo_id
    ORDER BY sl.started_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row): AdminSyncLogRecord => {
    const parsedError = parseSyncErrorDetail(row.error_detail);

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
) {
  const sql = getSql();
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
      AND ci.id = cm.content_item_id
      AND rr.id = ci.repo_id
      AND ca.id = cm.author_id
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

export function getModuleMeta(moduleSlug: string) {
  return getModuleBySlug(moduleSlug);
}
