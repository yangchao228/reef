import crypto from "node:crypto";

import matter from "gray-matter";

import {
  createSqlClient,
  ensureRepoRecord,
  moduleDefaults,
  purgeMissingEntries,
  supportedDisplayTypes,
  upsertMarkdownEntries,
} from "../../scripts/import-lib.mjs";
import {
  buildSyncErrorPayload,
  serializeSyncError,
} from "./logging.mjs";

const githubApiBase = "https://api.github.com";
const installationTokenRefreshBufferMs = 60 * 1000;

function getInstallationTokenCache() {
  if (!globalThis.__reefGitHubInstallationTokenCache) {
    globalThis.__reefGitHubInstallationTokenCache = new Map();
  }

  return globalThis.__reefGitHubInstallationTokenCache;
}

function createSyncError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = details.status ?? 500;
  error.details = details.details ?? null;
  return error;
}

function buildHeaders(accessToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "reef-sync-script",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createGitHubAppJwt(appId, privateKey) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
  }));
  const payload = encodeBase64Url(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: appId,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${signingInput}.${signature}`;
}

function resolveGitHubAppCredentials() {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();

  if (!appId && !privateKeyBase64 && !privateKeyRaw) {
    return null;
  }

  if (!appId) {
    throw createSyncError(
      "GITHUB_APP_CONFIG_INVALID",
      "缺少 GITHUB_APP_ID，无法动态换取 installation token。",
      { status: 500 },
    );
  }

  let privateKey = null;
  if (privateKeyBase64) {
    try {
      privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8").trim();
    } catch (error) {
      throw createSyncError(
        "GITHUB_APP_CONFIG_INVALID",
        "GITHUB_APP_PRIVATE_KEY_BASE64 不是合法的 Base64 字符串。",
        {
          status: 500,
          details: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    }
  } else if (privateKeyRaw) {
    privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  }

  if (!privateKey || !privateKey.includes("BEGIN")) {
    throw createSyncError(
      "GITHUB_APP_CONFIG_INVALID",
      "缺少合法的 GITHUB_APP_PRIVATE_KEY / GITHUB_APP_PRIVATE_KEY_BASE64。",
      { status: 500 },
    );
  }

  return {
    appId,
    privateKey,
  };
}

async function requestInstallationAccessToken(installationId) {
  const appCredentials = resolveGitHubAppCredentials();
  if (!appCredentials) {
    return null;
  }

  const jwt = createGitHubAppJwt(
    appCredentials.appId,
    appCredentials.privateKey,
  );
  const response = await fetch(
    `${githubApiBase}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        ...buildHeaders(null),
        Authorization: `Bearer ${jwt}`,
      },
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw createSyncError(
      response.status === 404
        ? "GITHUB_INSTALLATION_NOT_FOUND"
        : "GITHUB_INSTALLATION_TOKEN_REQUEST_FAILED",
      response.status === 404
        ? "GitHub App installation 不存在，或当前 App 无权访问该 installation。"
        : `GitHub App installation token 请求失败 (${response.status})。`,
      {
        status: 502,
        details: {
          installationId,
          responseStatus: response.status,
          responseBody: message,
        },
      },
    );
  }

  const payload = await response.json();
  const token = typeof payload?.token === "string" ? payload.token.trim() : "";
  const expiresAt = typeof payload?.expires_at === "string"
    ? payload.expires_at
    : null;

  if (!token || !expiresAt) {
    throw createSyncError(
      "GITHUB_INSTALLATION_TOKEN_RESPONSE_INVALID",
      "GitHub App installation token 响应缺少 token 或 expires_at。",
      {
        status: 502,
        details: {
          installationId,
        },
      },
    );
  }

  return {
    token,
    expiresAt,
  };
}

async function getInstallationAccessToken(installationId) {
  const cache = getInstallationTokenCache();
  const cached = cache.get(installationId);
  if (
    cached &&
    cached.expiresAtMs - installationTokenRefreshBufferMs > Date.now()
  ) {
    return {
      token: cached.token,
      source: "github_app_installation",
    };
  }

  const requested = await requestInstallationAccessToken(installationId);
  if (!requested) {
    return null;
  }

  const expiresAtMs = Date.parse(requested.expiresAt);
  cache.set(installationId, {
    token: requested.token,
    expiresAtMs: Number.isFinite(expiresAtMs)
      ? expiresAtMs
      : Date.now() + 30 * 60 * 1000,
  });

  return {
    token: requested.token,
    source: "github_app_installation",
  };
}

export async function fetchGitHubAppInstallationDetails(installationId) {
  const appCredentials = resolveGitHubAppCredentials();
  if (!appCredentials) {
    throw createSyncError(
      "GITHUB_APP_CONFIG_INVALID",
      "缺少 GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY，无法查询 installation 元数据。",
      { status: 500 },
    );
  }

  const jwt = createGitHubAppJwt(
    appCredentials.appId,
    appCredentials.privateKey,
  );
  const response = await fetch(
    `${githubApiBase}/app/installations/${encodeURIComponent(installationId)}`,
    {
      headers: {
        ...buildHeaders(null),
        Authorization: `Bearer ${jwt}`,
      },
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw createSyncError(
      response.status === 404
        ? "GITHUB_INSTALLATION_NOT_FOUND"
        : "GITHUB_INSTALLATION_LOOKUP_FAILED",
      response.status === 404
        ? "GitHub App installation 不存在，或当前 App 无权读取该 installation。"
        : `GitHub App installation 查询失败 (${response.status})。`,
      {
        status: response.status === 404 ? 404 : 502,
        details: {
          installationId,
          responseStatus: response.status,
          responseBody: message,
        },
      },
    );
  }

  const payload = await response.json();
  return {
    id: payload?.id,
    accountLogin: payload?.account?.login ?? null,
    accountType:
      payload?.account?.type === "Organization" ? "organization" : "user",
    permissions:
      payload?.permissions && typeof payload.permissions === "object"
        ? payload.permissions
        : {},
    events: Array.isArray(payload?.events)
      ? payload.events.filter((event) => typeof event === "string")
      : [],
  };
}

async function fetchGitHubJson(url, accessToken) {
  const response = await fetch(url, {
    headers: buildHeaders(accessToken),
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

export async function listMarkdownFiles(owner, repo, repoPath, branch, accessToken) {
  const encodedPath = encodeRepoPath(repoPath);
  const url = `${githubApiBase}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const payload = await fetchGitHubJson(url, accessToken);

  if (!Array.isArray(payload)) {
    throw new Error(`Expected directory listing for path "${repoPath}".`);
  }

  const files = [];

  for (const entry of payload) {
    if (entry.type === "dir") {
      files.push(...(await listMarkdownFiles(owner, repo, entry.path, branch, accessToken)));
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

export async function fetchMarkdownFile(owner, repo, filePath, branch, accessToken) {
  const encodedPath = encodeRepoPath(filePath);
  const url = `${githubApiBase}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const payload = await fetchGitHubJson(url, accessToken);

  if (!payload.content || payload.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content payload for "${filePath}".`);
  }

  const rawFile = Buffer.from(payload.content, "base64").toString("utf8");
  let parsed;
  try {
    parsed = matter(rawFile);
  } catch (error) {
    throw createSyncError(
      "MARKDOWN_PARSE_FAILED",
      `Markdown 解析失败：${filePath}`,
      {
        status: 500,
        details: {
          filePath,
          message: error instanceof Error ? error.message : String(error),
        },
      },
    );
  }

  return {
    filePath,
    frontmatter: parsed.data,
    body: parsed.content,
    rawFile,
    githubSha: payload.sha,
  };
}

async function startSyncLog(sql, {
  workspaceId,
  repoId,
  triggerType,
  triggerScope,
  commitSha,
  filesAdded,
  filesModified,
  filesRemoved,
  compensationRunId,
}) {
  if (!workspaceId) {
    throw createSyncError(
      "SYNC_WORKSPACE_REQUIRED",
      "同步日志写入缺少 workspace_id。",
      { status: 500 },
    );
  }

  const rows = await sql`
    INSERT INTO sync_logs (
      workspace_id,
      repo_id,
      trigger_type,
      trigger_scope,
      commit_sha,
      files_added,
      files_modified,
      files_removed,
      compensation_run_id,
      status
    )
    VALUES (
      ${workspaceId},
      ${repoId},
      ${triggerType},
      ${triggerScope ?? null},
      ${commitSha ?? null},
      ${filesAdded ?? 0},
      ${filesModified ?? 0},
      ${filesRemoved ?? 0},
      ${compensationRunId ?? null},
      'pending'
    )
    RETURNING id
  `;

  return rows[0].id;
}

async function finishSyncLog(
  sql,
  logId,
  {
    status,
    errorDetail = null,
    failureCategory = null,
    recoveryAction = null,
    isRetryable = false,
    operatorSummary = null,
  },
) {
  await sql`
    UPDATE sync_logs
    SET status = ${status},
        error_detail = ${errorDetail},
        failure_category = ${failureCategory},
        recovery_action = ${recoveryAction},
        is_retryable = ${isRetryable},
        operator_summary = ${operatorSummary},
        finished_at = NOW()
    WHERE id = ${logId}
  `;
}

function parseInstallationTokenMap() {
  const raw = process.env.GITHUB_APP_INSTALLATION_TOKENS_JSON?.trim();
  if (!raw) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createSyncError(
      "GITHUB_INSTALLATION_TOKEN_CONFIG_INVALID",
      "GITHUB_APP_INSTALLATION_TOKENS_JSON 不是合法 JSON。",
      {
        status: 500,
        details: {
          raw,
          message: error instanceof Error ? error.message : String(error),
        },
      },
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createSyncError(
      "GITHUB_INSTALLATION_TOKEN_CONFIG_INVALID",
      "GITHUB_APP_INSTALLATION_TOKENS_JSON 必须是 installation id 到 token 的映射对象。",
      {
        status: 500,
      },
    );
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => [key, value.trim()]),
  );
}

async function getRepoAuthContext(sql, {
  repoId,
  workspaceId,
  moduleSlug,
  targetWorkspaceSlug,
}) {
  if (repoId && workspaceId) {
    const rows = await sql`
      SELECT
        rr.id AS repo_id,
        rr.slug AS module_slug,
        rr.workspace_id,
        gai.id AS installation_row_id,
        gai.github_installation_id,
        gai.github_account_login
      FROM repo_registry rr
      LEFT JOIN github_app_installations gai
        ON gai.id = rr.github_app_installation_id
       AND gai.workspace_id = rr.workspace_id
      WHERE rr.id = ${repoId}
        AND rr.workspace_id = ${workspaceId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  if (!moduleSlug || !targetWorkspaceSlug) {
    return null;
  }

  const rows = await sql`
    SELECT
      rr.id AS repo_id,
      rr.slug AS module_slug,
      rr.workspace_id,
      gai.id AS installation_row_id,
      gai.github_installation_id,
      gai.github_account_login
    FROM repo_registry rr
    JOIN workspaces w ON w.id = rr.workspace_id
    LEFT JOIN github_app_installations gai
      ON gai.id = rr.github_app_installation_id
     AND gai.workspace_id = rr.workspace_id
    WHERE rr.slug = ${moduleSlug}
      AND w.slug = ${targetWorkspaceSlug}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function resolveGitHubAccessForSync({
  sql,
  repoId = null,
  workspaceId = null,
  moduleSlug = null,
  targetWorkspaceSlug = null,
  triggerType = "manual",
}) {
  const repoAuth = await getRepoAuthContext(sql, {
    repoId,
    workspaceId,
    moduleSlug,
    targetWorkspaceSlug,
  });
  const installationTokens = parseInstallationTokenMap();
  const installationId = repoAuth?.github_installation_id
    ? String(repoAuth.github_installation_id)
    : null;

  if (installationId && installationTokens[installationId]) {
    return {
      token: installationTokens[installationId],
      source: "github_app_installation",
      installationId,
      githubAccountLogin: repoAuth.github_account_login ?? null,
    };
  }

  if (installationId) {
    const installationAccess = await getInstallationAccessToken(installationId);
    if (installationAccess) {
      return {
        token: installationAccess.token,
        source: installationAccess.source,
        installationId,
        githubAccountLogin: repoAuth?.github_account_login ?? null,
      };
    }
  }

  const globalToken = process.env.GITHUB_TOKEN?.trim();
  const allowGlobalFallback =
    Boolean(globalToken) &&
    (triggerType === "manual" || process.env.NODE_ENV !== "production");

  if (allowGlobalFallback) {
    return {
      token: globalToken,
      source: triggerType === "manual" ? "manual_global_token" : "dev_global_token",
      installationId,
      githubAccountLogin: repoAuth?.github_account_login ?? null,
    };
  }

  if (installationId) {
    throw createSyncError(
      "GITHUB_INSTALLATION_TOKEN_MISSING",
      "当前 workspace 已绑定 GitHub App installation，但服务端没有提供可用 token，也没有配置 App 私钥换 token 流程。",
      {
        status: 500,
        details: {
          installationId,
          githubAccountLogin: repoAuth.github_account_login ?? null,
          tokenSourceEnv:
            "GITHUB_APP_INSTALLATION_TOKENS_JSON or GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY",
        },
      },
    );
  }

  if (triggerType !== "manual") {
    throw createSyncError(
      "GITHUB_APP_INSTALLATION_REQUIRED",
      "当前 repo 尚未绑定 GitHub App installation，自动同步不能继续使用全局系统 token。",
      {
        status: 500,
        details: {
          moduleSlug: repoAuth?.module_slug ?? moduleSlug,
          workspaceId: repoAuth?.workspace_id ?? workspaceId,
        },
      },
    );
  }

  throw createSyncError(
    "GITHUB_TOKEN_MISSING",
    "未配置可用的 GitHub 授权。手动同步可在开发环境使用 GITHUB_TOKEN，自动同步应绑定 GitHub App installation。",
    {
      status: 500,
    },
  );
}

export async function syncGitHubModule({
  moduleSlug,
  moduleName = null,
  displayType = null,
  owner,
  repo,
  branch = "main",
  watchPaths,
  purgeMissing = true,
  triggerType = "manual",
  triggerScope = null,
  commitSha = null,
  fileCounts = {},
  existingRepoId = null,
  existingWorkspaceId = null,
  targetWorkspaceSlug,
  compensationRunId = null,
  sqlClient,
}) {
  const sql = sqlClient ?? createSqlClient();
  let logId = null;

  try {
    const defaults = moduleDefaults[moduleSlug]
      ?? (
        moduleName && displayType && supportedDisplayTypes.has(displayType)
          ? {
              name: moduleName,
              displayType,
            }
          : null
      );

    if (!existingRepoId || !existingWorkspaceId) {
      if (!defaults) {
        throw createSyncError(
          "UNSUPPORTED_MODULE",
          `Module "${moduleSlug}" 没有内置 preset，请补充 moduleName 和 displayType。`,
          { status: 400 },
        );
      }
    }

    const { repoId, workspaceId } =
      existingRepoId && existingWorkspaceId
        ? {
            repoId: existingRepoId,
            workspaceId: existingWorkspaceId,
          }
        : await ensureRepoRecord(
            sql,
            moduleSlug,
            defaults,
            {
              githubOwner: owner,
              githubRepo: repo,
              watchPaths,
              meta: {
                source: "github",
                branch,
              },
            },
            targetWorkspaceSlug,
          );

    const normalizedWatchPaths = Array.isArray(watchPaths)
      ? watchPaths.map((watchPath) => String(watchPath).trim()).filter(Boolean)
      : [];

    logId = await startSyncLog(sql, {
      workspaceId,
      repoId,
      triggerType,
      triggerScope,
      commitSha,
      filesAdded: fileCounts.added,
      filesModified: fileCounts.modified,
      filesRemoved: fileCounts.removed,
      compensationRunId,
    });

    if (normalizedWatchPaths.length === 0) {
      throw createSyncError(
        "WATCH_PATHS_EMPTY",
        `模块 ${moduleSlug} 缺少有效 watch paths，当前无法执行同步。`,
        {
          status: 400,
          details: {
            moduleSlug,
          },
        },
      );
    }

    const githubAccess = await resolveGitHubAccessForSync({
      sql,
      repoId,
      workspaceId,
      moduleSlug,
      targetWorkspaceSlug,
      triggerType,
    });

    const markdownFiles = (
      await Promise.all(
        normalizedWatchPaths.map((watchPath) =>
          listMarkdownFiles(owner, repo, watchPath, branch, githubAccess.token),
        ),
      )
    ).flat();

    const entries = [];
    for (const file of markdownFiles) {
      entries.push(
        await fetchMarkdownFile(owner, repo, file.path, branch, githubAccess.token),
      );
    }

    const importedPaths = await upsertMarkdownEntries(sql, repoId, entries, workspaceId);
    if (purgeMissing) {
      await purgeMissingEntries(sql, repoId, importedPaths);
    }

    await finishSyncLog(sql, logId, {
      status: "completed",
      isRetryable: false,
      operatorSummary: "同步完成，未发现需要人工介入的问题。",
    });

    return {
      moduleSlug,
      importedCount: entries.length,
      branch,
      watchPaths: normalizedWatchPaths,
      authSource: githubAccess.source,
    };
  } catch (error) {
    if (logId) {
      const errorPayload = buildSyncErrorPayload(error);

      await finishSyncLog(sql, logId, {
        status: "failed",
        errorDetail: serializeSyncError(error),
        failureCategory: errorPayload.failureCategory,
        recoveryAction: errorPayload.recoveryAction,
        isRetryable: errorPayload.isRetryable,
        operatorSummary: errorPayload.operatorSummary,
      });
    }

    throw error;
  } finally {
    if (!sqlClient) {
      await sql.end();
    }
  }
}
