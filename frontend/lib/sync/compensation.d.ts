declare module "@/lib/sync/compensation.mjs" {
export interface CompensationTargetEvent {
    moduleSlug: string;
    status: "completed" | "failed" | "skipped";
    code?: string;
    message: string;
    failureCategory?: string;
    recoveryAction?: string;
    isRetryable?: boolean;
    operatorSummary?: string;
  }

  export interface WorkspaceCompensationSummary {
    compensationRunId: string;
    workspaceSlug: string;
    triggerScope: string;
    dedupeWindowMinutes: number;
    attempted: number;
    completed: number;
    failed: number;
    skipped: number;
    scanned: number;
    events: CompensationTargetEvent[];
  }

  export function listCompensationTargets(
    sql: {
      [key: string]: unknown;
    },
    options: {
      workspaceSlug: string;
      moduleSlug?: string | null;
      onlyFailed?: boolean;
      limit?: number;
    },
  ): Promise<Array<Record<string, unknown>>>;

  export function runWorkspaceCompensationSync(options: {
    workspaceSlug: string;
    moduleSlug?: string | null;
    onlyFailed?: boolean;
    purgeMissing?: boolean;
    limit?: number;
    dedupeWindowMinutes?: number;
    sqlClient?: {
      end(): Promise<void>;
    };
  }): Promise<WorkspaceCompensationSummary>;

  export function getCompensationTriggerScope(options: {
    moduleSlug?: string | null;
    onlyFailed?: boolean;
  }): string;

  export function createCompensationAdvisoryLockKey(workspaceSlug: string): bigint;

  export function isCompensationGuardErrorCode(code?: string | null): boolean;
}
