# Reef

基于 `docs/design.md` 与 `docs/development.md` 落地的首版原型。

当前版本采用 `Next.js-only` 方案，不包含 Go 后端。目标是先把信息架构、页面路由、主题系统、分类/标签/搜索和互动原型稳定下来，后续再接入 GitHub Webhook、Supabase、Redis 和正式鉴权。

## 目录

- `frontend/`: Next.js 14 App Router 应用
- `docs/`: 设计与开发文档

## 快速启动

```bash
cp .env.example .env
docker compose up -d db
cd frontend
npm install
npm run dev
```

默认访问 `http://localhost:3000`。

## 导入 Markdown 到本地库

先准备一个带 frontmatter 的 Markdown 目录，然后执行：

```bash
cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef \
  npm run import:markdown -- --module human30 --dir /absolute/path/to/markdowns --purge-missing
```

可用模块：

- `human30`
- `openclaw`
- `bookmarks`

`/admin` 当前使用 `ADMIN_IP_ALLOWLIST` 做临时白名单保护，默认允许 `127.0.0.1` 和 `::1`。

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
- `GITHUB_TOKEN` 对私有仓库必需；公共仓库建议也配置，避免速率限制
- 当前会把 GitHub 文件内容写入本地开发库，作为第一期镜像实现

## GitHub Webhook 自动同步

当前已经提供 `POST /api/webhook/github`，用于在 GitHub push 后自动触发对应模块的增量镜像。

本地开发至少需要这些环境变量：

```env
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_random_secret
```

GitHub 仓库侧配置建议：

- Payload URL: `http://your-host/api/webhook/github`
- Content type: `application/json`
- Secret: 与 `GITHUB_WEBHOOK_SECRET` 保持一致
- Events: 先选 `Just the push event`

当前行为：

- 仅处理 `push` 事件
- 先按 `repo_registry.github_owner/github_repo/meta.branch/watch_paths` 过滤模块
- 命中后自动调用 GitHub Contents API 拉取最新 Markdown 并更新本地库
- 每次同步都会写入 `sync_logs`，记录触发来源、commit sha、文件计数与完成状态
- 未命中模块时返回 `ignored: true`

## 当前已实现

- 首页、模块页、详情页、关于页、后台占位页
- 分类页、标签页、搜索页
- 明暗主题切换
- 本地 Postgres 开发库
- Markdown 目录导入脚本
- GitHub 仓库目录镜像脚本
- GitHub Webhook 自动同步入口
- Next API Routes 版阅读量、点赞、评论、后台待审核接口

## CI

仓库已接入 GitHub Actions CI，位置在 `.github/workflows/ci.yml`。默认会在 `push main` 和 `pull_request` 上执行：

- 安装依赖
- 初始化 PostgreSQL schema
- 导入仓库内 fixture 内容
- 运行 `npm run build`
- 启动生产服务
- 运行 `npm run test:smoke`

如果你要在本地模拟 CI，可按这个顺序执行：

```bash
docker compose up -d db
docker exec reef-db-1 psql -U reef -d postgres -c "CREATE DATABASE reef_ci;"

cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci npm run db:init
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci npm run import:markdown -- --module human30 --dir tests/fixtures/content/human30 --purge-missing
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci npm run import:markdown -- --module openclaw --dir tests/fixtures/content/openclaw --purge-missing
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci npm run import:markdown -- --module bookmarks --dir tests/fixtures/content/bookmarks --purge-missing
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef_ci npm run build
```

## 下一步

- 接入 Supabase 或正式托管 PostgreSQL 取代本地开发库配置
- 接入定时补偿同步与同步日志后台视图
- 接入 GitHub OAuth 与管理员权限控制
