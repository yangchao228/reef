import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const workspaceSlug = process.env.REEF_WORKSPACE_SLUG?.trim();
if (!workspaceSlug) {
  throw new Error("REEF_WORKSPACE_SLUG_MISSING");
}
const articleSlug = "我的Openclaw免费使用经验分享";
const articlePath = `/human30/${encodeURIComponent(articleSlug)}`;
const articleApiSlug = encodeURIComponent(articleSlug);
const workspaceHeaders = {
  "X-Reef-Workspace": workspaceSlug,
};
const adminGithubLogin = process.env.REEF_ADMIN_GITHUB_LOGIN?.trim();
if (!adminGithubLogin) {
  throw new Error("REEF_ADMIN_GITHUB_LOGIN_MISSING");
}
const adminHeaders = {
  ...workspaceHeaders,
  "X-Reef-User-Login": adminGithubLogin,
};

const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
    console.error(`FAIL ${message}`);
    return;
  }

  console.log(`PASS ${message}`);
}

async function fetchText(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...workspaceHeaders,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  return { response, text };
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...workspaceHeaders,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();

  try {
    return {
      response,
      json: JSON.parse(text),
      rawText: text,
    };
  } catch {
    return {
      response,
      json: null,
      rawText: text,
    };
  }
}

async function main() {
  console.log(`Running smoke tests against ${baseUrl}`);

  const home = await fetchText("/");
  assert(home.response.status === 200, "homepage returns 200");
  assert(home.text.includes("GitHub-native OS"), "homepage contains site brand");

  const human30 = await fetchText("/human30");
  assert(human30.response.status === 200, "human30 module page returns 200");
  assert(human30.text.includes("Human 3.0 专栏"), "human30 page contains module title");

  const openclaw = await fetchText("/openclaw");
  assert(openclaw.response.status === 200, "openclaw module page returns 200");
  assert(openclaw.text.includes("养虾日记"), "openclaw page contains module title");

  const bookmarks = await fetchText("/bookmarks");
  assert(bookmarks.response.status === 200, "bookmarks module page returns 200");
  assert(bookmarks.text.includes("收藏夹"), "bookmarks page contains module title");

  const article = await fetchText(articlePath);
  assert(article.response.status === 200, "human30 article detail returns 200");
  assert(article.text.includes(articleSlug), "human30 article detail contains title");

  const comments = await fetchJson(`/api/content/${articleApiSlug}/comments`);
  assert(comments.response.status === 200, "comments API returns 200");
  assert(Array.isArray(comments.json?.data), "comments API returns array payload");

  const commentBody = `smoke-comment-${Date.now()}`;
  const commentFingerprint = `smoke-comment-fp-${Date.now()}`;
  const createCommentResponse = await fetchJson(`/api/content/${articleApiSlug}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nickname: "Smoke Tester",
      body: commentBody,
      fingerprint: commentFingerprint,
    }),
  });
  assert(createCommentResponse.response.status === 200, "comment submit API returns 200");

  const pendingComments = await fetchJson("/api/admin/comments", {
    headers: adminHeaders,
  });
  assert(pendingComments.response.status === 200, "pending comments API returns 200");
  assert(Array.isArray(pendingComments.json?.data), "pending comments API returns array");

  const createdPendingComment = Array.isArray(pendingComments.json?.data)
    ? pendingComments.json.data.find((comment) => comment?.body === commentBody)
    : null;
  assert(Boolean(createdPendingComment?.id), "submitted comment appears in pending queue");

  if (createdPendingComment?.id) {
    const approveCommentResponse = await fetchJson(
      `/api/admin/comments/${createdPendingComment.id}`,
      {
        method: "PUT",
        headers: {
          ...adminHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "approved",
        }),
      },
    );
    assert(approveCommentResponse.response.status === 200, "comment review API returns 200");
    assert(
      approveCommentResponse.json?.data?.status === "approved",
      "comment review API returns approved status",
    );
  }

  const approvedComments = await fetchJson(`/api/content/${articleApiSlug}/comments`);
  assert(approvedComments.response.status === 200, "approved comments API returns 200");
  assert(
    Array.isArray(approvedComments.json?.data)
      && approvedComments.json.data.some((comment) => comment?.body === commentBody),
    "approved comments API includes reviewed comment",
  );

  const view = await fetchJson(`/api/content/${articleApiSlug}/view`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fingerprint: `smoke-view-${Date.now()}`,
      isAdmin: true,
    }),
  });
  assert(view.response.status === 200, "view API returns 200");
  assert(typeof view.json?.data?.views === "number", "view API returns numeric views");

  const likeFingerprint = `smoke-like-${Date.now()}`;
  const likeOn = await fetchJson(`/api/content/${articleApiSlug}/like`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fingerprint: likeFingerprint,
    }),
  });
  assert(likeOn.response.status === 200, "like API returns 200 on first toggle");
  assert(typeof likeOn.json?.data?.likes === "number", "like API returns numeric like count");
  assert(typeof likeOn.json?.data?.liked === "boolean", "like API returns boolean liked");

  const likeOff = await fetchJson(`/api/content/${articleApiSlug}/like`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fingerprint: likeFingerprint,
    }),
  });
  assert(likeOff.response.status === 200, "like API returns 200 on second toggle");
  assert(likeOff.json?.data?.liked === false, "like API toggles back to unliked");

  const unauthorizedAdminComments = await fetchJson("/api/admin/comments");
  assert(
    unauthorizedAdminComments.response.status === 403,
    "admin comments API rejects requests without workspace admin identity",
  );

  const adminPage = await fetchText("/admin", {
    headers: adminHeaders,
  });
  assert(
    adminPage.response.status === 200,
    "admin page returns 200 for workspace admin",
  );
  assert(adminPage.text.includes("后台运维面板"), "admin page contains dashboard heading");
  assert(adminPage.text.includes("Sync Logs"), "admin page contains sync logs block");
  assert(
    adminPage.text.includes("当前未绑定 GitHub App installation"),
    "admin page surfaces module sync risk hints",
  );
  assert(
    adminPage.text.includes("先登记 installation"),
    "admin page surfaces direct action links for module risks",
  );
  assert(
    adminPage.text.includes("补偿失败模块"),
    "admin page surfaces compensation sync action",
  );
  assert(
    adminPage.text.includes("需补配置"),
    "admin page surfaces module readiness badges",
  );
  assert(
    adminPage.text.includes('href="#module-installation-bindings"'),
    "admin page risk hints link to module installation bindings section",
  );

  const adminSyncLogs = await fetchJson("/api/admin/sync-logs", {
    headers: adminHeaders,
  });
  assert(adminSyncLogs.response.status === 200, "admin sync-logs API returns 200");
  assert(Array.isArray(adminSyncLogs.json?.data), "admin sync-logs API returns array");

  const manualSyncResponse = await fetchText("/admin/modules/sync", {
    method: "POST",
    headers: {
      ...adminHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      moduleSlug: "human30",
    }).toString(),
  });
  assert(
    manualSyncResponse.response.status === 200,
    "admin manual sync route resolves to admin page",
  );
  assert(
    manualSyncResponse.text.includes("模块 human30 手动同步失败"),
    "admin manual sync failure state is surfaced",
  );
  assert(
    manualSyncResponse.text.includes("检查 installation / App 授权")
      || manualSyncResponse.text.includes("去登记 installation"),
    "manual sync failure surfaces actionable recovery guidance",
  );
  assert(
    manualSyncResponse.text.includes("授权异常")
      || manualSyncResponse.text.includes("Installation 缺失"),
    "manual sync failure surfaces structured failure category",
  );
  assert(
    manualSyncResponse.text.includes("重试同步"),
    "failed module shows retry sync action",
  );

  const compensateSyncResponse = await fetchText("/admin/modules/compensate", {
    method: "POST",
    headers: {
      ...adminHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      scope: "failed",
    }).toString(),
  });
  assert(
    compensateSyncResponse.response.status === 200,
    "admin compensation sync route resolves to admin page",
  );
  assert(
    compensateSyncResponse.text.includes("失败模块补偿已执行"),
    "admin compensation sync summary is surfaced",
  );
  assert(
    compensateSyncResponse.text.includes("Run ID:"),
    "admin compensation sync summary exposes compensation run id",
  );
  assert(
    compensateSyncResponse.text.includes('href="#sync-logs"'),
    "admin compensation summary links to sync logs section",
  );
  assert(
    compensateSyncResponse.text.includes("再次补偿失败模块")
      || compensateSyncResponse.text.includes("最近一次补偿没有失败模块"),
    "admin compensation summary surfaces rerun action or a no-failure explanation",
  );
  assert(
    compensateSyncResponse.text.includes('href="#module-human30"'),
    "admin compensation summary links involved modules back to module cards",
  );

  const adminComments = await fetchJson("/api/admin/comments", {
    headers: adminHeaders,
  });
  assert(adminComments.response.status === 200, "admin comments API returns 200");
  assert(Array.isArray(adminComments.json?.data), "admin comments API returns array");

  if (failures.length > 0) {
    console.error(`Smoke tests completed with ${failures.length} failure(s).`);
    process.exit(1);
  }

  console.log("Smoke tests completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
