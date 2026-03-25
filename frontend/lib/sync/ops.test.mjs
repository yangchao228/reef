import test from "node:test";
import assert from "node:assert/strict";

import { getCompensationBatch } from "./ops.mjs";

test("getCompensationBatch groups logs by explicit compensation run id", () => {
  const logs = [
    { id: "1", compensationRunId: "run-b", triggerType: "cron" },
    { id: "2", compensationRunId: "run-a", triggerType: "cron" },
    { id: "3", compensationRunId: "run-b", triggerType: "cron" },
  ];

  const batch = getCompensationBatch(logs, "run-b");

  assert.equal(batch.compensationRunId, "run-b");
  assert.deepEqual(batch.logs.map((log) => log.id), ["1", "3"]);
});

test("getCompensationBatch falls back to latest compensation run id in logs", () => {
  const logs = [
    { id: "1", compensationRunId: "run-c", triggerType: "cron" },
    { id: "2", compensationRunId: "run-b", triggerType: "cron" },
    { id: "3", triggerType: "manual" },
  ];

  const batch = getCompensationBatch(logs);

  assert.equal(batch.compensationRunId, "run-c");
  assert.deepEqual(batch.logs.map((log) => log.id), ["1"]);
});

test("getCompensationBatch falls back to latest contiguous cron batch for legacy logs", () => {
  const logs = [
    { id: "1", triggerType: "manual" },
    { id: "2", triggerType: "cron" },
    { id: "3", triggerType: "cron" },
    { id: "4", triggerType: "manual" },
    { id: "5", triggerType: "cron" },
  ];

  const batch = getCompensationBatch(logs);

  assert.equal(batch.compensationRunId, null);
  assert.deepEqual(batch.logs.map((log) => log.id), ["2", "3"]);
});

test("getCompensationBatch returns empty batch when no cron or compensation run exists", () => {
  const batch = getCompensationBatch([
    { id: "1", triggerType: "manual" },
    { id: "2", triggerType: "webhook" },
  ]);

  assert.equal(batch.compensationRunId, null);
  assert.deepEqual(batch.logs, []);
});
