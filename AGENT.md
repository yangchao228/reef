# AGENT.MD — Reef 项目开发规范

> 本文件是 Codex 的工作指南。每次开始任务前必须完整阅读。

---

## 1. 项目概述

**项目名称：** Reef  
**定位：** GitHub-native 个人内容数字系统  
**一句话：** GitHub 是数据源，Reef 是展示与管理界面。

内容提交到 GitHub 仓库后，系统通过 Webhook 自动同步，解析 Markdown 文件，存入数据库，通过自定义域名对外展示。用户访问链路完全不经过 GitHub，国内访问稳定。

**当前实施约束：** 第一期开发表现层与原型交互时，默认采用 `Next.js-only` 方案，不实现 Go 后端。所有服务端能力先以 Next.js API Routes、本地 PostgreSQL 开发库与可替换的数据访问层承接；Go 方案仅作为后续阶段预留，不是当前默认开发目标。

---

## 2. 技术栈

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 14 (App Router) | 框架，SSR + SSG |
| Tailwind CSS | ^3 | 样式 |
| next-themes | latest | 明暗主题切换 |
| next-mdx-remote | ^4 | MDX 渲染 |

### 服务端（第一期）
| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js Route Handlers | 14 (App Router) | 首版 API、原型交互、轻量数据访问层 |
| NextAuth.js | latest | 后续接入 GitHub OAuth 时使用 |
| Octokit | latest | 后续 GitHub API / Webhook 同步 |

### 后续阶段预留
- Go 后端、Gin、sqlc、pgx、go-redis 暂不作为第一期实现要求。
- 若后续同步链路、后台能力和任务调度复杂度提高，再评估是否拆分独立 Go 服务。

### 外部服务
| 服务 | 用途 |
|------|------|
| Supabase (PostgreSQL) | 主数据库 |
| Upstash Redis | 阅读量去重、同步锁 |
| GitHub API | 内容拉取 |
| GitHub OAuth | 后台登录认证 |
| GitHub Webhook | 内容变更通知 |

### 部署
- 应用：Docker 镜像，Next.js standalone 构建
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
│   │   ├── api.ts             # 封装对 Next.js API Routes 的请求
│   │   ├── db.ts              # PostgreSQL 连接
│   │   ├── modules.ts         # 模块静态元数据
│   │   ├── content-repository.ts # 内容与互动数据访问层
│   │   ├── admin-auth.ts      # 临时管理员白名单
│   │   └── types.ts           # 共享类型定义
│   ├── Dockerfile
│   ├── db/init/001_schema.sql # 本地开发库初始化 SQL
│   └── next.config.js
│
├── docker-compose.yml         # 本地开发 + 生产编排
├── nginx.conf                 # Nginx 反向代理配置
└── AGENT.MD                   # 本文件
```

> 注：若仓库内暂时出现 `backend/` 目录，也视为预研或后续阶段占位，不构成第一期默认开发范围。

---

## 4. 数据库 Schema

第一期本地开发库初始化 SQL 放在 `frontend/db/init/001_schema.sql`。设计基线沿用 7 张核心表，另补充 `view_events` 作为阅读量去重辅助表。

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
- 本地开发：`http://localhost:3000`
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
NEXT_PUBLIC_SITE_URL=         # 前端访问域名
NEXT_PUBLIC_URL=              # 系统域名
PORT=3000                     # Next.js 应用端口
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

### 8.3 第一期服务端规范
- 第一期默认不新增 Go 服务，不把当前需求拆到独立后端容器
- 需要服务端逻辑时，优先使用 Next.js Route Handlers / Server Components / `lib/*` 数据访问层
- 页面层不得直接耦合存储实现细节；数据读取优先经 `lib/` 封装，便于后续切换到托管数据库
- 新增接口时先保持响应结构稳定：`{ data, error }`

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
| Phase 0 | Next.js 基线 | `frontend/`、主题系统、路由结构、Docker 与 `.env` 样板完成 |
| Phase 1 | 前台展示与原型交互 | 首页、三模块列表页、文章详情页、搜索、分类/标签、互动原型 |
| Phase 2 | 托管数据库切换 | 接入 Supabase 或正式 PostgreSQL，替换本地开发库配置 |
| Phase 3 | 后台管理 | GitHub OAuth、评论审核、同步状态、基础配置页 |
| Phase 4 | 正式同步链路 | GitHub Webhook、内容解析、增量同步、cron 补偿 |

**Phase 0 验收：** `cd frontend && npm run build` 通过，`docker-compose up` 能启动 Next.js 应用。

**Phase 1 验收：** 访问 `localhost:3000` 能看到首页，三个模块可访问，文章详情、分类、标签、搜索与互动原型可用。

**Phase 2 验收：** 应用不再依赖本地开发库地址，正式环境数据库可稳定读写。

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
cd frontend && npm install
cd frontend && npm run dev

# 构建 Docker 镜像
docker build -t reef-frontend ./frontend

# 生产部署
docker-compose up -d
```

---

*AGENT.MD · Reef v6.0 · 最后更新 2026-03-19*
