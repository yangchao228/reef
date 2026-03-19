import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const articleSlug = "我的Openclaw免费使用经验分享";
const articlePath = `/human30/${encodeURIComponent(articleSlug)}`;
const articleApiSlug = encodeURIComponent(articleSlug);

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
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { response, text };
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
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

  const adminPage = await fetchText("/admin", {
    headers: {
      "X-Forwarded-For": "127.0.0.1",
    },
  });
  assert(adminPage.response.status === 200, "admin page returns 200 for allowlisted IP");
  assert(adminPage.text.includes("后台运维面板"), "admin page contains dashboard heading");
  assert(adminPage.text.includes("Sync Logs"), "admin page contains sync logs block");

  const adminSyncLogs = await fetchJson("/api/admin/sync-logs", {
    headers: {
      "X-Forwarded-For": "127.0.0.1",
    },
  });
  assert(adminSyncLogs.response.status === 200, "admin sync-logs API returns 200");
  assert(Array.isArray(adminSyncLogs.json?.data), "admin sync-logs API returns array");

  const adminComments = await fetchJson("/api/admin/comments", {
    headers: {
      "X-Forwarded-For": "127.0.0.1",
    },
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
