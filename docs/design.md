# Reef · 系统设计方案 v6.0

**文档状态：** 设计主档（含历史规划内容）  
**版本日期：** 2026-03-17  
**前序版本：** v1.0 → v2.0 → v3.0 → v4.0 → v5.0 → v6.0  
**主题：** GitHub as CMS · 个人内容数字系统 · Docker 单镜像部署 · VPS 自托管

---

> 说明：本文档保留了若干阶段性设计痕迹；当前真实运行时、数据模型、鉴权与 CI 主链，以 `docs/development.md` 和 `frontend/db/init/002_multitenant_v2.sql` 为准。

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

> **产品北极星补充：让每个人从信息消费者，成长为拥有数字生产资料的个人生产者。**

### 1.2 设计原则

| 编号 | 原则 | 含义 |
|------|------|------|
| P1 | 数据主权 | GitHub repo 是唯一真相来源，数据库只存缓存、索引和互动数据，原始内容永远在 GitHub |
| P2 | 访问独立 | 用户访问链路完全不经过 GitHub，国内访问稳定 |
| P3 | 模块映射 | 每个 GitHub repo = 一个系统模块，目录级别可独立配置展示形态 |
| P4 | 最小外部依赖 | 外部服务只保留必要的三个，不过度设计 |
| P5 | 可审计 | 内容同步、评论审核均有日志，出问题可溯源 |

> 补充说明：后续系统目标、设计选择和实现优先级，统一参考 `docs/product-direction.md`。

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
│ installation维护 · 模块绑定 · 同步状态 · 评论审核        │
└─────────────────────┬────────────────────────────────────┘
                      │ Server Actions / API Routes
┌─────────────────────▼────────────────────────────────────┐
│                 服务端核心层 (Core)                      │
│   Webhook处理 · 内容解析 · workspace鉴权 · 互动数据写入   │
└─────────────────────┬────────────────────────────────────┘
                      │ Octokit · GitHub OAuth/App · PostgreSQL
┌─────────────────────▼────────────────────────────────────┐
│                 数据存储层 (Storage)                     │
│      PostgreSQL · sync_logs · comments · likes           │
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
- **互动写入：** 点赞/评论/阅读量 → API Route → PostgreSQL（不经过 GitHub）
- **降级同步：** 定时补偿仍在后续阶段，当前已具备 webhook + 手动同步 + 失败重试

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
| 数据库 | PostgreSQL | 当前开发与 CI 直接使用 PostgreSQL，后续可替换为托管 PostgreSQL |
| Redis | 暂未作为主链前提 | 阅读去重与定时补偿可在后续阶段接入，不是当前主干依赖 |
| 定时任务 | node-cron（规划中） | 用于后续定时补偿同步，不是当前已完成主链 |
| GitHub SDK | Octokit.js v4 | 官方 SDK，类型完整 |
| 搜索 | Pagefind | 静态索引，零服务端成本，支持跨模块搜索 |
| 样式 | Tailwind CSS v3 | 与现有 PRD 一致 |
| 认证 | GitHub OAuth + workspace 成员模型 | 当前主链由 GitHub 用户身份与 `workspace_members` 共同定义后台权限 |
| 容器化 | Docker (multi-stage build) | standalone 输出，镜像体积约 200-300MB |
| 部署 | VPS 自托管（阿里云/腾讯云） | 完整服务器控制权，国内访问稳定，不受平台限制 |

---

## 四、数据模型

### 4.1 当前主干的数据模型

当前运行时与 CI 已统一切到 `frontend/db/init/002_multitenant_v2.sql`。核心表包括：

- `users`
- `workspaces`
- `workspace_members`
- `github_app_installations`
- `repo_registry`
- `categories`
- `content_items`
- `sync_logs`
- `comment_authors`
- `comments`
- `likes`
- `view_events`

### 4.2 当前关键约束

- 所有内容、互动、同步日志都显式带 `workspace_id`
- repo、分类、评论作者、点赞与阅读去重都按 workspace 约束
- 模块清单来自 `repo_registry`，不再来自固定枚举
- GitHub 同步权限优先按 `workspace -> github_app_installations -> installation token` 解析
- 当前不再支持单租户 schema 作为有效运行时

### 4.3 Schema 参考

- 当前可执行 schema：`frontend/db/init/002_multitenant_v2.sql`
- 这份设计文档中旧的单租户 SQL 草案不再作为实现依据

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

应用以 Docker 单镜像方式交付，部署到自有 VPS（阿里云/腾讯云等）。当前主干只要求 Next.js 服务 + PostgreSQL + GitHub；定时补偿、Redis 与更多外部服务属于后续增强项。

| 项目 | 方式 | 说明 |
|------|------|------|
| 应用本体 | Docker 单镜像 | Next.js standalone 构建，约 200-300MB |
| 数据库 | PostgreSQL | 当前开发与 CI 已直接使用 |
| Redis | 可选增强项 | 当前主链未强依赖 |
| GitHub 相关 | GitHub 云服务 | API / OAuth / Webhook，外部服务 |
| 定时任务 | node-cron（规划中） | 用于后续补偿同步 |
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
  └─ node-cron（后续补偿同步）
       │
       ├─ PostgreSQL           ← 内容镜像 + 互动数据
       └─ GitHub REST API      ← 内容拉取与授权校验
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
| `DATABASE_URL` | PostgreSQL 连接串 | 当前主链必需 |
| `REEF_WORKSPACE_SLUG` | 脚本默认 workspace | 开发与 CI 常用 |
| `REEF_ADMIN_GITHUB_LOGIN` | 初始 owner / admin login | 开发与 CI 常用 |
| `NEXT_PUBLIC_SITE_URL` | 前台站点地址 | 生成链接与回跳使用 |
| `NEXTAUTH_URL` | OAuth / 会话相关回调地址 | 如 `https://your-domain.com` |
| `NEXTAUTH_SECRET` | 会话签名密钥 | 随机字符串 |
| `GITHUB_WEBHOOK_SECRET` | Webhook 签名密钥 | 自行生成随机字符串 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App | - |
| `GITHUB_OAUTH_STATE_SECRET` | OAuth state 签名密钥 | 推荐配置 |
| `GITHUB_APP_NAME` | GitHub App 名称 | 安装入口生成使用 |
| `GITHUB_APP_STATE_SECRET` | GitHub App setup state 签名密钥 | 推荐配置 |
| `GITHUB_APP_ID` | GitHub App ID | 生产主链必需 |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App 私钥 | 生产主链必需 |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | GitHub App 私钥 Base64 形式 | 私钥替代写法 |
| `GITHUB_TOKEN` | 开发态 manual fallback | 不再是自动同步主链前提 |
| `GITHUB_APP_INSTALLATION_TOKENS_JSON` | 开发态 installation token 映射 | 本地桥接调试用 |
| `SMOKE_BASE_URL` | smoke test 访问地址 | 测试专用 |
| `PORT` | 容器监听端口 | 固定 3000 |

### 7.5 各外部服务一次性配置步骤

#### PostgreSQL
- 准备数据库实例
- 执行 `frontend/db/init/002_multitenant_v2.sql` 对应的初始化脚本
- 本地开发与 CI 直接使用 `npm run db:init`

#### GitHub Personal Access Token（开发态可选）
- GitHub Settings → Developer settings → Personal access tokens
- 仅作为手动同步 fallback，不再作为自动同步主链前提

#### GitHub OAuth App
- GitHub Settings → Developer settings → OAuth Apps → New OAuth App
- Callback URL 填 `https://your-domain.com/auth/github/callback`
- 复制 Client ID 和 Client Secret

#### GitHub App
- Setup URL 填 `https://your-domain.com/github-app/setup`
- User authorization callback URL 填 `https://your-domain.com/auth/github/callback`
- Webhook URL 填 `https://your-domain.com/api/webhook/github`

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
| PostgreSQL | $0 起 | 本地自建或托管 PostgreSQL，按部署方式决定 |
| Redis | $0 起 | 当前主链可不接，补偿同步阶段再决定是否引入 |
| GitHub 相关 | $0 | API / OAuth / Webhook 均免费 |
| SSL 证书 | $0 | Let's Encrypt 免费证书 |
| 域名 | ¥50–100/年 | 约 ¥5–10/月 |
| **合计** | **约 ¥40–90/月起** | 主要成本通常仍是 VPS，数据库是否托管取决于部署策略 |

---

## 八、分阶段实施计划

| 阶段 | 目标 | 周期 | 核心交付物 |
|------|------|------|-----------|
| Phase 0 | 内容平台原型 | 已完成 | 前台展示、分类/标签/搜索、互动原型、Markdown 导入 |
| Phase 1 | 多租户底座 | 已基本完成 | `workspace`、成员关系、GitHub App installation、`v2` schema |
| Phase 2 | 后台运维收口 | 进行中 | 评论审核、模块绑定、手动同步、失败重试、风险提示 |
| Phase 3 | 同步可靠性增强 | 进行中 | webhook 主链、补偿同步、失败恢复、日志可视化 |
| Phase 4 | Agent 接入 | 后置 | 主链稳定后再接入 Agent Module |

### Phase 0 详细任务

- 初始化 PostgreSQL
- 执行 `npm run db:init`
- 执行 `npm run workspace:ensure`
- 导入 fixture 或本地 Markdown 内容
- 验证 `npm run build` 与 `npm run test:smoke`

> **验收：** 本地或 CI 环境能完成 schema 初始化、workspace 建立、fixture 导入、构建与 smoke。

### Phase 1 详细任务

- webhook 同步主链可用
- 模块手动同步可用
- GitHub App installation 绑定可用
- `sync_logs` 可用于后台查看模块最近状态
- 失败模块可直接重试
- 后续再补 cron 补偿同步

> **验收：** 后台可查看同步状态、失败原因并触发补偿动作。

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

- GitHub OAuth 建立真实用户身份
- `/workspaces` 完成 workspace 选择与身份建立
- `/admin` 可查看评论、同步日志、installation 与模块状态
- 后台支持评论审核、installation 维护、模块绑定、手动同步与失败重试

> **验收：** workspace owner/admin 可以在后台完成主要运营动作。

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
