declare module "@/lib/sync/ops.mjs" {
  export interface SyncLogLike {
    module?: string;
    compensationRunId?: string;
    triggerType: "webhook" | "cron" | "manual";
    status?: "pending" | "completed" | "failed";
    errorCode?: string;
    errorMessage?: string;
    operatorSummary?: string;
    startedAt?: string;
  }

  export function getCompensationBatch(
    syncLogs: SyncLogLike[],
    requestedCompensationRunId?: string | null,
  ): {
    compensationRunId: string | null;
    logs: SyncLogLike[];
  };
}
