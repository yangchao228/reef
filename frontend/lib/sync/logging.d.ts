declare module "@/lib/sync/logging.mjs" {
  export interface StoredSyncErrorDetail {
    errorCode?: string;
    errorMessage?: string;
    failureCategory?: string;
    recoveryAction?: string;
    isRetryable?: boolean;
    operatorSummary?: string;
    details: unknown;
  }

  export interface SyncErrorPayload {
    code: string;
    message: string;
    details: unknown;
    failureCategory: string;
    recoveryAction: string;
    isRetryable: boolean;
    operatorSummary: string;
  }

  export function buildSyncErrorPayload(error: unknown): SyncErrorPayload;

  export function classifySyncError(error: unknown): {
    code: string;
    message: string;
    failureCategory: string;
    recoveryAction: string;
    isRetryable: boolean;
    operatorSummary: string;
  };

  export function serializeSyncError(error: unknown): string;

  export function parseStoredSyncErrorDetail(
    errorDetail: string | null,
  ): StoredSyncErrorDetail;
}
