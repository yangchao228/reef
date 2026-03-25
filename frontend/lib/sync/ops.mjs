export function getCompensationBatch(syncLogs, requestedCompensationRunId = null) {
  const explicitRunId = requestedCompensationRunId?.trim() || null;
  const latestRunId = syncLogs.find((log) => log.compensationRunId)?.compensationRunId ?? null;
  const targetRunId = explicitRunId || latestRunId;

  if (targetRunId) {
    return {
      compensationRunId: targetRunId,
      logs: syncLogs.filter((log) => log.compensationRunId === targetRunId),
    };
  }

  const latestCronIndex = syncLogs.findIndex((log) => log.triggerType === "cron");
  if (latestCronIndex === -1) {
    return {
      compensationRunId: null,
      logs: [],
    };
  }

  const logs = [];
  for (let index = latestCronIndex; index < syncLogs.length; index += 1) {
    const log = syncLogs[index];
    if (log.triggerType !== "cron") {
      break;
    }
    logs.push(log);
  }

  return {
    compensationRunId: null,
    logs,
  };
}
