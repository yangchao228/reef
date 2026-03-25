import test from "node:test";
import assert from "node:assert/strict";

import {
  createCompensationAdvisoryLockKey,
  getCompensationTriggerScope,
  isCompensationGuardErrorCode,
} from "./compensation.mjs";

test("getCompensationTriggerScope resolves workspace-wide failed compensation scope", () => {
  assert.equal(
    getCompensationTriggerScope({ onlyFailed: true }),
    "only_failed",
  );
});

test("getCompensationTriggerScope resolves explicit module scope", () => {
  assert.equal(
    getCompensationTriggerScope({ moduleSlug: "human30", onlyFailed: false }),
    "module",
  );
});

test("createCompensationAdvisoryLockKey is deterministic per workspace", () => {
  const left = createCompensationAdvisoryLockKey("demo-space");
  const right = createCompensationAdvisoryLockKey("demo-space");
  const other = createCompensationAdvisoryLockKey("other-space");

  assert.equal(left, right);
  assert.notEqual(left, other);
});

test("isCompensationGuardErrorCode marks non-fatal guard conditions", () => {
  assert.equal(isCompensationGuardErrorCode("COMPENSATION_ALREADY_RUNNING"), true);
  assert.equal(isCompensationGuardErrorCode("COMPENSATION_RECENT_DUPLICATE"), true);
  assert.equal(isCompensationGuardErrorCode("SYNC_FAILED"), false);
});
