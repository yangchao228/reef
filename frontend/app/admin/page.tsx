import { headers } from "next/headers";

import { canAccessAdmin } from "@/lib/admin-auth";
import { listPendingComments, listRecentSyncLogs } from "@/lib/content-repository";

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

export default async function AdminPage() {
  const requestHeaders = headers();
  const allowed = canAccessAdmin(requestHeaders);
  const pendingComments = allowed ? await listPendingComments() : [];
  const syncLogs = allowed ? await listRecentSyncLogs() : [];
  const completedSyncs = syncLogs.filter((log) => log.status === "completed").length;
  const failedSyncs = syncLogs.filter((log) => log.status === "failed").length;

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Admin Preview</p>
          <h1 className="mt-2 text-4xl text-t1">后台运维面板</h1>
          <p className="mt-4 text-sm leading-7 text-t2">
            首版暂不接 GitHub OAuth，当前用 `ADMIN_IP_ALLOWLIST` 做临时白名单保护。
            这里集中查看评论审核和最近同步状态。
          </p>
        </div>

        {!allowed ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
            当前请求未命中管理员 IP 白名单。
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
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
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[28px] border border-border bg-bg-card p-6">
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
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-bg-card p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Sync Logs</p>
                    <h2 className="mt-2 text-2xl text-t1">最近同步</h2>
                  </div>
                  <span className="text-xs text-t3">{syncLogs.length} 条记录</span>
                </div>

                <div className="mt-6 space-y-4">
                  {syncLogs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-t3">
                      还没有同步日志。
                    </div>
                  ) : (
                    syncLogs.map((log) => (
                      <article className="rounded-2xl border border-border bg-bg p-5" key={log.id}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-t1">{log.repoName}</span>
                              <span className="text-xs text-t4">{log.module}</span>
                              <span className="text-xs text-t4">/{log.triggerType}</span>
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

                        {log.errorMessage ? (
                          <p className="mt-3 text-sm leading-6 text-[#C45D4C]">
                            {log.errorCode ? `${log.errorCode}: ` : ""}
                            {log.errorMessage}
                          </p>
                        ) : null}
                      </article>
                    ))
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
