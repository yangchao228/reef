# AGENT.MD — Reef 项目开发规范

> 本文件是 Codex 的工作指南。每次开始任务前必须完整阅读。

---

## 1. 项目概述

**项目名称：** Reef  
**定位：** GitHub-native 个人内容数字系统  
**一句话：** GitHub 是数据源，Reef 是展示与管理界面。

内容提交到 GitHub 仓库后，系统通过 Webhook 自动同步，解析 Markdown 文件，存入数据库，通过自定义域名对外展示。用户访问链路完全不经过 GitHub，国内访问稳定。

---

## 2. 技术栈

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14 (App Router) | 框架，SSR + SSG |
| Tailwind CSS | ^3 | 样式 |
| next-themes | latest | 明暗主题切换 |
| next-mdx-remote | ^4 | MDX 渲染 |

### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Go | ^1.22 | API 服务、Webhook 处理、内容同步 |
| Gin | latest | HTTP 框架 |
| sqlc | latest | SQL 代码生成 |
| pgx | ^5 | PostgreSQL 驱动 |
| go-redis | ^9 | Redis 客户端 |
| octokit（go-github） | latest | GitHub API |

### 外部服务
| 服务 | 用途 |
|------|------|
| Supabase (PostgreSQL) | 主数据库 |
| Upstash Redis | 阅读量去重、同步锁 |
| GitHub API | 内容拉取 |
| GitHub OAuth | 后台登录认证 |
| GitHub Webhook | 内容变更通知 |

### 部署
- 前端：Docker 镜像，Next.js standalone 构建
- 后端：Docker 镜像，Go 静态二进制
- 编排：`docker-compose.yml`
- 反向代理：Nginx（宿主机），SSL 由 Let's Encrypt 提供

---

## 3. 项目结构

```
reef/
├── frontend/                  # Next.js 前端
│   ├── app/
│   │   ├── (public)/          # 公开页面
│   │   │   ├── page.tsx       # 首页
│   │   │   ├── [module]/      # 模块列表页（/human30, /openclaw, /bookmarks）
│   │   │   │   └── [slug]/    # 文章详情页
│   │   │   ├── categories/    # 分类页
│   │   │   ├── tags/          # 标签页
│   │   │   ├── search/        # 搜索页
│   │   │   └── about/         # 关于我页
│   │   ├── admin/             # 后台管理（需登录）
│   │   │   ├── repos/         # 仓库管理
│   │   │   ├── sync/          # 同步日志
│   │   │   ├── categories/    # 分类管理
│   │   │   └── comments/      # 评论审核
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/            # Navbar, Footer
│   │   ├── home/              # Hero, ModuleCards, Timeline
│   │   ├── content/           # ArticleCard, MDXRenderer
│   │   └── ui/                # Button, Badge, ThemeToggle 等基础组件
│   ├── lib/
│   │   ├── api.ts             # 封装对 Go 后端的请求
│   │   └── types.ts           # 共享类型定义
│   ├── Dockerfile
│   └── next.config.js
│
├── backend/                   # Go 后端
│   ├── cmd/
│   │   └── server/
│   │       └── main.go        # 入口
│   ├── internal/
│   │   ├── handler/           # HTTP 处理器（按资源分文件）
│   │   │   ├── webhook.go
│   │   │   ├── content.go
│   │   │   ├── repos.go
│   │   │   ├── comments.go
│   │   │   └── categories.go
│   │   ├── service/           # 业务逻辑
│   │   │   ├── sync.go        # 内容同步引擎
│   │   │   ├── parser.go      # Markdown / frontmatter 解析
│   │   │   └── github.go      # GitHub API 封装
│   │   ├── db/                # sqlc 生成代码 + 手写查询
│   │   │   ├── query/         # .sql 文件
│   │   │   └── sqlc/          # 生成的 Go 代码
│   │   ├── cache/             # Redis 操作封装
│   │   └── middleware/        # Auth、CORS、日志
│   ├── migrations/            # 数据库迁移 SQL
│   ├── Dockerfile
│   └── go.mod
│
├── docker-compose.yml         # 本地开发 + 生产编排
├── nginx.conf                 # Nginx 反向代理配置
└── AGENT.MD                   # 本文件
```

---

## 4. 数据库 Schema

共 7 张表，迁移文件放在 `backend/migrations/`。

```sql
-- repo_registry：GitHub 仓库注册
CREATE TABLE repo_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         VARCHAR(100) UNIQUE NOT NULL,
  name         VARCHAR(200) NOT NULL,
  github_owner VARCHAR(100) NOT NULL,
  github_repo  VARCHAR(100) NOT NULL,
  watch_paths  TEXT[] NOT NULL DEFAULT '{}',
  display_type VARCHAR(50) NOT NULL,  -- blog | timeline | bookmarks
  is_public    BOOLEAN DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  meta         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- categories：共用分类（blog + 收藏夹跨模块共享）
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(100) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- content_items：已同步的内容条目
CREATE TABLE content_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         UUID REFERENCES repo_registry(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  file_path       TEXT NOT NULL,
  github_sha      VARCHAR(40) NOT NULL,
  slug            VARCHAR(500) NOT NULL,
  title           TEXT,
  summary         TEXT,
  content_raw     TEXT NOT NULL,
  frontmatter     JSONB DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  view_count      INTEGER DEFAULT 0,
  published_at    TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  status          VARCHAR(20) DEFAULT 'published',
  UNIQUE(repo_id, file_path)
);

-- sync_logs：同步任务日志
CREATE TABLE sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         UUID REFERENCES repo_registry(id),
  trigger_type    VARCHAR(20) NOT NULL,  -- webhook | cron | manual
  commit_sha      VARCHAR(40),
  files_added     INTEGER DEFAULT 0,
  files_modified  INTEGER DEFAULT 0,
  files_removed   INTEGER DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'pending',
  error_detail    TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

-- likes：点赞记录
CREATE TABLE likes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  fingerprint     VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_item_id, fingerprint)
);

-- comment_authors：游客评论作者
CREATE TABLE comment_authors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    VARCHAR(100) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- comments：评论内容
CREATE TABLE comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES comment_authors(id),
  body            TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. API 接口规范

### Base URL
- 本地开发：`http://localhost:8080`
- 生产：通过 Nginx 代理到 `/api/*`

### 接口列表

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | `/api/webhook/github` | 接收 GitHub Webhook | 签名验证 |
| POST | `/api/sync/manual` | 手动触发全量同步 | Admin |
| GET  | `/api/repos` | 获取所有 repo 配置 | Admin |
| POST | `/api/repos` | 新增 repo 配置 | Admin |
| PUT  | `/api/repos/:id` | 更新 repo 配置 | Admin |
| DELETE | `/api/repos/:id` | 删除 repo 配置 | Admin |
| GET  | `/api/content` | 内容列表（分页/筛选） | Admin |
| GET  | `/api/sync/logs` | 同步日志列表 | Admin |
| POST | `/api/content/:slug/view` | 记录阅读量（含去重） | Public |
| POST | `/api/content/:slug/like` | 点赞 / 取消点赞 | Public |
| GET  | `/api/content/:slug/comments` | 获取已通过评论 | Public |
| POST | `/api/content/:slug/comments` | 提交游客评论 | Public |
| GET  | `/api/admin/comments` | 待审核评论列表 | Admin |
| PUT  | `/api/admin/comments/:id` | 审核评论 | Admin |
| GET  | `/api/categories` | 获取所有分类 | Public |

### 响应格式
```json
// 成功
{ "data": {}, "error": null }

// 失败
{ "data": null, "error": { "code": "SYNC_IN_PROGRESS", "message": "..." } }
```

### 错误码
| code | 含义 |
|------|------|
| `WEBHOOK_SIGNATURE_INVALID` | Webhook 签名验证失败 |
| `SYNC_IN_PROGRESS` | 同一 repo 正在同步中 |
| `GITHUB_API_RATE_LIMIT` | GitHub API 速率限制 |
| `CONTENT_NOT_FOUND` | 内容不存在 |
| `UNAUTHORIZED` | 未登录或无权限 |

---

## 6. Frontmatter 约定

所有 Markdown 文件必须遵循以下格式：

```yaml
# 通用模块（专栏 / 养虾日记）
---
title: "文章标题"
date: 2026-03-10
category: "methodology"   # 对应 categories.slug，不存在时自动创建
tags: [tag1, tag2]
status: published         # published | draft
summary: "可选摘要"
---

# 收藏夹模块（由上游抓取系统填写）
---
title: "文章标题"
date: 2026-03-10
category: "ai-tools"
source_url: "https://..."
source_platform: wechat   # wechat | xiaohongshu | youtube | x | rss
tags: [tag1, tag2]
status: published
---
```

---

## 7. 环境变量

所有服务通过 `.env` 文件注入，`.env` 不提交到 Git。

```bash
# ── 数据库 ──────────────────────────────
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# ── Redis ───────────────────────────────
KV_REST_API_URL=
KV_REST_API_TOKEN=

# ── GitHub ──────────────────────────────
GITHUB_TOKEN=                 # repo 只读权限
GITHUB_WEBHOOK_SECRET=        # 自行生成随机字符串
GITHUB_CLIENT_ID=             # OAuth App
GITHUB_CLIENT_SECRET=

# ── 认证 ────────────────────────────────
NEXTAUTH_SECRET=
NEXTAUTH_URL=                 # https://your-domain.com
ADMIN_GITHUB_ID=              # 你的 GitHub 数字 ID

# ── 系统 ────────────────────────────────
NEXT_PUBLIC_API_URL=          # Go 后端地址，前端请求用
NEXT_PUBLIC_URL=              # 系统域名
PORT=8080                     # Go 后端端口
```

---

## 8. 开发规范

### 8.1 分支策略
- `main`：生产分支，只接受 PR 合并
- `dev`：开发主分支
- `feature/xxx`：功能分支，从 `dev` 创建，完成后合并回 `dev`

### 8.2 提交信息格式
```
type(scope): 简短描述

type: feat | fix | docs | refactor | test | chore
scope: frontend | backend | db | deploy | docs

示例：
feat(backend): 实现 Webhook 签名验证
fix(frontend): 修复暗色模式下 Logo 颜色未切换
```

### 8.3 Go 代码规范
- 使用 `gofmt` 格式化，提交前必须通过 `golangci-lint`
- 错误处理：不使用裸 `panic`，所有错误向上返回或记录日志
- 日志：使用 `slog`（标准库），结构化日志
- 配置：通过 `os.Getenv` 读取，启动时校验必填项
- HTTP handler 只做参数解析和响应，业务逻辑放 service 层

### 8.4 TypeScript / Next.js 规范
- 严格模式：`"strict": true`
- 组件文件名：PascalCase（`ModuleCard.tsx`）
- 工具函数文件名：camelCase（`formatDate.ts`）
- 所有 API 请求通过 `lib/api.ts` 统一封装，不在组件内直接 `fetch`
- 服务端数据获取优先用 RSC（React Server Components），减少客户端 JS

### 8.5 CSS / 样式规范
- 优先使用 Tailwind utility class
- 主题色全部通过 CSS 变量引用（见第 11.7 节），不硬编码颜色值
- 组件内 className 按 Tailwind 官方推荐顺序排列：布局 → 尺寸 → 颜色 → 交互

---

## 9. 实施阶段

| 阶段 | 目标 | 交付物 |
|------|------|--------|
| Phase 0 | 环境搭建 | 数据库 schema、docker-compose、.env 配置完成 |
| Phase 1 | Go 后端单向同步 | Webhook 接收、内容解析、DB 写入、cron 降级 |
| Phase 2 | Next.js 前台展示 | 首页、三模块列表页、文章详情页、搜索 |
| Phase 3 | 后台管理 | Repo 管理、同步日志、分类管理、评论审核 |
| Phase 4 | 互动功能 | 游客评论（含审核）、点赞、阅读量统计 |

**Phase 0 验收：** `docker-compose up` 能启动前后端，Go 服务能连通 Supabase 和 Redis。

**Phase 1 验收：** push 一个 `.md` 文件到 GitHub，30 秒内数据库出现对应记录。

**Phase 2 验收：** 访问 `localhost:3000` 能看到首页，三个模块可以访问，文章详情可以渲染。

---

## 10. 禁止事项

- **不得**在前端组件内直接查询数据库
- **不得**将 `SUPABASE_SERVICE_ROLE_KEY` 暴露到前端代码
- **不得**跳过 Webhook 签名验证
- **不得**在没有 sha 对比的情况下全量覆盖内容
- **不得**修改 `migrations/` 目录下已执行的迁移文件（只能新增）
- **不得**在 `main` 分支直接 commit

---

## 11. 快速参考

```bash
# 启动开发环境
docker-compose up -d db redis
cd backend && go run ./cmd/server
cd frontend && npm run dev

# 执行数据库迁移
cd backend && goose -dir migrations postgres $DATABASE_URL up

# 生成 sqlc 代码
cd backend && sqlc generate

# 构建 Docker 镜像
docker build -t reef-backend ./backend
docker build -t reef-frontend ./frontend

# 生产部署
docker-compose -f docker-compose.prod.yml up -d
```

---

*AGENT.MD · Reef v6.0 · 最后更新 2026-03-17*
