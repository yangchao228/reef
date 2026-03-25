import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSyncErrorPayload,
  parseStoredSyncErrorDetail,
  serializeSyncError,
} from "./logging.mjs";

test("buildSyncErrorPayload classifies installation requirement errors", () => {
  const error = new Error("missing installation");
  error.code = "GITHUB_APP_INSTALLATION_REQUIRED";

  const payload = buildSyncErrorPayload(error);

  assert.equal(payload.failureCategory, "installation_required");
  assert.equal(payload.recoveryAction, "bind_github_installation");
  assert.equal(payload.isRetryable, false);
});

test("buildSyncErrorPayload classifies temporary GitHub API failures as retryable", () => {
  const error = new Error("rate limit");
  error.code = "GITHUB_API_RATE_LIMIT";

  const payload = buildSyncErrorPayload(error);

  assert.equal(payload.failureCategory, "github_api_temporary");
  assert.equal(payload.recoveryAction, "retry_later");
  assert.equal(payload.isRetryable, true);
});

test("buildSyncErrorPayload classifies authorization failures", () => {
  const error = new Error("token missing");
  error.code = "GITHUB_INSTALLATION_TOKEN_MISSING";

  const payload = buildSyncErrorPayload(error);

  assert.equal(payload.failureCategory, "authorization_required");
  assert.equal(payload.recoveryAction, "check_github_authorization");
  assert.equal(payload.isRetryable, false);
});

test("buildSyncErrorPayload classifies watch path configuration failures", () => {
  const error = new Error("watch paths empty");
  error.code = "WATCH_PATHS_EMPTY";

  const payload = buildSyncErrorPayload(error);

  assert.equal(payload.failureCategory, "watch_paths_invalid");
  assert.equal(payload.recoveryAction, "check_module_sync_config");
  assert.equal(payload.isRetryable, false);
});

test("buildSyncErrorPayload falls back to temporary GitHub failure for 5xx response details", () => {
  const payload = buildSyncErrorPayload({
    code: "SYNC_FAILED",
    message: "upstream failed",
    details: {
      responseStatus: 502,
    },
  });

  assert.equal(payload.failureCategory, "github_api_temporary");
  assert.equal(payload.recoveryAction, "retry_later");
  assert.equal(payload.isRetryable, true);
});

test("parseStoredSyncErrorDetail keeps structured fields from serialized payload", () => {
  const error = new Error("markdown parse failed");
  error.code = "MARKDOWN_PARSE_FAILED";
  error.details = { filePath: "content/a.md" };

  const parsed = parseStoredSyncErrorDetail(serializeSyncError(error));

  assert.equal(parsed.errorCode, "MARKDOWN_PARSE_FAILED");
  assert.equal(parsed.failureCategory, "content_parse_failed");
  assert.equal(parsed.recoveryAction, "fix_markdown_content");
  assert.equal(parsed.isRetryable, false);
  assert.deepEqual(parsed.details, { filePath: "content/a.md" });
});

test("parseStoredSyncErrorDetail falls back for legacy plain-text errors", () => {
  const parsed = parseStoredSyncErrorDetail("legacy sync error");

  assert.equal(parsed.errorCode, undefined);
  assert.equal(parsed.errorMessage, "legacy sync error");
  assert.equal(parsed.operatorSummary, "legacy sync error");
});
