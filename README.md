# Reef

基于 `docs/design.md` 与 `docs/development.md` 持续演进的主干实现。

当前版本仍采用 `Next.js-only` 方案，不包含 Go 后端；主线已经从“内容站原型”转到“多租户资产平台底座收口”，重点在 `workspace`、GitHub OAuth / GitHub App、后台运维和同步可靠性，而不是继续扩页面。

## 目录

- `frontend/`: Next.js 14 App Router 应用
- `docs/`: 设计与开发文档

## 快速启动

```bash
cp .env.example .env
docker compose up -d db
cd frontend
npm install
npm run db:init
npm run workspace:ensure -- --workspace your-workspace-slug --name "Your Workspace" --login your-github-login
npm run dev
```

默认访问 `http://localhost:3000`。

当前默认按多租户 schema 运行，至少需要一个目标 workspace。开发环境可显式配置：

```env
REEF_WORKSPACE_SLUG=your-workspace-slug
REEF_ADMIN_GITHUB_LOGIN=your-github-login
```

环境变量可按下面理解：

- 本地开发必需：`DATABASE_URL`、`REEF_WORKSPACE_SLUG`、`REEF_ADMIN_GITHUB_LOGIN`、`NEXT_PUBLIC_SITE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET`
- 推荐配置：`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`GITHUB_OAUTH_STATE_SECRET`、`GITHUB_APP_NAME`、`GITHUB_APP_STATE_SECRET`
- 生产 GitHub App 主链必需：`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY` 或 `GITHUB_APP_PRIVATE_KEY_BASE64`、`GITHUB_WEBHOOK_SECRET`
- 仅开发态 fallback：`GITHUB_TOKEN`、`GITHUB_APP_INSTALLATION_TOKENS_JSON`
- 仅测试使用：`SMOKE_BASE_URL`

当前主干不再内置任何“默认 workspace”回退。脚本侧需要显式提供 `REEF_WORKSPACE_SLUG` 或 `--workspace`，请求侧则必须通过 `x-reef-workspace` / `reef_workspace` cookie 指定当前 workspace，运行时不再从进程环境兜底。

当前前台已提供 `/workspaces` 选择页：

- 根首页在未选择 workspace 时会直接展示 workspace directory
- `/search`、`/[module]`、`/[module]/[slug]`、`/categories`、`/tags/[tag]` 等依赖内容上下文的页面，在缺少 workspace 时会跳转到 `/workspaces?next=...`
- 选择动作会写入 `reef_workspace` cookie，再跳回目标页面
- `/workspaces` 也承担当前登录身份建立与 workspace 创建入口；当前仍是开发期 GitHub login bridge，后续再替换成正式 OAuth
- 若已配置 `GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET`，`/workspaces` 也会提供 GitHub OAuth 登录入口；GitHub App 安装回调校验依赖这条真实 GitHub 身份链路

当前后台运维面板已可直接承担这些动作：

- 审核评论并立即影响前台展示
- 查看最近同步日志
- 维护 workspace 的 GitHub App installation
- 绑定模块与 installation
- 触发模块手动同步 / 失败后重试
- 查看模块级同步风险提示与最近一次同步状态

当前还提供了一个面向补偿同步的脚本入口，适合由系统定时器或手工运维调用：

```bash
cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef \
REEF_WORKSPACE_SLUG=your-workspace-slug \
  npm run sync:compensate -- --only-failed
```

说明：

- 默认会扫描当前 workspace 下 `meta.source = github` 的模块
- 默认跳过本地导入/fixture 模块和缺少 watch paths 的模块
- `--only-failed` 只重试最近一次同步失败的模块
- 也支持 `--module your-module` 定向补偿单个模块
- 默认会对同一 workspace 的补偿运行加并发锁，避免两轮补偿同时执行
- 默认带 10 分钟去重窗口；短时间内重复触发同范围补偿时，脚本会直接跳过而不是重复执行
- 如需调整去重窗口，可追加 `--dedupe-window-minutes <n>`
- 每次执行仍会写入 `sync_logs`，并使用 `trigger_type = cron`

当前推荐的生产调度约束：

- 优先使用部署环境原生 scheduler
- 宿主机 cron 作为备用方案
- 不使用 GitHub Actions 承担生产补偿主链
- 建议每个 `workspace` 每 15 分钟执行一次 `--only-failed`
- 建议一条 scheduler / cron 任务只对应一个 `workspace`

当前仓库也提供了一个 Docker / 宿主机两用的调度入口：

```bash
REEF_WORKSPACE_SLUG=your-workspace-slug ./deploy/reef-compensate.sh
```

这个脚本会直接执行：

```bash
docker compose run --rm compensator
```

也就是说，宿主机 scheduler 不需要自己拼长命令，只需要传入目标 `REEF_WORKSPACE_SLUG` 即可。

宿主机 cron 备用示例：

```cron
*/15 * * * * cd /srv/reef && REEF_WORKSPACE_SLUG=your-workspace-slug ./deploy/reef-compensate.sh >> /var/log/reef-compensate.log 2>&1
```

更完整的排障顺序见 [docs/ops-runbook.md](/Users/yangchao/github/reef/docs/ops-runbook.md)。

## 导入 Markdown 到本地库

先准备一个带 frontmatter 的 Markdown 目录，然后执行：

```bash
cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef \
REEF_WORKSPACE_SLUG=your-workspace-slug \
  npm run import:markdown -- --module human30 --dir /absolute/path/to/markdowns --purge-missing
```

当前导入脚本内置的默认模块 preset：

- `human30`
- `openclaw`
- `bookmarks`

如果要导入新的自定义模块，也可以显式提供名称和展示类型：

```bash
cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef \
REEF_WORKSPACE_SLUG=your-workspace-slug \
  npm run import:markdown -- \
  --module research-notes \
  --name "Research Notes" \
  --display-type blog \
  --dir /absolute/path/to/markdowns
```

运行时前台模块并不限制为这三个，页面导航、首页模块卡片和模块路由都会按当前 workspace 的 `repo_registry` 动态生成。

`/admin` 当前按 workspace 成员鉴权。默认读取 `/workspaces` 建立的当前登录身份，调试时也允许显式传 `x-reef-user-login`；该 GitHub login 在当前 workspace 内必须具备 `owner` 或 `admin` 角色。

## 直接镜像 GitHub 仓库内容

如果不想先 clone 到本地，可以直接从 GitHub repo 指定子目录同步：

```bash
cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef \
GITHUB_TOKEN=your_github_token \
  npm run sync:github -- \
  --module human30 \
  --owner your-name \
  --repo your-repo \
  --path content/posts \
  --branch main \
  --purge-missing
```

说明：

- `--path` 支持单个目录；需要多个目录时可传逗号分隔
- 手动脚本在开发态仍可使用 `GITHUB_TOKEN` 作为 fallback
- 运行时自动同步主链已不再以全局 `GITHUB_TOKEN` 为前提，优先按 workspace 绑定的 GitHub App installation 解析授权
- 本地桥接方式仍支持通过 `GITHUB_APP_INSTALLATION_TOKENS_JSON` 直接提供 installation token 映射，例如 `{"123456":"ghs_xxx"}`
- 生产环境可改用 `GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY` 动态向 GitHub 换 installation token，服务端会做进程内缓存
- 如果要从后台直接发起安装流程，还需要配置 `GITHUB_APP_NAME`，并把 GitHub App 的 setup URL 指向 `/github-app/setup`
- 如果要让安装回调校验“当前 GitHub 用户确实能访问该 installation”，还需要配置 `GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET`，并把 OAuth callback 指向 `/auth/github/callback`
- 当前会把 GitHub 文件内容写入本地开发库，作为第一期镜像实现

## GitHub Webhook 自动同步

当前已经提供 `POST /api/webhook/github`，用于在 GitHub push 后自动触发对应模块的增量镜像。

如果要跑 GitHub Webhook 自动同步，建议补齐这些变量：

```env
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef
GITHUB_APP_NAME=your-app-name
GITHUB_WEBHOOK_SECRET=your_random_secret
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_STATE_SECRET=replace-with-a-long-random-string
GITHUB_CLIENT_ID=Iv1.xxxxxx
GITHUB_CLIENT_SECRET=ghs_xxxxxx
GITHUB_OAUTH_STATE_SECRET=replace-with-a-long-random-string
```

GitHub 仓库侧配置建议：

- Payload URL: `http://your-host/api/webhook/github`
- Setup URL: `http://your-host/github-app/setup`
- User authorization callback URL: `http://your-host/auth/github/callback`
- Content type: `application/json`
- Secret: 与 `GITHUB_WEBHOOK_SECRET` 保持一致
- Events: 先选 `Just the push event`

当前行为：

- 仅处理 `push` 事件
- 先按 `repo_registry.github_owner/github_repo/meta.branch/watch_paths` 过滤模块
- 命中后按 `repo_registry.github_app_installation_id -> github_app_installations` 解析当前 workspace 的 GitHub 授权；若未提供本地 token 映射，则服务端会用 `GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY` 动态换 installation token，再调用 GitHub Contents API 拉取最新 Markdown 并更新本地库
- 每次同步都会写入 `sync_logs`，记录触发来源、commit sha、文件计数与完成状态
- 未命中模块时返回 `ignored: true`

说明：

- `GITHUB_TOKEN` 现在只作为开发态手动同步 fallback，不再是自动同步主链前提
- `GITHUB_APP_INSTALLATION_TOKENS_JSON` 也属于本地桥接方式，适合开发调试，不是长期生产方案
- 生产环境建议优先走 `GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY` 动态换 installation token

## 当前已实现

- 首页、模块页、详情页、关于页、后台占位页
- 分类页、标签页、搜索页
- 明暗主题切换
- 本地 Postgres 开发库
- workspace 目录、workspace 创建与当前身份建立
- Markdown 目录导入脚本
- GitHub 仓库目录镜像脚本
- GitHub Webhook 自动同步入口
- Next API Routes 版阅读量、点赞、评论、后台待审核接口
- 后台评论审核闭环
- 后台 installation / 模块绑定 / 手动同步 / 风险提示

## CI

仓库已接入 GitHub Actions CI，位置在 `.github/workflows/ci.yml`。默认会在 `push main` 和 `pull_request` 上执行：

- 安装依赖
- 初始化 PostgreSQL schema
- 运行库级同步测试
- 导入仓库内 fixture 内容
- 运行 `npm run build`
- 启动生产服务
- 运行 `npm run test:smoke`

如果你要在本地模拟 CI，可按这个顺序执行：

```bash
docker compose up -d db
docker exec reef-db-1 psql -U reef -d postgres -c "CREATE DATABASE reef_ci;"

cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space npm run db:init
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space REEF_ADMIN_GITHUB_LOGIN=reef-ci-admin npm run workspace:ensure -- --workspace reef-ci-space --name "Reef CI Workspace" --login reef-ci-admin
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space npm run db:verify:v2
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci npm run test:unit
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space npm run import:markdown -- --module human30 --dir tests/fixtures/content/human30 --purge-missing
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space npm run import:markdown -- --module openclaw --dir tests/fixtures/content/openclaw --purge-missing
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space npm run import:markdown -- --module bookmarks --dir tests/fixtures/content/bookmarks --purge-missing
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space npm run build
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci REEF_WORKSPACE_SLUG=reef-ci-space REEF_ADMIN_GITHUB_LOGIN=reef-ci-admin npm run start -- --hostname 127.0.0.1 --port 3000
SMOKE_BASE_URL=http://127.0.0.1:3000 REEF_WORKSPACE_SLUG=reef-ci-space REEF_ADMIN_GITHUB_LOGIN=reef-ci-admin npm run test:smoke
```

## 下一步

- 把补偿调度正式接到目标部署环境的 scheduler
- 继续压缩 legacy header/cookie 过渡鉴权残留
- 继续扩大 CI / smoke 对 installation / webhook / 授权异常的覆盖
- 主流程稳定后，再推进 Agent Module
