import Link from "next/link";

import { listSelectableWorkspaces } from "@/lib/workspace-repository";
import { getUserSummary } from "@/lib/user-repository";
import { getRequestUserLogin } from "@/lib/user-session";
import { hasGitHubOAuthConfig } from "@/lib/github-oauth";
import {
  buildWorkspaceActivationHref,
  buildWorkspaceDirectoryHref,
} from "@/lib/workspace";

function getAuthNoticeMessage(authState?: string | null) {
  if (authState === "invalid_login") {
    return "GitHub login 格式不合法。请输入标准 GitHub username。";
  }

  if (authState === "signed_out") {
    return "当前登录身份已退出。";
  }

  if (authState === "github_oauth_failed") {
    return "GitHub OAuth 登录失败，请重试。";
  }

  if (authState === "github_oauth_state_invalid") {
    return "GitHub OAuth 登录状态已失效，请重新发起登录。";
  }

  if (authState === "github_oauth_config_missing") {
    return "服务端还没有配置 GitHub OAuth，暂时只能使用手动 login bridge。";
  }

  return null;
}

function getCreateNoticeMessage(createState?: string | null) {
  if (createState === "login_required") {
    return "创建 workspace 前，请先建立当前 GitHub 身份。";
  }

  if (createState === "invalid_slug") {
    return "workspace slug 只支持小写字母、数字和中划线，且不能以中划线开头或结尾。";
  }

  if (createState === "missing_name") {
    return "workspace 名称不能为空。";
  }

  if (createState === "slug_taken") {
    return "这个 workspace slug 已被占用，请换一个。";
  }

  return null;
}

export async function WorkspaceDirectory({
  currentWorkspaceSlug,
  nextPath,
  authState,
  createState,
}: {
  currentWorkspaceSlug?: string | null;
  nextPath?: string | null;
  authState?: string | null;
  createState?: string | null;
}) {
  const currentUserLogin = getRequestUserLogin();
  const [currentUser, workspaces] = await Promise.all([
    getUserSummary(currentUserLogin),
    listSelectableWorkspaces(currentUserLogin),
  ]);
  const memberWorkspaces = workspaces.filter((workspace) => workspace.membershipRole);
  const directoryWorkspaces = workspaces.filter((workspace) => !workspace.membershipRole);
  const returnTo = buildWorkspaceDirectoryHref(nextPath);
  const authNotice = getAuthNoticeMessage(authState);
  const createNotice = getCreateNoticeMessage(createState);
  const hasGitHubOAuth = hasGitHubOAuthConfig();

  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-border bg-bg-card p-6 sm:p-8">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Workspace Directory</p>
            <h1 className="mt-2 text-4xl text-t1">选择一个 workspace 进入内容上下文</h1>
            <p className="mt-4 text-sm leading-7 text-t2">
              Reef 主干已经不再内置默认 workspace。现在这里同时承担三件事：建立当前 GitHub
              身份、创建 workspace、选择进入目标空间。当前登录仍是开发期桥接，后续再替换成
              正式 OAuth。
            </p>
          </div>
        </div>

        {authNotice || createNotice ? (
          <div className="mt-6 rounded-2xl border border-border bg-bg-card p-4 text-sm text-t2">
            {authNotice ?? createNotice}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[28px] border border-border bg-bg-card p-6 sm:p-8">
            {currentUser ? (
              <>
                <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Current Identity</p>
                <h2 className="mt-2 text-2xl text-t1">@{currentUser.githubLogin}</h2>
                <p className="mt-4 text-sm leading-7 text-t2">
                  当前身份会同时用于 workspace 创建和后台成员鉴权。后续接 GitHub OAuth
                  时，这里会替换成真实账号登录。
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs text-t3">
                  {currentUser.name ? (
                    <span className="rounded-full border border-border px-3 py-2">
                      {currentUser.name}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-border px-3 py-2">
                    {currentUser.workspaceCount} 个已加入空间
                  </span>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <Link
                    className="rounded-xl border border-border px-4 py-3 text-sm text-t2 transition hover:border-pri hover:text-t1"
                    href={`/auth/logout?returnTo=${encodeURIComponent(returnTo)}`}
                  >
                    退出当前身份
                  </Link>
                  <span className="text-sm text-t3">退出后不会清除已选中的 workspace。</span>
                </div>

                <div className="mt-8 rounded-[24px] border border-border bg-bg p-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-t4">Create Workspace</p>
                  <h3 className="mt-2 text-xl text-t1">创建新的 workspace</h3>
                  <p className="mt-3 text-sm leading-7 text-t2">
                    创建成功后，系统会自动把你写成 owner，并切换到新空间。
                  </p>

                  <form action="/workspaces/create" className="mt-5 grid gap-3" method="post">
                    <input name="next" type="hidden" value={nextPath ?? ""} />
                    <input
                      className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
                      name="workspaceName"
                      placeholder="空间名称，例如 Reef Lab"
                      required
                    />
                    <input
                      className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
                      name="workspaceSlug"
                      pattern="[a-z0-9-]+"
                      placeholder="空间 slug，例如 reef-lab"
                      required
                    />
                    <textarea
                      className="min-h-24 rounded-2xl border border-border bg-bg-card px-4 py-3 text-sm leading-7 text-t1 outline-none placeholder:text-t4 focus:border-pri"
                      name="description"
                      placeholder="一句话说明这个空间负责什么内容或协作边界。"
                    />
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <select
                        className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-sm text-t1 outline-none focus:border-pri"
                        defaultValue="private"
                        name="visibility"
                      >
                        <option value="private">Private workspace</option>
                        <option value="public">Public workspace</option>
                      </select>
                      <button
                        className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                        type="submit"
                      >
                        创建并进入
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Sign In</p>
                <h2 className="mt-2 text-2xl text-t1">先建立当前 GitHub 身份</h2>
                <p className="mt-4 text-sm leading-7 text-t2">
                  当前版本先用 GitHub login 建立会话 cookie。登录后可以直接创建 workspace，
                  同一身份也会自动用于后台成员鉴权。
                </p>

                {hasGitHubOAuth ? (
                  <div className="mt-6">
                    <Link
                      className="inline-flex rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                      href={`/auth/github/start?returnTo=${encodeURIComponent(returnTo)}`}
                    >
                      使用 GitHub OAuth 登录
                    </Link>
                    <p className="mt-3 text-sm leading-7 text-t3">
                      这会拿到真实 GitHub 用户身份，也用于 GitHub App 安装回调校验。
                    </p>
                  </div>
                ) : null}

                <form action="/auth/login" className="mt-6 grid gap-3" method="post">
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <input
                    className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
                    name="githubLogin"
                    placeholder="GitHub login，例如 octocat"
                    required
                  />
                  <input
                    className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-t1 outline-none placeholder:text-t4 focus:border-pri"
                    name="name"
                    placeholder="显示名称（可选）"
                  />
                  <button
                    className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                    type="submit"
                  >
                    进入 workspace 流程
                  </button>
                </form>

                <div className="mt-8 rounded-[24px] border border-dashed border-border p-5 text-sm leading-7 text-t3">
                  如果你只是浏览已有内容，也可以直接从右侧目录进入现有 workspace。登录主要用于
                  创建空间、沉淀成员关系和进入后台。若需要走 GitHub App 安装回调，请优先使用
                  GitHub OAuth 登录。
                </div>
              </>
            )}
          </div>

          <div className="space-y-6">
            {memberWorkspaces.length > 0 ? (
              <div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Your Workspaces</p>
                    <h2 className="mt-2 text-2xl text-t1">你已加入的空间</h2>
                  </div>
                  <span className="text-sm text-t3">{memberWorkspaces.length} 个可直接管理或协作</span>
                </div>
                <div className="mt-4 grid gap-4">
                  {memberWorkspaces.map((workspace) => {
                    const isCurrent = workspace.slug === currentWorkspaceSlug;
                    const activationHref = buildWorkspaceActivationHref(
                      workspace.slug,
                      nextPath,
                    );

                    return (
                      <article
                        className="rounded-[28px] border border-border bg-bg-card p-6 transition hover:border-pri/60"
                        key={workspace.slug}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--tag-c)]">
                            {workspace.visibility}
                          </span>
                          <span className="rounded-full border border-pri/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-pri-d">
                            {workspace.membershipRole}
                          </span>
                          {isCurrent ? (
                            <span className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-t2">
                              Current
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-4 text-2xl text-t1">{workspace.name}</h3>
                        <p className="mt-2 text-sm text-t3">{workspace.slug}</p>
                        <p className="mt-4 min-h-14 text-sm leading-7 text-t2">
                          {workspace.description ?? "这个 workspace 还没有填写描述。"}
                        </p>

                        <div className="mt-6 flex flex-wrap gap-2 text-xs text-t3">
                          <span className="rounded-full border border-border px-3 py-2">
                            {workspace.moduleCount} 个模块
                          </span>
                          <span className="rounded-full border border-border px-3 py-2">
                            {workspace.contentCount} 条内容
                          </span>
                        </div>

                        <div className="mt-6 flex items-center justify-between gap-4">
                          <Link
                            className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                            href={activationHref}
                          >
                            {isCurrent ? "继续浏览" : "切换到这个空间"}
                          </Link>
                          <span className="text-sm text-t3">选择后会写入 workspace cookie。</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-t4">Directory</p>
                  <h2 className="mt-2 text-2xl text-t1">
                    {memberWorkspaces.length > 0 ? "其他可选空间" : "可进入的空间"}
                  </h2>
                </div>
                <span className="text-sm text-t3">{directoryWorkspaces.length} 个空间</span>
              </div>

              {directoryWorkspaces.length === 0 ? (
                <div className="mt-4 rounded-[28px] border border-dashed border-border bg-bg-card p-6 text-sm leading-7 text-t3">
                  {currentUser
                    ? "你还没有加入其他 workspace。可以先在左侧创建第一个空间。"
                    : "当前目录里还没有额外的可选 workspace。登录后可以直接创建第一个空间。"}
                </div>
              ) : (
                <div className="mt-4 grid gap-4">
                  {directoryWorkspaces.map((workspace) => {
                    const isCurrent = workspace.slug === currentWorkspaceSlug;
                    const activationHref = buildWorkspaceActivationHref(
                      workspace.slug,
                      nextPath,
                    );

                    return (
                      <article
                        className="rounded-[28px] border border-border bg-bg-card p-6 transition hover:border-pri/60"
                        key={workspace.slug}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--tag-bg)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--tag-c)]">
                            {workspace.visibility}
                          </span>
                          {isCurrent ? (
                            <span className="rounded-full border border-pri/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-pri-d">
                              Current
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-4 text-2xl text-t1">{workspace.name}</h3>
                        <p className="mt-2 text-sm text-t3">{workspace.slug}</p>
                        <p className="mt-4 min-h-14 text-sm leading-7 text-t2">
                          {workspace.description ?? "这个 workspace 还没有填写描述。"}
                        </p>

                        <div className="mt-6 flex flex-wrap gap-2 text-xs text-t3">
                          <span className="rounded-full border border-border px-3 py-2">
                            {workspace.moduleCount} 个模块
                          </span>
                          <span className="rounded-full border border-border px-3 py-2">
                            {workspace.contentCount} 条内容
                          </span>
                          <span className="rounded-full border border-border px-3 py-2">
                            更新于{" "}
                            {new Intl.DateTimeFormat("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                            }).format(new Date(workspace.updatedAt))}
                          </span>
                        </div>

                        <div className="mt-6 flex items-center justify-between gap-4">
                          <Link
                            className="rounded-xl bg-pri-d px-5 py-3 text-sm text-white transition hover:opacity-90 dark:text-[#0D0D0D]"
                            href={activationHref}
                          >
                            {isCurrent ? "继续浏览" : "进入这个空间"}
                          </Link>
                          <span className="text-sm text-t3">
                            选择后会把 workspace 写入 cookie，并跳回目标页面。
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
