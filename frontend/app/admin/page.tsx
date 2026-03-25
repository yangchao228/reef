import { cookies, headers } from "next/headers";

import {
  listWorkspaceGitHubInstallations,
  listWorkspaceModuleBindings,
} from "@/lib/admin-settings-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { listPendingComments, listRecentSyncLogs } from "@/lib/content-repository";
import { hasGitHubOAuthConfig } from "@/lib/github-oauth";
import { getGitHubAppInstallUrl } from "@/lib/github-app";
import { getCompensationBatch } from "@/lib/sync/ops.mjs";
import type { AdminModuleBindingRecord } from "@/lib/types";
import { resolveUserAuthSource } from "@/lib/user-session";

export const dynamic = "force-dynamic";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusBadgeClass(status: "pending" | "completed" | "failed") {
  if (status === "completed") {
    return "border-[#1D9E75]/30 bg-[#1D9E75]/10 text-[#1D9E75]";
  }

  if (status === "failed") {
    return "border-[#C45D4C]/30 bg-[#C45D4C]/10 text-[#C45D4C]";
  }

  return "border-border bg-bg text-t3";
}

function getSyncAuthSourceLabel(authSource?: string | null) {
  if (authSource === "github_app_installation") {
    return "GitHub App installation";
  }

  if (authSource === "manual_global_token") {
    return "开发态手动 GITHUB_TOKEN";
  }

  if (authSource === "dev_global_token") {
    return "开发态 GITHUB_TOKEN";
  }

  return authSource ?? null;
}

function getSyncErrorDisplayMessage(errorCode?: string | null) {
  if (errorCode === "GITHUB_APP_INSTALLATION_REQUIRED") {
    return "当前模块还没有绑定 GitHub App installation，自动同步无法继续。";
  }

  if (errorCode === "GITHUB_TOKEN_MISSING") {
    return "服务端缺少可用的 GitHub 授权。请先完成 installation 绑定；开发环境若只是临时补偿，也可显式提供 GITHUB_TOKEN。";
  }

  if (errorCode === "GITHUB_INSTALLATION_TOKEN_MISSING") {
    return "当前 workspace 已绑定 installation，但服务端拿不到可用 installation token。请检查 App 私钥或本地 token 映射。";
  }

  if (errorCode === "GITHUB_CONTENT_NOT_FOUND") {
    return "GitHub 仓库、目录或权限配置不正确，当前内容拉取失败。";
  }

  if (errorCode === "GITHUB_API_RATE_LIMIT") {
    return "GitHub API 触发速率限制，请稍后再试。";
  }

  if (errorCode === "MODULE_SYNC_CONFIG_INVALID") {
    return "模块缺少 watch paths 或同步配置不完整。";
  }

  return errorCode ?? null;
}

function getSyncOperatorSummary(log?: {
  errorCode?: string;
  errorMessage?: string;
  operatorSummary?: string;
} | null) {
  if (!log) {
    return null;
  }

  return log.operatorSummary
    ?? getSyncErrorDisplayMessage(log.errorCode)
    ?? log.errorMessage
    ?? null;
}

function getFailureCategoryLabel(category?: string | null) {
  if (category === "installation_required") {
    return "Installation 缺失";
  }

  if (category === "authorization_required") {
    return "授权异常";
  }

  if (category === "watch_paths_invalid") {
    return "Watch Paths 配置";
  }

  if (category === "repo_config_invalid") {
    return "仓库配置";
  }

  if (category === "github_api_temporary") {
    return "GitHub 临时故障";
  }

  if (category === "content_parse_failed") {
    return "内容解析";
  }

  return null;
}

function getRecoveryActionLink(
  recoveryAction?: string | null,
  moduleSlug?: string | null,
) {
  if (recoveryAction === "bind_github_installation") {
    return {
      href: "#installation-settings",
      label: "去登记 installation",
    };
  }

  if (recoveryAction === "check_github_authorization") {
    return {
      href: "#installation-settings",
      label: "检查 installation / App 授权",
    };
  }

  if (recoveryAction === "check_module_sync_config") {
    return {
      href: moduleSlug ? `#module-${moduleSlug}` : "#module-installation-bindings",
      label: "检查模块配置",
    };
  }

  if (recoveryAction === "check_repo_binding") {
    return {
      href: moduleSlug ? `#module-${moduleSlug}` : "#module-installation-bindings",
      label: "检查仓库绑定",
    };
  }

  if (recoveryAction === "retry_later") {
    return {
      href: "#sync-logs",
      label: "稍后重试并看日志",
    };
  }

  if (recoveryAction === "fix_markdown_content") {
    return {
      href: moduleSlug ? `#module-${moduleSlug}` : "#sync-logs",
      label: "先修内容再重试",
    };
  }

  if (recoveryAction === "inspect_sync_log") {
    return {
      href: "#sync-logs",
      label: "查看同步日志",
    };
  }

  return null;
}

function getFailureTone(category?: string | null, isRetryable?: boolean) {
  if (category === "github_api_temporary" || isRetryable) {
    return "warning";
  }

  if (category === "installation_required" || category === "authorization_required") {
    return "critical";
  }

  return "info";
}

function getFailureToneClass(tone: "critical" | "warning" | "info") {
  if (tone === "critical") {
    return "border-[#C45D4C]/30 bg-[#C45D4C]/8 text-[#C45D4C]";
  }

  if (tone === "warning") {
    return "border-[#C99538]/30 bg-[#C99538]/10 text-[#9A6B12]";
  }

  return "border-border bg-bg-card text-t3";
}

function getModuleRiskItems(module: AdminModuleBindingRecord) {
  const risks: Array<{
    tone: "warning" | "critical" | "info";
    message: string;
    actionHref?: string;
    actionLabel?: string;
  }> = [];

  if (!module.currentInstallation) {
    risks.push({
      tone: "critical",
      message:
        "当前未绑定 GitHub App installation，webhook/cron 自动同步不可用；手动同步也只适合开发态补偿。",
      actionHref: "#installation-settings",
      actionLabel: "先登记 installation",
    });
  }

  if (module.watchPaths.length === 0) {
    risks.push({
      tone: "critical",
      message: "当前模块没有 watch paths，手动同步和自动同步都不会拉取任何内容。",
    });
  }

  if (module.recentSync?.status === "failed") {
    const recoveryAction = getRecoveryActionLink(
      module.recentSync.recoveryAction,
      module.slug,
    );
    risks.push({
      tone: getFailureTone(
        module.recentSync.failureCategory,
        module.recentSync.isRetryable,
      ),
      message:
        getSyncOperatorSummary(module.recentSync)
        ?? "最近一次同步失败，建议先修复配置或授权问题，再执行重试。",
      actionHref: recoveryAction?.href,
      actionLabel: recoveryAction?.label,
    });
  }

  if (!module.recentSync) {
    risks.push({
      tone: "info",
      message: "当前还没有同步记录，建议先做一次手动同步验证模块配置。",
      actionHref: "#module-installation-bindings",
      actionLabel: "去模块配置区确认",
    });
  }

  return risks;
}

function getRiskToneClass(tone: "warning" | "critical" | "info") {
  if (tone === "critical") {
    return "border-[#C45D4C]/30 bg-[#C45D4C]/8 text-[#C45D4C]";
  }

  if (tone === "warning") {
    return "border-[#C99538]/30 bg-[#C99538]/10 text-[#9A6B12]";
  }

  return "border-border bg-bg-card text-t3";
}

function getModuleReadiness(module: AdminModuleBindingRecord) {
  if (module.currentInstallation && module.watchPaths.length > 0) {
    return {
      label: "自动同步已就绪",
      className: "border-[#1D9E75]/30 bg-[#1D9E75]/10 text-[#1D9E75]",
    };
  }

  return {
    label: "需补配置",
    className: "border-[#C45D4C]/30 bg-[#C45D4C]/8 text-[#C45D4C]",
  };
}

function getSettingsMessage(
  settings?: string,
  autoBound?: string,
  extras?: {
    module?: string;
    count?: string;
    authSource?: string;
    errorCode?: string;
    attempted?: string;
    completed?: string;
    failed?: string;
    skipped?: string;
    scope?: string;
    compensationRunId?: string;
  },
) {
  const autoBoundCount = Number(autoBound ?? "0");
  const hasAutoBound = Number.isFinite(autoBoundCount) && autoBoundCount > 0;
  const importedCount = Number(extras?.count ?? "0");
  const hasImportedCount = Number.isFinite(importedCount) && importedCount >= 0;
  const targetModule = extras?.module?.trim() ?? "unknown";

  if (settings === "installation_saved") {
    return hasAutoBound
      ? `GitHub App installation 已保存，并自动绑定了 ${autoBoundCount} 个模块。`
      : "GitHub App installation 已保存到当前 workspace。";
  }

  if (settings === "comment_approved") {
    return "评论已通过审核，并会出现在前台评论列表。";
  }

  if (settings === "comment_rejected") {
    return "评论已拒绝，不会出现在前台评论列表。";
  }

  if (settings === "comment_missing_id") {
    return "审核失败：缺少评论 id。";
  }

  if (settings === "comment_invalid_decision") {
    return "审核失败：decision 只能是 approved 或 rejected。";
  }

  if (settings === "comment_review_missing") {
    return "评论不存在，或已经被其他管理员处理。";
  }

  if (settings === "module_sync_completed") {
    const countLabel = hasImportedCount ? `${importedCount} 篇 Markdown` : "最新内容";
    const authSource = getSyncAuthSourceLabel(extras?.authSource?.trim());
    return authSource
      ? `模块 ${targetModule} 已完成手动同步，拉取了 ${countLabel}，授权来源：${authSource}。`
      : `模块 ${targetModule} 已完成手动同步，拉取了 ${countLabel}。`;
  }

  if (settings === "module_sync_missing_module") {
    return "手动同步失败：缺少目标模块。";
  }

  if (settings === "module_sync_invalid_config") {
    return `模块 ${targetModule} 缺少 watch paths 或同步配置不完整，无法发起手动同步。`;
  }

  if (settings === "module_sync_failed") {
    const errorLabel = getSyncErrorDisplayMessage(extras?.errorCode?.trim());
    return errorLabel
      ? `模块 ${targetModule} 手动同步失败：${errorLabel}`
      : `模块 ${targetModule} 手动同步失败，请检查 GitHub 授权和 watch paths 配置。`;
  }

  if (settings === "compensate_sync_no_targets") {
    return extras?.scope === "all"
      ? "当前 workspace 没有可执行补偿同步的 GitHub 模块。"
      : "当前 workspace 没有最近失败且可执行补偿同步的 GitHub 模块。";
  }

  if (settings === "compensate_sync_completed" || settings === "compensate_sync_partial") {
    const attempted = Number(extras?.attempted ?? "0");
    const completed = Number(extras?.completed ?? "0");
    const failed = Number(extras?.failed ?? "0");
    const skipped = Number(extras?.skipped ?? "0");
    const scopeLabel = extras?.scope === "all" ? "全量补偿" : "失败模块补偿";
    const summary =
      `${scopeLabel}已执行：尝试 ${attempted} 个模块，成功 ${completed}，失败 ${failed}，跳过 ${skipped}。`;
    return settings === "compensate_sync_partial"
      ? `${summary} 请查看最近同步日志中的失败原因。`
      : summary;
  }

  if (settings === "compensate_sync_failed") {
    const errorLabel = getSyncErrorDisplayMessage(extras?.errorCode?.trim());
    return errorLabel
      ? `补偿同步启动失败：${errorLabel}`
      : "补偿同步启动失败，请检查当前 workspace 的同步配置。";
  }

  if (settings === "compensate_sync_running") {
    return "补偿同步未执行：当前 workspace 已有补偿任务在运行，请等待当前任务结束。";
  }

  if (settings === "compensate_sync_recent_duplicate") {
    return extras?.compensationRunId
      ? `补偿同步未重复执行：短时间窗口内已完成同范围补偿，可直接查看 Run ID ${extras.compensationRunId} 的结果。`
      : "补偿同步未重复执行：短时间窗口内已完成同范围补偿。";
  }

  if (settings === "binding_saved") {
    return "模块与 installation 的绑定已更新。";
  }

  if (settings === "installation_invalid_id") {
    return "installation id 必须是正整数。";
  }

  if (settings === "installation_missing_login") {
    return "GitHub account login 不能为空。";
  }

  if (settings === "installation_invalid_permissions") {
    return "permissions 必须是合法 JSON 对象。";
  }

  if (settings === "installation_conflict") {
    return "installation 保存失败：当前 workspace 内存在冲突记录。";
  }

  if (settings === "installation_state_invalid") {
    return "GitHub App 安装回调已失效，或当前登录身份与发起安装时不一致。";
  }

  if (settings === "installation_request_pending") {
    return "本次安装需要组织审批，待审批通过后再返回这里确认。";
  }

  if (settings === "installation_lookup_failed") {
    return "安装回调已到达，但服务端无法从 GitHub 读取 installation 元数据。";
  }

  if (settings === "installation_app_config_missing") {
    return "服务端未配置 GITHUB_APP_NAME / GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY，无法完成安装回调。";
  }

  if (settings === "installation_metadata_missing") {
    return "GitHub 已返回 installation，但缺少 account 元数据，无法自动入库。";
  }

  if (settings === "installation_oauth_required") {
    return "当前登录不是 GitHub OAuth 身份。请先用 GitHub OAuth 登录，再发起安装回调。";
  }

  if (settings === "installation_oauth_expired") {
    return "当前 GitHub OAuth 会话已过期，或 refresh token 已失效。请重新完成 GitHub OAuth 登录后再继续安装绑定。";
  }

  if (settings === "installation_not_accessible") {
    return "当前 GitHub 用户无法访问这个 installation，不能把它绑定到当前 workspace。";
  }

  if (settings === "installation_access_check_failed") {
    return "无法校验当前 GitHub 用户是否能访问该 installation，请稍后重试。";
  }

  if (settings === "binding_installation_missing") {
    return "绑定失败：目标 installation 不存在，或不属于当前 workspace。";
  }

  if (settings === "binding_module_missing") {
    return "绑定失败：目标模块不存在。";
  }

  if (settings === "unauthorized") {
    return "当前请求没有可用的管理员身份。";
  }

  if (settings === "installation_save_failed") {
    return "installation 保存失败，请检查输入后重试。";
  }

  if (settings === "binding_failed" || settings === "binding_missing_module") {
    return "模块绑定失败，请刷新页面后重试。";
  }

  return null;
}

function getCompensationSummary(
  syncLogs: Awaited<ReturnType<typeof listRecentSyncLogs>>,
  extras?: {
    settings?: string;
    attempted?: string;
    completed?: string;
    failed?: string;
    skipped?: string;
    scope?: string;
    compensationRunId?: string;
  },
) {
  const batchResult = getCompensationBatch(syncLogs, extras?.compensationRunId);
  const batch = batchResult.logs;
  const shouldShowImmediateSummary =
    extras?.settings === "compensate_sync_completed"
    || extras?.settings === "compensate_sync_partial";

  if (batch.length === 0 && !shouldShowImmediateSummary) {
    return null;
  }

  const modules = Array.from(new Set(batch.map((log) => log.module)));
  const failedLog = batch.find((log) => log.status === "failed");
  const failureSummary = getSyncOperatorSummary(failedLog);
  const latestStartedAt = batch[0]?.startedAt;
  const baseSummary = {
    modules: modules.slice(0, 3),
    extraModuleCount: Math.max(0, modules.length - 3),
    failureSummary,
    compensationRunId: batchResult.compensationRunId ?? undefined,
  };

  return {
    ...(shouldShowImmediateSummary
      ? {
          label: extras.scope === "all" ? "刚执行的全量补偿" : "刚执行的失败模块补偿",
          attempted: Number(extras.attempted ?? "0"),
          completed: Number(extras.completed ?? "0"),
          failed: Number(extras.failed ?? "0"),
          skipped: Number(extras.skipped ?? "0"),
          whenLabel: "刚刚执行",
          compensationRunId: extras.compensationRunId?.trim()
            || batchResult.compensationRunId
            || undefined,
        }
      : {
          label: "最近一次补偿同步",
          attempted: batch.length,
          completed: batch.filter((log) => log.status === "completed").length,
          failed: batch.filter((log) => log.status === "failed").length,
          skipped: 0,
          whenLabel: latestStartedAt ? formatDateTime(latestStartedAt) : "最近一次执行",
        }),
    ...baseSummary,
  };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: {
    settings?: string;
    autoBound?: string;
    module?: string;
    count?: string;
    authSource?: string;
    errorCode?: string;
    attempted?: string;
    completed?: string;
    failed?: string;
    skipped?: string;
    scope?: string;
    compensationRunId?: string;
  };
}) {
  const requestHeaders = headers();
  const requestCookies = cookies();
  const adminAccess = await getAdminAccess(requestHeaders, requestCookies);
  const authSource = resolveUserAuthSource(requestCookies);
  const [pendingComments, recentSyncLogs, installations, moduleBindings] = adminAccess.allowed
    ? await Promise.all([
        listPendingComments(adminAccess.workspaceSlug),
        listRecentSyncLogs(30, adminAccess.workspaceSlug),
        listWorkspaceGitHubInstallations(adminAccess.workspaceSlug ?? ""),
        listWorkspaceModuleBindings(adminAccess.workspaceSlug ?? ""),
      ])
    : [[], [], [], []];
  const syncLogs = recentSyncLogs.slice(0, 12);
  const completedSyncs = syncLogs.filter((log) => log.status === "completed").length;
  const failedSyncs = syncLogs.filter((log) => log.status === "failed").length;
  const settingsMessage = getSettingsMessage(
    searchParams?.settings,
    searchParams?.autoBound,
    {
      module: searchParams?.module,
      count: searchParams?.count,
      authSource: searchParams?.authSource,
      errorCode: searchParams?.errorCode,
      attempted: searchParams?.attempted,
      completed: searchParams?.completed,
      failed: searchParams?.failed,
      skipped: searchParams?.skipped,
      scope: searchParams?.scope,
      compensationRunId: searchParams?.compensationRunId,
    },
  );
  const compensationSummary = getCompensationSummary(recentSyncLogs, {
    settings: searchParams?.settings,
    attempted: searchParams?.attempted,
    completed: searchParams?.completed,
    failed: searchParams?.failed,
    skipped: searchParams?.skipped,
    scope: searchParams?.scope,
    compensationRunId: searchParams?.compensationRunId,
  });
  const installUrl =
    adminAccess.allowed && adminAccess.workspaceSlug && adminAccess.actor.githubLogin
      ? getGitHubAppInstallUrl({
          workspaceSlug: adminAccess.workspaceSlug,
          actorLogin: adminAccess.actor.githubLogin,
        })
      : null;
  const canUseGitHubInstallFlow = Boolean(
    installUrl && hasGitHubOAuthConfig() && authSource === "github_oauth",
  );

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Admin Preview</p>
          <h1 className="mt-2 text-4xl text-t1">后台运维面板</h1>
          <p className="mt-4 text-sm leading-7 text-t2">
            当前后台按 workspace 成员关系鉴权。默认读取当前登录身份；调试时也可以显式传入
            `x-reef-user-login`。该账号在当前 workspace 内必须是 `owner` 或 `admin`。
          </p>
        </div>

        {settingsMessage ? (
          <div className="mt-6 rounded-2xl border border-border bg-bg-card p-5 text-sm text-t2">
            {settingsMessage}
          </div>
        ) : null}

        {!adminAccess.allowed ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
            {adminAccess.reason === "MISSING_WORKSPACE"
              ? "当前请求缺少 workspace 上下文，请传入 x-reef-workspace 或已有 reef_workspace cookie。"
              : adminAccess.reason === "MISSING_IDENTITY"
              ? "当前请求缺少登录身份，请先在 /workspaces 建立登录身份，或直接传入 x-reef-user-login。"
              : `当前账号 ${
                  adminAccess.actor.githubLogin ?? "unknown"
                } 不是 workspace ${adminAccess.workspaceSlug} 的管理员。`}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-2xl border border-border bg-bg-card p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-t4">Pending Comments</p>
                <p className="mt-3 text-3xl text-t1">{pendingComments.length}</p>
                <p className="mt-2 text-sm text-t3">待审核评论总数</p>
              </article>
              <article className="rounded-2xl border border-border bg-bg-card p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-t4">Recent Syncs</p>
                <p className="mt-3 text-3xl text-t1">{completedSyncs}</p>
                <p className="mt-2 text-sm text-t3">最近日志中的成功同步</p>
              </article>
              <article className="rounded-2xl border border-border bg-bg-card p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-t4">Failures</p>
                <p className="mt-3 text-3xl text-t1">{failedSyncs}</p>
                <p className="mt-2 text-sm text-t3">最近日志中的失败次数</p>
              </article>
              <article className="rounded-2xl border border-border bg-bg-card p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-t4">Compensation Sync</p>
                <p className="mt-3 text-lg text-t1">
                  {compensationSummary?.label ?? "最近一次补偿同步"}
                </p>
                {compensationSummary ? (
                  <>
                    <p className="mt-3 text-sm text-t2">
                      尝试 {compensationSummary.attempted} · 成功 {compensationSummary.completed} ·
                      失败 {compensationSummary.failed}
                      {compensationSummary.skipped > 0
                        ? ` · 跳过 ${compensationSummary.skipped}`
                        : ""}
                    </p>
                    <p className="mt-2 text-sm text-t3">{compensationSummary.whenLabel}</p>
                    {compensationSummary.compensationRunId ? (
                      <p className="mt-2 text-xs text-t4">
                        Run ID: {compensationSummary.compensationRunId}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-t3">
                      {compensationSummary.modules.map((module) => (
                        <a
                          className="rounded-full border border-border px-2.5 py-1 transition hover:border-pri hover:text-t1"
                          href={`#module-${module}`}
                          key={module}
                        >
                          {module}
                        </a>
                      ))}
                      {compensationSummary.extraModuleCount > 0 ? (
                        <span className="rounded-full border border-border px-2.5 py-1">
                          +{compensationSummary.extraModuleCount} 个模块
                        </span>
                      ) : null}
                    </div>
                    {compensationSummary.failureSummary ? (
                      <>
                        <p className="mt-3 text-sm leading-6 text-[#C45D4C]">
                          最近失败原因: {compensationSummary.failureSummary}
                        </p>
                        <form action="/admin/modules/compensate" className="mt-3" method="post">
                          <input name="scope" type="hidden" value="failed" />
                          <button
                            className="rounded-xl border border-[#C45D4C]/30 px-4 py-2.5 text-sm text-[#C45D4C] transition hover:border-[#C45D4C] hover:bg-[#C45D4C]/8"
                            type="submit"
                          >
                            再次补偿失败模块
                          </button>
                        </form>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-t3">最近一次补偿没有失败模块。</p>
                    )}
                    <div className="mt-4">
                      <a
                        className="text-sm text-pri-d underline underline-offset-4"
                        href="#sync-logs"
                      >
                        查看相关日志
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-7 text-t3">
                    还没有补偿同步记录。可以先用“补偿失败模块”触发一次补偿动作。
                  </p>
                )}
              </article>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-border bg-bg-card p-6" id="installation-settings">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-t4">
                      Comment Queue
                    </p>
                    <h2 className="mt-2 text-2xl text-t1">待审核评论</h2>
                  </div>
                  <span className="text-xs text-t3">{pendingComments.length} 条待处理</span>
                </div>

                <div className="mt-6 space-y-4">
                  {pendingComments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
                      目前没有待审核评论。
                    </div>
                  ) : (
                    pendingComments.map((comment) => (
                      <article
                        className="rounded-2xl border border-border bg-bg p-5"
                        key={comment.id}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-lg text-t1">{comment.nickname}</h3>
                            <p className="mt-1 text-sm text-t3">{comment.title}</p>
                          </div>
                          <div className="text-right text-xs text-t4">
                            <p>{comment.module}</p>
                            <p className="mt-1">{formatDateTime(comment.createdAt)}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-t2">{comment.body}</p>
                        <form
                          action="/admin/comments/review"
                          className="mt-4 flex flex-wrap gap-3"
                          method="post"
                        >
                          <input name="commentId" type="hidden" value={comment.id} />
                          <button
                            className="rounded-xl bg-pri-d px-4 py-2.5 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                            name="decision"
                            type="submit"
                            value="approved"
                          >
                            批准并发布
                          </button>
                          <button
                            className="rounded-xl border border-[#C45D4C]/30 px-4 py-2.5 text-sm text-[#C45D4C] transition hover:border-[#C45D4C] hover:bg-[#C45D4C]/8"
                            name="decision"
                            type="submit"
                            value="rejected"
                          >
                            拒绝
                          </button>
                        </form>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-bg-card p-6" id="sync-logs">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Sync Logs</p>
                    <h2 className="mt-2 text-2xl text-t1">最近同步</h2>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <form action="/admin/modules/compensate" method="post">
                      <input name="scope" type="hidden" value="failed" />
                      <button
                        className="rounded-xl border border-border px-4 py-2.5 text-sm text-t2 transition hover:border-pri hover:text-t1"
                        type="submit"
                      >
                        补偿失败模块
                      </button>
                    </form>
                    <span className="text-xs text-t3">{syncLogs.length} 条记录</span>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  {syncLogs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
                      还没有同步日志。
                    </div>
                  ) : (
                    syncLogs.map((log) => (
                      <article
                        className="rounded-2xl border border-border bg-bg p-5"
                        id={`sync-log-${log.id}`}
                        key={log.id}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-t1">{log.repoName}</span>
                              <span className="text-xs text-t4">{log.module}</span>
                              <span className="text-xs text-t4">/{log.triggerType}</span>
                              {getFailureCategoryLabel(log.failureCategory) ? (
                                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-t2">
                                  {getFailureCategoryLabel(log.failureCategory)}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs text-t3">
                              {formatDateTime(log.startedAt)}
                              {log.commitSha ? ` · ${log.commitSha.slice(0, 7)}` : ""}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${getStatusBadgeClass(log.status)}`}
                          >
                            {log.status}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-t3">
                          <span className="rounded-full border border-border px-2.5 py-1">
                            +{log.filesAdded}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1">
                            ~{log.filesModified}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1">
                            -{log.filesRemoved}
                          </span>
                        </div>

                        {getSyncOperatorSummary(log) ? (
                          <div
                            className={`mt-3 rounded-2xl border px-4 py-3 ${getFailureToneClass(
                              getFailureTone(log.failureCategory, log.isRetryable),
                            )}`}
                          >
                            <p className="text-sm leading-6">
                              {log.errorCode ? `${log.errorCode}: ` : ""}
                              {getSyncOperatorSummary(log)}
                            </p>
                            {log.recoveryAction ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full border border-current/20 px-2.5 py-1">
                                  {log.isRetryable ? "可重试" : "需先处理"}
                                </span>
                                {getRecoveryActionLink(log.recoveryAction, log.module) ? (
                                  <a
                                    className="underline underline-offset-4"
                                    href={getRecoveryActionLink(log.recoveryAction, log.module)?.href}
                                  >
                                    {getRecoveryActionLink(log.recoveryAction, log.module)?.label}
                                  </a>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
              <div
                className="rounded-[28px] border border-border bg-bg-card p-6"
                id="module-installation-bindings"
              >
                <p className="text-[11px] uppercase tracking-[0.24em] text-t4">
                  GitHub App Installations
                </p>
                <h2 className="mt-2 text-2xl text-t1">登记当前 workspace 的 installation</h2>
                <p className="mt-3 text-sm leading-7 text-t2">
                  当前先用后台表单维护 workspace 与 GitHub App installation 的绑定。真正的
                  App 安装动作仍在 GitHub 完成；如果已配置 `GITHUB_APP_NAME` 和 setup URL，
                  也可以直接从这里发起安装并自动回填 installation 元数据。
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {canUseGitHubInstallFlow ? (
                    <a
                      className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                      href={installUrl ?? "#"}
                    >
                      去 GitHub 安装 / 更新 App
                    </a>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-t3">
                      {hasGitHubOAuthConfig()
                        ? "要走自动安装回调，请先用 GitHub OAuth 登录当前账号。"
                        : "未配置 `GITHUB_APP_NAME` 或 GitHub OAuth/state secret，暂时只能手动登记 installation。"}
                    </div>
                  )}
                  <span className="text-sm text-t3">
                    GitHub App setup URL 建议指向 `/github-app/setup`。
                  </span>
                </div>

                <form action="/admin/installations" className="mt-5 grid gap-3" method="post">
                  <input
                    className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
                    inputMode="numeric"
                    name="githubInstallationId"
                    placeholder="Installation ID，例如 12345678"
                    required
                  />
                  <input
                    className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
                    name="githubAccountLogin"
                    placeholder="GitHub account login，例如 reef-org"
                    required
                  />
                  <select
                    className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none focus:border-pri"
                    defaultValue="organization"
                    name="githubAccountType"
                  >
                    <option value="organization">Organization</option>
                    <option value="user">User</option>
                  </select>
                  <textarea
                    className="min-h-24 rounded-2xl border border-border bg-bg px-4 py-3 text-sm leading-7 text-t1 outline-none placeholder:text-t4 focus:border-pri"
                    name="permissions"
                    placeholder='Permissions JSON，可选，例如 {"contents":"read","metadata":"read"}'
                  />
                  <textarea
                    className="min-h-20 rounded-2xl border border-border bg-bg px-4 py-3 text-sm leading-7 text-t1 outline-none placeholder:text-t4 focus:border-pri"
                    name="events"
                    placeholder="Webhook events，可选，逗号或换行分隔，例如 push, installation"
                  />
                  <button
                    className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                    type="submit"
                  >
                    保存 installation
                  </button>
                </form>

                <div className="mt-6 space-y-3">
                  {installations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
                      当前 workspace 还没有登记任何 installation。
                    </div>
                  ) : (
                    installations.map((installation) => (
                      <article className="rounded-2xl border border-border bg-bg p-5" key={installation.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--tag-c)]">
                            {installation.githubAccountType}
                          </span>
                          <span className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-t2">
                            #{installation.githubInstallationId}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg text-t1">{installation.githubAccountLogin}</h3>
                        <p className="mt-2 text-xs text-t3">
                          更新于 {formatDateTime(installation.updatedAt)}
                        </p>
                        <p className="mt-3 text-sm leading-7 text-t2">
                          Events: {installation.events.length > 0 ? installation.events.join(", ") : "未登记"}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-bg-card p-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-t4">
                  Module Installation Binding
                </p>
                <h2 className="mt-2 text-2xl text-t1">把模块绑定到 installation</h2>
                <p className="mt-3 text-sm leading-7 text-t2">
                  自动同步只认模块当前绑定的 installation。未绑定时，webhook/cron 主链不会降级到
                  全局 token。
                </p>

                <div className="mt-6 space-y-4">
                  {moduleBindings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
                      当前 workspace 还没有已登记模块。
                    </div>
                  ) : (
                    moduleBindings.map((module) => {
                      const riskItems = getModuleRiskItems(module);
                      const readiness = getModuleReadiness(module);

                      return (
                      <article
                        className="rounded-2xl border border-border bg-bg p-5"
                        id={`module-${module.slug}`}
                        key={module.id}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg text-t1">{module.name}</h3>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${readiness.className}`}
                              >
                                {readiness.label}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-t3">
                              {module.slug} · {module.githubOwner}/{module.githubRepo}
                            </p>
                          </div>
                          <span className="text-xs text-t4">
                            {module.currentInstallation
                              ? `当前: ${module.currentInstallation.githubAccountLogin} #${module.currentInstallation.githubInstallationId}`
                              : "当前未绑定"}
                          </span>
                        </div>

                        <p className="mt-3 text-sm leading-7 text-t2">
                          Watch paths: {module.watchPaths.length > 0 ? module.watchPaths.join(", ") : "未配置"}
                        </p>
                        <p className="mt-2 text-sm text-t3">Branch: {module.branch}</p>
                        <div className="mt-4 space-y-2">
                          {riskItems.map((risk, index) => (
                            <div
                              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${getRiskToneClass(risk.tone)}`}
                              key={`${module.id}-risk-${index}`}
                            >
                              {risk.message}
                              {risk.actionHref && risk.actionLabel ? (
                                <div className="mt-2">
                                  <a
                                    className="text-sm text-pri-d underline underline-offset-4"
                                    href={risk.actionHref}
                                  >
                                    {risk.actionLabel}
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {module.recentSync ? (
                          <div className="mt-4 rounded-2xl border border-border bg-bg-card p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${getStatusBadgeClass(module.recentSync.status)}`}
                              >
                                {module.recentSync.status}
                              </span>
                              <span className="text-xs text-t3">
                                最近一次 {module.recentSync.triggerType} · {formatDateTime(module.recentSync.startedAt)}
                              </span>
                            </div>
                            {getSyncOperatorSummary(module.recentSync) ? (
                              <div
                                className={`mt-3 rounded-2xl border px-4 py-3 ${getFailureToneClass(
                                  getFailureTone(
                                    module.recentSync.failureCategory,
                                    module.recentSync.isRetryable,
                                  ),
                                )}`}
                              >
                                <p className="text-sm leading-6">
                                  {getSyncOperatorSummary(module.recentSync)}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                  {getFailureCategoryLabel(module.recentSync.failureCategory) ? (
                                    <span className="rounded-full border border-current/20 px-2.5 py-1">
                                      {getFailureCategoryLabel(module.recentSync.failureCategory)}
                                    </span>
                                  ) : null}
                                  {module.recentSync.recoveryAction
                                    && getRecoveryActionLink(
                                      module.recentSync.recoveryAction,
                                      module.slug,
                                    ) ? (
                                    <a
                                      className="underline underline-offset-4"
                                      href={getRecoveryActionLink(
                                        module.recentSync.recoveryAction,
                                        module.slug,
                                      )?.href}
                                    >
                                      {
                                        getRecoveryActionLink(
                                          module.recentSync.recoveryAction,
                                          module.slug,
                                        )?.label
                                      }
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-t3">最近一次同步已完成，可直接再次补偿拉取。</p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-border p-4 text-sm text-t3">
                            这个模块还没有同步记录。
                          </div>
                        )}

                        <form action="/admin/modules/bind" className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" method="post">
                          <input name="moduleSlug" type="hidden" value={module.slug} />
                          <select
                            className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none focus:border-pri"
                            defaultValue={module.currentInstallation?.id ?? ""}
                            name="installationRowId"
                          >
                            <option value="">未绑定 installation</option>
                            {installations.map((installation) => (
                              <option key={installation.id} value={installation.id}>
                                {installation.githubAccountLogin} #{installation.githubInstallationId}
                              </option>
                            ))}
                          </select>
                          <button
                            className="rounded-xl border border-border px-5 py-3 text-sm text-t2 transition hover:border-pri hover:text-t1"
                            type="submit"
                          >
                            更新绑定
                          </button>
                        </form>

                        <form action="/admin/modules/sync" className="mt-3" method="post">
                          <input name="moduleSlug" type="hidden" value={module.slug} />
                          <button
                            className="rounded-xl border border-border px-5 py-3 text-sm text-t2 transition hover:border-pri hover:text-t1 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={module.watchPaths.length === 0}
                            type="submit"
                          >
                            {module.recentSync?.status === "failed" ? "重试同步" : "立即同步"}
                          </button>
                        </form>
                      </article>
                    );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
