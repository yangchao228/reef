import matter from "gray-matter";

import {
  createSqlClient,
  ensureRepoRecord,
  moduleDefaults,
  purgeMissingEntries,
  upsertMarkdownEntries,
} from "../../scripts/import-lib.mjs";

const githubApiBase = "https://api.github.com";

function createSyncError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = details.status ?? 500;
  error.details = details.details ?? null;
  return error;
}

function buildHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "reef-sync-script",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    const message = await response.text();

    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw createSyncError(
        "GITHUB_API_RATE_LIMIT",
        "GitHub API 已触发速率限制。",
        {
          status: 429,
          details: {
            url,
            responseStatus: response.status,
          },
        },
      );
    }

    if (response.status === 404) {
      throw createSyncError(
        "GITHUB_CONTENT_NOT_FOUND",
        "GitHub 仓库或目录不存在，或当前 token 无权限访问。",
        {
          status: 404,
          details: {
            url,
            responseStatus: response.status,
            responseBody: message,
          },
        },
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw createSyncError(
        "GITHUB_AUTH_FAILED",
        "GitHub token 无效，或当前仓库访问权限不足。",
        {
          status: 502,
          details: {
            url,
            responseStatus: response.status,
            responseBody: message,
          },
        },
      );
    }

    throw createSyncError(
      "GITHUB_REQUEST_FAILED",
      `GitHub request failed (${response.status}).`,
      {
        status: 502,
        details: {
          url,
          responseStatus: response.status,
          responseBody: message,
        },
      },
    );
  }

  return response.json();
}

function encodeRepoPath(repoPath) {
  return repoPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function listMarkdownFiles(owner, repo, repoPath, branch) {
  const encodedPath = encodeRepoPath(repoPath);
  const url = `${githubApiBase}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const payload = await fetchGitHubJson(url);

  if (!Array.isArray(payload)) {
    throw new Error(`Expected directory listing for path "${repoPath}".`);
  }

  const files = [];

  for (const entry of payload) {
    if (entry.type === "dir") {
      files.push(...(await listMarkdownFiles(owner, repo, entry.path, branch)));
      continue;
    }

    if (entry.type === "file" && entry.name.endsWith(".md")) {
      files.push({
        path: entry.path,
        sha: entry.sha,
      });
    }
  }

  return files;
}

export async function fetchMarkdownFile(owner, repo, filePath, branch) {
  const encodedPath = encodeRepoPath(filePath);
  const url = `${githubApiBase}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const payload = await fetchGitHubJson(url);

  if (!payload.content || payload.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content payload for "${filePath}".`);
  }

  const rawFile = Buffer.from(payload.content, "base64").toString("utf8");
  const parsed = matter(rawFile);

  return {
    filePath,
    frontmatter: parsed.data,
    body: parsed.content,
    rawFile,
    githubSha: payload.sha,
  };
}

async function startSyncLog(sql, {
  repoId,
  triggerType,
  commitSha,
  filesAdded,
  filesModified,
  filesRemoved,
}) {
  const rows = await sql`
    INSERT INTO sync_logs (
      repo_id,
      trigger_type,
      commit_sha,
      files_added,
      files_modified,
      files_removed,
      status
    )
    VALUES (
      ${repoId},
      ${triggerType},
      ${commitSha ?? null},
      ${filesAdded ?? 0},
      ${filesModified ?? 0},
      ${filesRemoved ?? 0},
      'pending'
    )
    RETURNING id
  `;

  return rows[0].id;
}

async function finishSyncLog(sql, logId, status, errorDetail = null) {
  await sql`
    UPDATE sync_logs
    SET status = ${status},
        error_detail = ${errorDetail},
        finished_at = NOW()
    WHERE id = ${logId}
  `;
}

export async function syncGitHubModule({
  moduleSlug,
  owner,
  repo,
  branch = "main",
  watchPaths,
  purgeMissing = true,
  triggerType = "manual",
  commitSha = null,
  fileCounts = {},
  sqlClient,
}) {
  const defaults = moduleDefaults[moduleSlug];
  if (!defaults) {
    throw createSyncError("UNSUPPORTED_MODULE", `Unsupported module: ${moduleSlug}`, {
      status: 400,
    });
  }

  const sql = sqlClient ?? createSqlClient();
  let logId = null;

  try {
    const repoId = await ensureRepoRecord(sql, moduleSlug, defaults, {
      githubOwner: owner,
      githubRepo: repo,
      watchPaths,
      meta: {
        source: "github",
        branch,
      },
    });

    logId = await startSyncLog(sql, {
      repoId,
      triggerType,
      commitSha,
      filesAdded: fileCounts.added,
      filesModified: fileCounts.modified,
      filesRemoved: fileCounts.removed,
    });

    const markdownFiles = (
      await Promise.all(watchPaths.map((watchPath) => listMarkdownFiles(owner, repo, watchPath, branch)))
    ).flat();

    const entries = [];
    for (const file of markdownFiles) {
      entries.push(await fetchMarkdownFile(owner, repo, file.path, branch));
    }

    const importedPaths = await upsertMarkdownEntries(sql, repoId, entries);
    if (purgeMissing) {
      await purgeMissingEntries(sql, repoId, importedPaths);
    }

    await finishSyncLog(sql, logId, "completed");

    return {
      moduleSlug,
      importedCount: entries.length,
      branch,
      watchPaths,
    };
  } catch (error) {
    if (logId) {
      const errorDetail =
        error instanceof Error
          ? JSON.stringify({
              code: error.code ?? "SYNC_FAILED",
              message: error.message,
              details: error.details ?? null,
            })
          : JSON.stringify({
              code: "SYNC_FAILED",
              message: String(error),
            });

      await finishSyncLog(sql, logId, "failed", errorDetail);
    }

    throw error;
  } finally {
    if (!sqlClient) {
      await sql.end();
    }
  }
}
