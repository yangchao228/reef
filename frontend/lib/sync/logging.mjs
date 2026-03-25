const CATEGORY_DEFAULTS = {
  installation_required: {
    recoveryAction: "bind_github_installation",
    isRetryable: false,
    operatorSummary:
      "当前模块缺少可用的 GitHub App installation 绑定。请先完成 installation 绑定，再重试同步。",
  },
  authorization_required: {
    recoveryAction: "check_github_authorization",
    isRetryable: false,
    operatorSummary:
      "GitHub 授权或 App 凭据不可用。请先检查 installation token、App 私钥或用户授权配置，再重试。",
  },
  watch_paths_invalid: {
    recoveryAction: "check_module_sync_config",
    isRetryable: false,
    operatorSummary:
      "模块缺少有效的 watch paths。请先修正模块同步配置，再重新触发同步。",
  },
  repo_config_invalid: {
    recoveryAction: "check_repo_binding",
    isRetryable: false,
    operatorSummary:
      "仓库、分支或路径配置无效，或当前授权无权读取对应内容。请先核对 repo 绑定与路径配置。",
  },
  github_api_temporary: {
    recoveryAction: "retry_later",
    isRetryable: true,
    operatorSummary:
      "GitHub API 暂时不可用或触发限流。可以稍后重试，若持续失败再检查 App 与网络配置。",
  },
  content_parse_failed: {
    recoveryAction: "fix_markdown_content",
    isRetryable: false,
    operatorSummary:
      "GitHub 内容已拉取，但 Markdown 或 frontmatter 解析失败。请先修正文档内容后再重试。",
  },
  unknown: {
    recoveryAction: "inspect_sync_log",
    isRetryable: false,
    operatorSummary:
      "同步失败，但当前无法自动归类。请先查看原始错误和最近同步日志，再决定下一步动作。",
  },
};

const CODE_CATEGORY_MAP = {
  GITHUB_APP_INSTALLATION_REQUIRED: "installation_required",
  GITHUB_INSTALLATION_NOT_FOUND: "installation_required",
  GITHUB_TOKEN_MISSING: "authorization_required",
  GITHUB_INSTALLATION_TOKEN_MISSING: "authorization_required",
  GITHUB_APP_CONFIG_INVALID: "authorization_required",
  GITHUB_INSTALLATION_TOKEN_RESPONSE_INVALID: "authorization_required",
  GITHUB_INSTALLATION_LOOKUP_FAILED: "authorization_required",
  GITHUB_AUTH_FAILED: "authorization_required",
  WATCH_PATHS_EMPTY: "watch_paths_invalid",
  MODULE_SYNC_CONFIG_INVALID: "watch_paths_invalid",
  GITHUB_CONTENT_NOT_FOUND: "repo_config_invalid",
  UNSUPPORTED_MODULE: "repo_config_invalid",
  SYNC_WORKSPACE_REQUIRED: "repo_config_invalid",
  GITHUB_API_RATE_LIMIT: "github_api_temporary",
  GITHUB_REQUEST_FAILED: "github_api_temporary",
  GITHUB_INSTALLATION_TOKEN_REQUEST_FAILED: "github_api_temporary",
  MARKDOWN_PARSE_FAILED: "content_parse_failed",
};

function normalizeCode(error) {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return "SYNC_FAILED";
}

function normalizeMessage(error) {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "同步失败。";
}

function normalizeDetails(error) {
  if (error instanceof Error && "details" in error) {
    return error.details ?? null;
  }

  if (error && typeof error === "object" && "details" in error) {
    return error.details ?? null;
  }

  return null;
}

function deriveCategoryFromCode(code, details) {
  if (CODE_CATEGORY_MAP[code]) {
    return CODE_CATEGORY_MAP[code];
  }

  const responseStatus =
    details &&
    typeof details === "object" &&
    "responseStatus" in details &&
    typeof details.responseStatus === "number"
      ? details.responseStatus
      : null;

  if (responseStatus && responseStatus >= 500) {
    return "github_api_temporary";
  }

  return "unknown";
}

function normalizeStoredBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

export function buildSyncErrorPayload(error) {
  const code = normalizeCode(error);
  const message = normalizeMessage(error);
  const details = normalizeDetails(error);
  const failureCategory = deriveCategoryFromCode(code, details);
  const defaults = CATEGORY_DEFAULTS[failureCategory] ?? CATEGORY_DEFAULTS.unknown;

  return {
    code,
    message,
    details,
    failureCategory,
    recoveryAction: defaults.recoveryAction,
    isRetryable: defaults.isRetryable,
    operatorSummary: defaults.operatorSummary,
  };
}

export function classifySyncError(error) {
  const payload = buildSyncErrorPayload(error);

  return {
    code: payload.code,
    message: payload.message,
    failureCategory: payload.failureCategory,
    recoveryAction: payload.recoveryAction,
    isRetryable: payload.isRetryable,
    operatorSummary: payload.operatorSummary,
  };
}

export function serializeSyncError(error) {
  return JSON.stringify(buildSyncErrorPayload(error));
}

export function parseStoredSyncErrorDetail(errorDetail) {
  if (!errorDetail) {
    return {
      errorCode: undefined,
      errorMessage: undefined,
      failureCategory: undefined,
      recoveryAction: undefined,
      isRetryable: undefined,
      operatorSummary: undefined,
      details: null,
    };
  }

  try {
    const parsed = JSON.parse(errorDetail);
    const fallbackPayload = buildSyncErrorPayload({
      code:
        parsed && typeof parsed === "object" && typeof parsed.code === "string"
          ? parsed.code
          : "SYNC_FAILED",
      message:
        parsed && typeof parsed === "object" && typeof parsed.message === "string"
          ? parsed.message
          : errorDetail,
      details:
        parsed && typeof parsed === "object" && "details" in parsed
          ? parsed.details ?? null
          : null,
    });

    return {
      errorCode:
        parsed && typeof parsed === "object" && typeof parsed.code === "string"
          ? parsed.code
          : fallbackPayload.code,
      errorMessage:
        parsed && typeof parsed === "object" && typeof parsed.message === "string"
          ? parsed.message
          : fallbackPayload.message,
      failureCategory:
        parsed && typeof parsed === "object" && typeof parsed.failureCategory === "string"
          ? parsed.failureCategory
          : fallbackPayload.failureCategory,
      recoveryAction:
        parsed && typeof parsed === "object" && typeof parsed.recoveryAction === "string"
          ? parsed.recoveryAction
          : fallbackPayload.recoveryAction,
      isRetryable:
        parsed && typeof parsed === "object"
          ? normalizeStoredBoolean(parsed.isRetryable) ?? fallbackPayload.isRetryable
          : fallbackPayload.isRetryable,
      operatorSummary:
        parsed && typeof parsed === "object" && typeof parsed.operatorSummary === "string"
          ? parsed.operatorSummary
          : fallbackPayload.operatorSummary,
      details:
        parsed && typeof parsed === "object" && "details" in parsed
          ? parsed.details ?? null
          : null,
    };
  } catch {
    return {
      errorCode: undefined,
      errorMessage: errorDetail,
      failureCategory: undefined,
      recoveryAction: undefined,
      isRetryable: undefined,
      operatorSummary: errorDetail,
      details: null,
    };
  }
}
