# Reef · 系统设计方案 v6.0

**文档状态：** 终稿  
**版本日期：** 2026-03-17  
**前序版本：** v1.0 → v2.0 → v3.0 → v4.0 → v5.0 → v6.0  
**主题：** GitHub as CMS · 个人内容数字系统 · Docker 单镜像部署 · VPS 自托管

---

## 版本迭代说明

| 版本 | 主要变化 |
|------|---------|
| v1.0 | 初始完整方案，含在线编辑、图片转储、Webhook 队列、R2 对象存储 |
| v2.0 | 评审精简：去掉在线编辑、图片转储、Webhook 队列、R2；新增收藏夹模块 |
| v3.0 | 功能补全：新增分类体系、标签、搜索、游客评论（含审核）、点赞、阅读量统计 |
| v4.0 | 部署方案确定：Docker 单镜像 + VPS 自托管，Vercel KV → Upstash Redis，Cron → node-cron |
| v5.0 | 品牌设计：项目命名为 Reef，确定 Logo、双模式色彩系统（明亮绿色 / 暗色黑金） |
| **v6.0** | 首页设计：确定编辑极简方案，完整页面结构、组件规范、主题切换交互 |

---

## 一、系统定位与设计原则

### 1.1 核心定位

Personal Digital OS 是一套以 GitHub 为唯一数据源、以个人域名为访问入口的内容发布与管理系统。系统不托管内容，只镜像、解析、展示来自 GitHub 仓库的 Markdown 文件。

> **一句话定义：GitHub 是你的硬盘，这套系统是你的操作系统界面。**

### 1.2 设计原则

| 编号 | 原则 | 含义 |
|------|------|------|
| P1 | 数据主权 | GitHub repo 是唯一真相来源，数据库只存缓存、索引和互动数据，原始内容永远在 GitHub |
| P2 | 访问独立 | 用户访问链路完全不经过 GitHub，国内访问稳定 |
| P3 | 模块映射 | 每个 GitHub repo = 一个系统模块，目录级别可独立配置展示形态 |
| P4 | 最小外部依赖 | 外部服务只保留必要的三个，不过度设计 |
| P5 | 可审计 | 内容同步、评论审核均有日志，出问题可溯源 |

---

## 二、整体架构

### 2.1 系统分层

```
┌──────────────────────────────────────────────────────────┐
│                   前台展示层 (Public)                    │
│   blog · timeline · 收藏夹 · 搜索 · 分类 · 标签          │
│   评论区 · 点赞 · 阅读量                                  │
└─────────────────────┬────────────────────────────────────┘
                      │ Next.js App Router / RSC
┌─────────────────────▼────────────────────────────────────┐
│                  后台管理层 (Admin)                      │
│         Repo注册 · 同步状态 · 评论审核                   │
└─────────────────────┬────────────────────────────────────┘
                      │ Server Actions / API Routes
┌─────────────────────▼────────────────────────────────────┐
│                 服务端核心层 (Core)                      │
│      Webhook处理 · 内容解析 · 缓存 · 互动数据写入         │
└─────────────────────┬────────────────────────────────────┘
                      │ Octokit · Supabase · Upstash Redis
┌─────────────────────▼────────────────────────────────────┐
│                 数据存储层 (Storage)                     │
│           Supabase (PostgreSQL) · Upstash Redis          │
└─────────────────────┬────────────────────────────────────┘
                      │ Webhook / REST API
┌─────────────────────▼────────────────────────────────────┐
│               GitHub (唯一内容数据源)                    │
│   repo-human30 · repo-openclaw · repo-favorites          │
└──────────────────────────────────────────────────────────┘
```

### 2.2 数据流向

- **读取链路：** 用户请求 → Next.js → 查数据库缓存 → 渲染 MDX → 返回页面
- **内容同步：** 本地 push → GitHub → Webhook → 服务端拉取变更 → 解析 → 更新数据库
- **互动写入：** 点赞/评论/阅读量 → API Route → Supabase（不经过 GitHub）
- **降级同步：** node-cron 每 30 分钟对比 sha，补偿漏掉的 Webhook 事件

### 2.3 一键发布工作流

「一键发布」在本地通过脚本实现，系统后端无需任何改动。

```bash
# publish.sh（放在本地 repo 根目录）
#!/bin/bash
msg=${1:-"update: $(date '+%Y-%m-%d')"}
git add .
git commit -m "$msg"
git push
echo "✅ 已发布，30秒后网站更新"
```

使用方式：`./publish.sh` 或 `./publish.sh "update: 认知主权第三篇"`。也可配置为 VS Code Task，点按钮即发布。

---

## 三、技术选型

| 层级 | 选型 | 选型理由 |
|------|------|---------|
| 框架 | Next.js 14 (App Router) | 与现有 PRD 一致，RSC 减少客户端 JS |
| 内容渲染 | next-mdx-remote | 服务端动态渲染 MDX，支持自定义组件 |
| 数据库 | Supabase (PostgreSQL) | 免费套餐，自带 Auth，Row Level Security，互动数据和内容镜像统一存储 |
| Redis | Upstash Redis | 外部托管，免费套餐，REST API 与 Vercel KV 完全兼容，代码无需改动 |
| 定时任务 | node-cron | 内置于应用容器，替代 Vercel Cron Jobs，无平台依赖 |
| GitHub SDK | Octokit.js v4 | 官方 SDK，类型完整 |
| 搜索 | Pagefind | 静态索引，零服务端成本，支持跨模块搜索 |
| 样式 | Tailwind CSS v3 | 与现有 PRD 一致 |
| 认证 | NextAuth.js + GitHub OAuth | GitHub 账号登录后台，零额外账号体系 |
| 容器化 | Docker (multi-stage build) | standalone 输出，镜像体积约 200-300MB |
| 部署 | VPS 自托管（阿里云/腾讯云） | 完整服务器控制权，国内访问稳定，不受平台限制 |

---

## 四、数据模型

### 4.1 数据库总览（7 张表）

| 表名 | 用途 | 版本 |
|------|------|------|
| `repo_registry` | GitHub 仓库注册与模块配置 | v2.0 |
| `categories` | 共用分类体系（blog + 收藏夹跨模块共享） | v3.0 新增 |
| `content_items` | 已同步的内容条目（含 category_id、view_count） | v2.0，v3.0 扩展 |
| `sync_logs` | 同步任务日志 | v2.0 |
| `likes` | 文章点赞记录（含指纹去重） | v3.0 新增 |
| `comment_authors` | 游客评论作者身份 | v3.0 新增 |
| `comments` | 评论内容（含审核状态） | v3.0 新增 |

### 4.2 完整 Schema SQL

#### repo_registry

```sql
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
```

#### categories

```sql
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(100) UNIQUE NOT NULL,  -- URL用，如 'ai-tools'
  name        VARCHAR(100) NOT NULL,         -- 显示用，如 'AI工具'
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

> 注：同步时若 frontmatter 中的 category slug 不存在，系统自动创建，避免同步失败。

#### content_items

```sql
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
```

#### sync_logs

```sql
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
```

#### likes

```sql
CREATE TABLE likes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  fingerprint     VARCHAR(64) NOT NULL,  -- 浏览器指纹，防重复点赞
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_item_id, fingerprint)
);
```

#### comment_authors

```sql
CREATE TABLE comment_authors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    VARCHAR(100) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,  -- 关联同一设备的历史评论
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### comments

```sql
CREATE TABLE comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES comment_authors(id),
  body            TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Frontmatter 约定

#### 通用模块（Human 3.0 专栏 · 养虾日记）

```yaml
---
title: "认知主权：为什么你的思维在被接管"
date: 2026-03-10
category: "methodology"     # 对应 categories.slug，不存在时自动创建
tags: [cognitive-sovereignty, human30]
status: published            # published | draft
summary: "可选，缺省时自动截取正文前200字"
---
```

#### 收藏夹模块（由上游抓取系统填写）

```yaml
---
title: "文章标题"
date: 2026-03-17
category: "ai-tools"        # 共用分类体系，与 blog 同一张 categories 表
source_url: "https://mp.weixin.qq.com/..."
source_platform: wechat      # wechat | xiaohongshu | youtube | x | rss
tags: [ai, productivity]
status: published
---
```

---

## 五、核心模块详细设计

### 5.1 Webhook 同步服务

GitHub push 触发 Webhook，系统完成签名验证后直接处理同步（无队列，单人场景不需要）。处理逻辑：过滤 watch_paths 内的 `.md` 文件 → 拉取内容 → 解析 frontmatter → 查或建 category → Upsert content_items → 写 sync_log。

### 5.2 分类 · 标签 · 搜索

分类体系为 blog 和收藏夹共用，同一张 categories 表。前台提供三个维度的内容发现路径：

| 路由 | 内容 | 说明 |
|------|------|------|
| `/[module]` | 模块首页 | 支持 `?category=` 和 `?tag=` URL 参数筛选 |
| `/categories` | 全站分类总览 | 展示每个分类下来自哪些模块的内容数量 |
| `/categories/[slug]` | 分类详情页 | 跨 blog + 收藏夹聚合该分类所有内容 |
| `/tags/[tag]` | 标签聚合页 | 跨所有模块 |
| `/search?q=` | 全文搜索 | Pagefind 静态索引，搜索结果标注来源模块 |

### 5.3 前台展示模块

| display_type | 模块名 | 视图形态 | 特殊字段 |
|-------------|--------|---------|---------|
| `blog` | Human 3.0 专栏 | 文章列表（时间倒序）+ 详情页 + 评论区 + 点赞 + 阅读量 | 无 |
| `timeline` | 养虾日记 | 时间轴，按月分组 | 无 |
| `bookmarks` | 收藏夹 | 卡片列表，支持按 source_platform 过滤 | source_url, source_platform |

### 5.4 点赞功能

不需要登录。用浏览器指纹做基础去重，同一设备对同一文章只能点赞一次（支持取消）。

```
POST /api/content/:slug/like
→ 检查 likes 表是否存在 (content_item_id, fingerprint)
→ 不存在：INSERT（点赞）
→ 存在：DELETE（取消点赞）
→ 返回当前点赞总数
```

### 5.5 阅读量统计

用 Upstash Redis 做 24 小时去重，同一设备同一文章 24 小时内只计一次。后台登录状态下访问不触发计数。

```
POST /api/content/:slug/view
→ 检查 Redis: viewed:{fingerprint}:{slug}（TTL 24h）
→ 已存在：跳过
→ 不存在：SET Redis key + UPDATE content_items SET view_count = view_count + 1
```

### 5.6 游客评论与审核

游客填写昵称和内容即可评论，无需登录。评论默认 `pending` 状态，后台审核通过后才公开展示。

```
POST /api/content/:slug/comments
body: { nickname, body, fingerprint }
→ Upsert comment_authors（同指纹复用作者记录）
→ INSERT comments（status: 'pending'）
→ 返回「评论已提交，审核后展示」提示
```

后台审核页面：待审核列表默认视图、一键通过 / 拒绝、通过后前台立即可见。

> **后续扩展点：** 评论提交成功的感谢页预留公众号二维码位置，微信登录流程届时在此处插入，数据结构不需要变更。

### 5.7 后台管理功能清单

| 模块 | 功能 | 版本 |
|------|------|------|
| Repo 管理 | 添加 / 编辑 / 删除仓库映射，配置 watch_paths 和 display_type | v2.0 |
| 同步管理 | 查看同步日志，手动触发全量同步 | v2.0 |
| 分类管理 | 查看所有分类，编辑名称和排序 | v3.0 新增 |
| 评论审核 | 待审核列表，一键通过 / 拒绝 | v3.0 新增 |
| 系统设置 | Webhook 配置引导（URL + Secret） | v2.0 |

---

## 六、API 接口规范

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | `/api/webhook/github` | 接收 GitHub Webhook 事件 | 签名验证 |
| POST | `/api/sync/manual` | 手动触发全量同步 | Admin |
| GET | `/api/repos` | 获取所有 repo 配置 | Admin |
| POST | `/api/repos` | 新增 repo 配置 | Admin |
| PUT | `/api/repos/:id` | 更新 repo 配置 | Admin |
| DELETE | `/api/repos/:id` | 删除 repo 配置 | Admin |
| GET | `/api/content` | 内容列表（分页、分类、标签筛选） | Admin |
| GET | `/api/sync/logs` | 同步日志列表 | Admin |
| POST | `/api/content/:slug/view` | 记录阅读量（含去重） | Public |
| POST | `/api/content/:slug/like` | 点赞 / 取消点赞 | Public |
| GET | `/api/content/:slug/comments` | 获取已通过的评论列表 | Public |
| POST | `/api/content/:slug/comments` | 提交游客评论 | Public |
| GET | `/api/admin/comments` | 后台获取待审核评论 | Admin |
| PUT | `/api/admin/comments/:id` | 审核评论（通过/拒绝） | Admin |
| GET | `/api/categories` | 获取所有分类 | Public |

---

## 七、部署架构

### 7.1 部署方式概述

应用以 Docker 单镜像方式交付，部署到自有 VPS（阿里云/腾讯云等）。外部服务（Supabase、Upstash Redis、GitHub）独立运行，通过环境变量注入容器，不打包进镜像。

| 项目 | 方式 | 说明 |
|------|------|------|
| 应用本体 | Docker 单镜像 | Next.js standalone 构建，约 200-300MB |
| 数据库 | Supabase 云托管 | 外部服务，环境变量注入 |
| Redis | Upstash 云托管 | 外部服务，环境变量注入，REST API 与 Vercel KV 兼容 |
| GitHub 相关 | GitHub 云服务 | API / OAuth / Webhook，外部服务 |
| 定时任务 | node-cron（内置） | 随容器启动，替代 Vercel Cron Jobs |
| 反向代理 | Nginx（宿主机） | SSL 终止 + 端口转发到容器 3000 |

### 7.2 服务拓扑

```
用户请求 (HTTPS)
    │
    ▼
Nginx（宿主机，443 → 3000）
    │
    ▼
Docker 容器: personal-os
  ├─ Next.js App（前台展示 + API Routes）
  └─ node-cron（每30分钟降级同步）
       │
       ├─ Supabase PostgreSQL  ← 内容镜像 + 互动数据（云托管）
       ├─ Upstash Redis        ← 阅读量去重 + 同步锁（云托管）
       └─ GitHub REST API      ← 内容拉取（云服务）
```

### 7.3 Dockerfile

使用 multi-stage 构建，最终镜像只包含运行时产物。`next.config.js` 需开启 `output: 'standalone'`。

```dockerfile
# ── Stage 1: 构建 ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: 运行 ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

```js
// next.config.js
module.exports = {
  output: 'standalone',
}
```

### 7.4 环境变量完整清单

所有外部服务连接信息通过 `.env` 文件注入容器。服务器上执行 `chmod 600 .env` 收紧权限，不提交到 Git。

| 变量名 | 用途 | 备注 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 项目地址 | - |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端专用 Key | 不暴露到客户端 |
| `SUPABASE_ANON_KEY` | 客户端只读 Key | 前台读取公开数据用 |
| `KV_REST_API_URL` | Upstash Redis REST 地址 | 与 Vercel KV 同名，代码无需改动 |
| `KV_REST_API_TOKEN` | Upstash Redis 认证 Token | - |
| `GITHUB_TOKEN` | Personal Access Token | repo 只读权限即可 |
| `GITHUB_WEBHOOK_SECRET` | Webhook 签名密钥 | 自行生成随机字符串 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App | - |
| `NEXTAUTH_SECRET` | NextAuth 签名密钥 | 随机字符串，session 签名用 |
| `NEXTAUTH_URL` | 系统完整域名 | 如 https://your-domain.com |
| `NEXT_PUBLIC_URL` | 系统域名 | 用于 Webhook 回调地址 |
| `ADMIN_GITHUB_ID` | 后台唯一管理员 | 你的 GitHub 数字 ID |
| `PORT` | 容器监听端口 | 固定 3000 |

### 7.5 各外部服务一次性配置步骤

#### Supabase
- 新建项目 → 执行 7 张表的 schema SQL
- Settings → API → 复制 URL、anon key、service_role key

#### Upstash Redis
- 注册 Upstash → 新建 Redis 数据库（选亚太区节点，延迟低）
- 复制 REST URL 和 Token 填入 `.env`

#### GitHub Personal Access Token
- GitHub Settings → Developer settings → Personal access tokens
- 权限只需勾选 `repo`（只读）

#### GitHub OAuth App
- GitHub Settings → Developer settings → OAuth Apps → New OAuth App
- Callback URL 填 `https://your-domain.com/api/auth/callback/github`
- 复制 Client ID 和 Client Secret

#### GitHub Webhook（每个 repo 配置一次）
- repo → Settings → Webhooks → Add webhook
- Payload URL 填 `https://your-domain.com/api/webhook/github`
- Content type 选 `application/json`，Secret 填 `GITHUB_WEBHOOK_SECRET` 的值
- 事件选 `Just the push event`

### 7.6 部署与更新命令

#### 首次部署

```bash
# 构建镜像
docker build -t personal-os:latest .

# 创建并收紧 .env 权限
vim /home/deploy/.env
chmod 600 /home/deploy/.env

# 启动容器
docker run -d \
  --name personal-os \
  -p 3000:3000 \
  --env-file /home/deploy/.env \
  --restart always \
  personal-os:latest
```

#### 一键更新（deploy.sh）

```bash
#!/bin/bash
docker pull your-registry/personal-os:latest
docker stop personal-os && docker rm personal-os
docker run -d \
  --name personal-os \
  -p 3000:3000 \
  --env-file /home/deploy/.env \
  --restart always \
  your-registry/personal-os:latest
echo "✅ 部署完成"
```

### 7.7 Nginx 反向代理配置

宿主机安装 Nginx 做 SSL 终止，SSL 证书使用 Let's Encrypt 免费证书：`certbot --nginx -d your-domain.com`。

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

### 7.8 部署成本

| 项目 | 费用 | 备注 |
|------|------|------|
| VPS（2核2G） | ¥40–80/月 | 阿里云/腾讯云轻量应用服务器 |
| Supabase | $0 | Free 套餐，500MB，启动阶段够用 |
| Upstash Redis | $0 | Free 套餐，10K 请求/天 |
| GitHub 相关 | $0 | API / OAuth / Webhook 均免费 |
| SSL 证书 | $0 | Let's Encrypt 免费证书 |
| 域名 | ¥50–100/年 | 约 ¥5–10/月 |
| **合计** | **约 ¥50–90/月** | 主要成本为 VPS，数据量增长后 Supabase Pro $25/月 是第一个付费节点 |

---

## 八、分阶段实施计划

| 阶段 | 目标 | 周期 | 核心交付物 |
|------|------|------|-----------|
| Phase 0 | 环境搭建 | 3天 | 7张表 schema 建好，所有外部服务连通，14个环境变量配置完成 |
| Phase 1 | 单向同步 | 1周 | GitHub push → 数据库自动同步，30秒内完成，含分类自动创建 |
| Phase 2 | 前台展示 | 1.5周 | blog/timeline/bookmarks 三个模块，分类/标签/搜索，点赞，阅读量 |
| Phase 3 | 后台管理 | 3天 | Repo管理，同步日志，分类管理，评论审核 |
| Phase 4 | 评论系统 | 3天 | 游客评论提交，前台评论展示，后台审核流程 |

### Phase 0 详细任务

- 创建 Supabase 项目，执行 7 张表的完整 schema SQL
- 注册 Upstash，新建 Redis 数据库（亚太区）
- 创建 GitHub OAuth App
- 配置全部 14 个环境变量
- 验证 GitHub API token 对目标 repo 的只读权限
- 本地 `docker build` 验证镜像构建成功

> **验收：** `docker run` 启动后容器能连通 Supabase 和 Upstash Redis，GitHub API 调用返回正常。

### Phase 1 详细任务

- 实现 Webhook 接收端点（HMAC-SHA256 签名验证）
- 实现 GitHub Contents API 文件拉取（Octokit）
- 实现 gray-matter 解析（frontmatter + 正文 + 自动摘要）
- 实现 category 自动查找或创建逻辑
- 实现 content_items Upsert（含文件删除处理）
- 实现 sync_logs 写入
- 实现 node-cron 定时轮询降级（每 30 分钟）

> **验收：** push 一个 `.md` 文件到 GitHub，30 秒内 Supabase 出现记录，category 自动创建。

### Phase 2 详细任务

- 实现 blog 视图（列表 + 详情页，next-mdx-remote 渲染）
- 实现 timeline 视图（按月分组时间轴）
- 实现 bookmarks 视图（卡片列表 + source_platform 角标和过滤）
- 实现分类总览页 `/categories` 和分类详情页 `/categories/[slug]`
- 实现标签聚合页 `/tags/[tag]`
- 实现模块内分类/标签 URL 参数筛选
- 接入 Pagefind 全文搜索，结果标注来源模块
- 实现点赞接口和前台点赞组件
- 实现阅读量统计接口（含 Redis 24h 去重）

> **验收：** 三个模块可访问，分类/标签/搜索可用，点赞数据持久化，阅读量正确计数。

### Phase 3 详细任务

- 实现 GitHub OAuth 登录（NextAuth）
- 实现 Repo Registry CRUD 页面
- 实现同步日志查看页 + 手动触发全量同步
- 实现分类管理页（查看/编辑名称和排序）
- 实现评论审核页（待审核列表 + 一键通过/拒绝）
- 实现 Webhook 配置引导页

> **验收：** 后台所有页面可正常访问和操作，评论审核流程完整。

### Phase 4 详细任务

- 实现游客评论提交接口（含指纹关联作者）
- 实现前台评论区组件（昵称输入 + 内容 + 提交）
- 实现已通过评论的前台展示
- 评论提交成功感谢页（预留公众号二维码扩展位）

> **验收：** 游客可提交评论，后台审核通过后前台可见，感谢页展示正常。

---

## 九、风险与边界声明

### 9.1 已知风险

| 风险 | 等级 | 应对方案 |
|------|------|---------|
| GitHub API 速率限制（5000次/小时） | 低 | 增量同步 + sha 对比，正常使用远不会触发 |
| Webhook 漏事件 | 中 | node-cron 每 30 分钟定时轮询兜底 |
| 容器内存不足（VPS 2G） | 中 | Next.js standalone 构建体积小，正常运行约占 300-500MB |
| Supabase 免费套餐项目暂停（7天不活跃） | 低 | 持续内容更新不会触发；停更超7天需手动唤醒 |
| 垃圾评论 | 中 | 评论默认 pending，后台审核通过才展示 |
| 点赞数据被刷 | 低 | 浏览器指纹去重，不做登录强验证，接受一定误差 |
| 收藏夹 frontmatter 格式不规范 | 低 | 同步时对缺失字段做容错处理，不中断同步任务 |

### 9.2 明确不在范围内（v4.0）

- **在线编辑内容：** 所有内容编辑在本地完成，系统不提供编辑器
- **图片管理：** 图片由外部图床管理，系统不做转储或代理
- **微信登录：** 当前评论为游客模式，微信 OAuth 为后续扩展项
- **多用户协作：** 后台只允许 owner 账号登录
- **私有内容分级：** 不支持部分页面需要登录才能查看
- **实时评论推送：** 新评论通过刷新页面获取，不做 WebSocket

### 9.3 后续可扩展方向

- **微信登录评论：** 在评论提交流程前插入微信 OAuth，数据结构不变
- **多人协作：** 引入 Webhook 队列（Upstash QStash），已预留扩展点
- **wiki / gallery 展示类型：** display_type 枚举预留，扩展时只需新增视图组件
- **其他数据源：** Notion、本地文件等，新增 sync adapter，展示层不动
- **RSS 订阅输出：** 在内容 API 基础上增加 `/feed.xml` 端点
- **邮件订阅：** 接入 Beehiiv，与现有 PRD 一致

---

---

## 十、品牌设计系统

### 10.1 项目命名

项目名称：**Reef**

命名逻辑：珊瑚礁（Reef）是海洋生态系统的核心——GitHub 是海水，你的内容是礁石，OpenClaw 在里面进化生长。同时满足三个条件：与养虾宇宙 IP 天然连接、有生态系统生长的意象、英文简短易记域名好找。

### 10.2 Logo 设计

Logo 由两部分组成：**珊瑚图标**（Coral Mark）+ **字标**（Wordmark）。

**珊瑚图标结构**

图标采用三层分支结构，每层对应系统的一个语义层次：

```
嫩芽（#5DCAA5 / #9FE1CB）  ←  持续生长的内容
    │
枝桠（#0F6E56 / #1D9E75）  ←  各个 repo 模块
    │
主茎（#085041）             ←  GitHub 这条根
```

形态对称但每根枝桠长度略有差异，有生命感而非机械感。

**字标规范**

- 字体：系统 sans-serif，`font-weight: 500`
- 字间距：`letter-spacing: -0.5px`
- 副标题：`PERSONAL OS`，全大写，`letter-spacing: 4px`
- 图标与字标间距：图标宽度的 20%

**尺寸适配**

| 尺寸 | 用途 | 细节级别 |
|------|------|---------|
| 96 × 96 | App 图标 / 网站头像 | 完整细节，含所有枝桠和嫩芽 |
| 48 × 48 | 导航栏 | 保留核心五枝结构 |
| 32 × 32 | Favicon | 简化为主茎 + 五个圆点 |

**使用规范**

- 安全距离：图标四周留不少于图标宽度 20% 的净空
- 禁止拉伸、旋转或修改珊瑚图标比例
- 深色模式下图标色值不变，仅背景切换

### 10.3 双模式色彩系统

网站支持明暗两种主题切换：**明亮模式使用绿色系，暗色模式使用黑金色系**。

两套色系共享同一个珊瑚图标形态——形状是品牌的锚点，颜色是模式的表达。切换时用户感知到的是「同一个 Reef，换了一件衣服」。

气质逻辑：白天用绿色，像珊瑚在阳光下的样子；夜晚用黑金，像深海里发光的生物。

#### 明亮模式（Light）— 绿色系

| 色值 | 名称 | 用途 |
|------|------|------|
| `#085041` | 深海 | 主文字、图标主茎 |
| `#0F6E56` | 珊瑚茎 | 图标枝桠 |
| `#1D9E75` | 主色 | 按钮、链接、高亮、副标题 |
| `#5DCAA5` | 枝桠 | 图标嫩芽、次要元素 |
| `#9FE1CB` | 嫩芽 | 图标顶端、浅色点缀 |
| `#E1F5EE` | 浅底 | 页面背景、卡片底色 |

#### 暗色模式（Dark）— 黑金色系

| 色值 | 名称 | 用途 |
|------|------|------|
| `#0D0D0D` | 深黑 | 页面背景 |
| `#141414` | 卡片黑 | 卡片、组件底色 |
| `#1A1200` | 深茎 | 图标根部 |
| `#5C3D00` | 暗金茎 | 图标主茎 |
| `#8B5E00` | 中金 | 图标枝桠 |
| `#C9A84C` | 主金 | Wordmark、按钮、链接、高亮 |
| `#D4B45A` | 亮金 | 图标主嫩芽 |
| `#E8CC80` | 高光金 | 图标顶端嫩芽、强调色 |
| `#2A2010` | 金边 | 卡片描边、分割线 |

### 10.4 CSS 变量与 Tailwind 配置

所有 UI 组件通过 CSS 变量引用主色，切换模式时整页色温一致翻转。

**CSS 变量定义**

```css
:root {
  /* 明亮模式 — 绿色系 */
  --primary:        #1D9E75;
  --primary-dark:   #085041;
  --primary-light:  #5DCAA5;
  --primary-subtle: #E1F5EE;

  --bg-page:        #f0f7f4;
  --bg-card:        #ffffff;
  --border:         #c8e6da;

  --text-primary:   #085041;
  --text-secondary: #1D9E75;
  --text-muted:     #5DCAA5;
}

.dark {
  /* 暗色模式 — 黑金色系 */
  --primary:        #C9A84C;
  --primary-dark:   #5C3D00;
  --primary-light:  #D4B45A;
  --primary-subtle: #1A1200;

  --bg-page:        #0D0D0D;
  --bg-card:        #141414;
  --border:         #2A2010;

  --text-primary:   #E8CC80;
  --text-secondary: #C9A84C;
  --text-muted:     #8B6B20;
}
```

**Tailwind 配置**

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:  'var(--primary)',
        'primary-dark':   'var(--primary-dark)',
        'primary-light':  'var(--primary-light)',
        'primary-subtle': 'var(--primary-subtle)',
        'bg-page':  'var(--bg-page)',
        'bg-card':  'var(--bg-card)',
        border:     'var(--border)',
      },
    },
  },
}
```

**使用示例**

```tsx
// 按钮
<button className="bg-primary text-white hover:bg-primary-dark">
  发布
</button>

// 卡片
<div className="bg-bg-card border border-border rounded-lg">
  ...
</div>

// 主色文字
<span className="text-primary">Human 3.0 专栏</span>
```

### 10.5 主题切换实现

使用 `next-themes` 库，在 `layout.tsx` 根节点注入，默认跟随系统：

```tsx
// app/layout.tsx
import { ThemeProvider } from 'next-themes'

export default function RootLayout({ children }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

切换按钮：

```tsx
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '☀️ 明亮' : '🌙 暗色'}
    </button>
  )
}
```

### 10.6 Logo 源文件清单

| 文件 | 用途 | 规格 |
|------|------|------|
| `reef-logo-light.svg` | 明亮模式完整 Lockup | 480 × 160，透明背景 |
| `reef-logo-dark.svg` | 暗色模式完整 Lockup | 480 × 160，含深色背景 |
| `reef-favicon.svg` | Favicon / 纯图标 | 32 × 32，透明背景 |

**Next.js 项目接入方式**

```
/public
  /brand
    reef-logo-light.svg
    reef-logo-dark.svg
    reef-favicon.svg
```

```tsx
// 响应主题自动切换 Logo
import { useTheme } from 'next-themes'
import Image from 'next/image'

export function Logo() {
  const { resolvedTheme } = useTheme()
  const src = resolvedTheme === 'dark'
    ? '/brand/reef-logo-dark.svg'
    : '/brand/reef-logo-light.svg'
  return <Image src={src} alt="Reef" width={160} height={54} priority />
}
```

---

*文档结束 · v6.0 终稿 · 可进入实施阶段*

---

## 十一、首页设计规范

### 11.1 设计方案

采用**编辑极简**风格，参考 Linear / Vercel 的视觉语言。

核心原则：内容优先，克制装饰，白天绿色清爽，夜晚黑金沉稳。主题切换保持页面结构完全不变，只通过 CSS 变量切换色值。

### 11.2 页面结构

```
┌─────────────────────────────────────────────────┐
│  导航栏（sticky）                                │
│  Logo · 专栏 · 养虾日记 · 收藏夹 · ☀/☽ · 关于我 │
├─────────────────────────────────────────────────┤
│  英雄区                                          │
│  徽章 · 大标题 · 副文案 · 双按钮                 │
├─────────────────────────────────────────────────┤
│  三模块卡片（三等分网格）                         │
│  方法论专栏 · 养虾日记 · 收藏夹                  │
├─────────────────────────────────────────────────┤
│  最新更新时间线                                  │
│  标题栏 · 5条更新条目（含类型/日期/标签）        │
├─────────────────────────────────────────────────┤
│  页脚                                           │
│  Reef · GitHub 驱动 · RSS · 关于我 · 后台       │
└─────────────────────────────────────────────────┘
```

### 11.3 导航栏规范

```
高度：56px
背景：var(--bg)，sticky 吸顶
底部边框：0.5px solid var(--border)
内边距：0 32px

左：Logo（珊瑚图标 24px + "Reef" 文字）
中：导航链接（专栏 / 养虾日记 / 收藏夹），字号 13px
右：主题切换按钮 + 关于我按钮
```

**主题切换按钮**

```tsx
// 组合：☀ 图标 + 滑轨 + ☽ 图标
// 滑轨：宽 32px，高 18px，border-radius 9px
// 明亮模式：滑轨背景 var(--border)，☀ 高亮，☽ 半透明
// 暗色模式：滑轨背景 var(--pri)（金色），☽ 高亮，☀ 半透明
// 切换动画：thumb transition 0.25s，颜色 transition 0.25s
```

**Logo 颜色适配**

```css
/* 明亮模式 */
.nav-logo-text { color: #085041; }  /* 深绿 */

/* 暗色模式 */
.dark .nav-logo-text { color: #C9A84C; }  /* 金色 */
```

### 11.4 英雄区规范

```
内边距：52px 32px 44px
对齐：居中
```

| 元素 | 规格 |
|------|------|
| 徽章 | 绿底圆角胶囊，左侧小圆点，文字「Human 3.0 · 个人数字系统」|
| 大标题 | 40px / 500 / letter-spacing -0.8px / 两行 |
| 副文案 | 15px / 400 / line-height 1.7 / max-width 440px |
| 主按钮 | 背景 `var(--pri-d)`，白色文字，10px 22px padding，radius 7px |
| 次按钮 | 透明背景，`var(--pri-d)` 文字，`var(--pri-l)` 边框 |

> 暗色模式主按钮文字改为 `#0D0D0D`（深黑），避免金底白字对比度不足。

### 11.5 模块卡片规范

三等分网格，`gap: 12px`，`padding: 0 32px 36px`。

每张卡片：

```css
background: var(--bg-card);
border: 0.5px solid var(--border);
border-top: 2px solid var(--card-accent);  /* 各模块独立色 */
border-radius: 12px;
padding: 20px;
```

| 模块 | 顶部强调色 | 标签文字 |
|------|-----------|---------|
| 方法论专栏 | `#1D9E75` | HUMAN 3.0 |
| 养虾日记 | `#5DCAA5` | 养虾宇宙 |
| 收藏夹 | `#9FE1CB` | BOOKMARKS |

卡片内结构：图标（36×36 圆角方块）→ 标签（10px 大写）→ 标题（14px 500）→ 描述（12px）→ 底部（条目数 + 进入箭头）。

### 11.6 更新时间线规范

```
padding: 0 32px 36px
标题：11px / letter-spacing 1.5px / var(--t4)
右侧「查看全部 →」：12px / var(--pri)
```

时间线竖线：

```css
.tl::before {
  left: 16px; width: 1px;
  background: var(--border);
}
```

每条条目由**颜色圆点 + 卡片**组成：

| 来源 | 圆点颜色 | 胶囊样式 |
|------|---------|---------|
| Human 3.0 | `#1D9E75` | 绿底深绿字 |
| 养虾日记 | `#5DCAA5` | 中性浅底 |
| 收藏夹 | `#9FE1CB` | 中性浅底 |

条目卡片内：类型胶囊 + 日期（右对齐）→ 标题（13px 500）→ 摘要（12px）→ 标签行。

### 11.7 主题切换 CSS 变量完整映射

```css
.light {
  /* 背景 */
  --bg:       #f4f8f5;
  --bg-card:  #ffffff;
  --bg-soft:  #eef6f1;
  /* 主色 */
  --pri:      #1D9E75;
  --pri-d:    #085041;
  --pri-l:    #5DCAA5;
  --pri-xl:   #9FE1CB;
  --pri-s:    #E1F5EE;
  /* 边框 */
  --border:   #c8e6da;
  /* 文字 */
  --t1:       #0d1f18;   /* 主文字 */
  --t2:       #3a5a48;   /* 次要文字 */
  --t3:       #7aaa90;   /* 辅助文字 */
  --t4:       #b0d0c0;   /* 最弱文字 */
  /* Logo */
  --logo-color: #085041;
  /* 胶囊 */
  --pill-g-bg:  #E1F5EE;  --pill-g-c: #085041;
  --pill-n-bg:  #f0f7f4;  --pill-n-c: #7aaa90;
  --tag-bg:     #eef6f1;  --tag-c:    #1D9E75;
}

.dark {
  /* 背景 */
  --bg:       #0D0D0D;
  --bg-card:  #141414;
  --bg-soft:  #1A1200;
  /* 主色（金色系） */
  --pri:      #C9A84C;
  --pri-d:    #E8CC80;
  --pri-l:    #D4B45A;
  --pri-xl:   #8B5E00;
  --pri-s:    #1A1200;
  /* 边框 */
  --border:   #2A2010;
  /* 文字 */
  --t1:       #E8CC80;
  --t2:       #C9A84C;
  --t3:       #8B6B20;
  --t4:       #5C3D00;
  /* Logo */
  --logo-color: #C9A84C;
  /* 胶囊 */
  --pill-g-bg:  #1A1200;  --pill-g-c: #C9A84C;
  --pill-n-bg:  #111111;  --pill-n-c: #5C3D00;
  --tag-bg:     #1A1200;  --tag-c:    #C9A84C;
}
```

### 11.8 Next.js 实现要点

**主题切换**：使用 `next-themes`，`attribute="class"`，切换时给 `<html>` 挂 `.dark` 类，CSS 变量自动响应。

**导航栏固定**：`position: sticky; top: 0; z-index: 10`，滚动时内容从下方穿过。

**路由结构对应**：

```
/                    →  首页（本文档描述的页面）
/human30             →  Human 3.0 专栏模块
/openclaw            →  养虾日记模块
/bookmarks           →  收藏夹模块
/about               →  关于我页面
```

**时间线数据来源**：从 `content_items` 表按 `published_at` 倒序查询，`JOIN` `repo_registry` 获取模块信息，前台展示最新 5–10 条。
