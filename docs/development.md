# Reef · 开发文档 v1.2

**文档状态：** 可执行版本（修订）  
**创建日期：** 2026-03-19  
**依据文档：** `docs/design.md`（v6.0）

---

## 一、文档目标

本文档将系统设计转化为工程实施方案，用于指导开发排期、接口实现、数据模型落地、部署与验收。

当前版本明确采用分阶段实施策略：**第一期默认使用 `Next.js-only` 方案，不实现 Go 后端**；同步、持久化与正式后台能力按后续阶段逐步接入。

核心目标：

1. 明确第一期 `Next.js-only` 的代码组织与页面边界；
2. 明确互动原型、数据访问层与后续正式同步链路的衔接方式；
3. 明确 API、数据库、鉴权、安全与运维基线；
4. 明确分阶段交付与验收标准。

---

## 二、范围与原则

### 2.1 范围

- 本文档覆盖 Reef v6.0 的开发实施（前台、后台、同步、互动、部署）。
- 不包含在线编辑器、图片托管系统、多用户协作、私有内容分级等非目标能力。

### 2.2 实施原则

- **GitHub 为唯一内容源**：Markdown 原文不在系统内编辑与托管；
- **数据库存镜像与互动**：存储索引、缓存、评论、点赞、阅读量；
- **第一期 Next.js-only**：首版由 Next.js 页面、Route Handlers 与 `lib/*` 数据访问层组成；
- **同步链路后置**：Webhook 主驱动 + Cron 兜底保留为后续阶段正式实现；
- **页面与数据访问分层**：页面不直接耦合数据源细节，便于从本地开发库切换到托管数据库。

---

## 三、技术架构与仓库组织

## 3.1 技术选型

- 前端：Next.js 14（App Router）+ Tailwind CSS + next-themes + next-mdx-remote
- 第一期服务端：Next.js Route Handlers + Server Components + `frontend/lib/*`
- 后续阶段预留：Go 1.22 + Gin + pgx + sqlc + go-redis
- 数据：Supabase PostgreSQL + Upstash Redis
- 外部：GitHub API / OAuth / Webhook
- 部署：Docker + docker-compose + Nginx

## 3.2 目录结构（建议实现）

```text
reef/
├── frontend/
│   ├── app/
│   │   ├── (public)/
│   │   └── admin/
│   ├── components/
│   └── lib/
├── docs/
│   ├── design.md
│   └── development.md
└── docker-compose.yml
```

> 说明：`backend/` 目录在第一期不是默认交付物；若出现，仅视为后续阶段预留或预研代码。

## 3.3 第一期间接口边界

- 前端（Next.js）仅负责页面渲染与交互，不直接连接数据库；
- Next.js Route Handlers 承担首版 API、轻量交互与临时数据访问层；
- 前端通过 `frontend/lib/api.ts` 请求同域 `/api/*`；
- Nginx 统一入口直接转发至 Next.js 服务。

---

## 四、数据库落地规范

## 4.1 表结构

沿用设计文档定义的 7 张表：

- `repo_registry`
- `categories`
- `content_items`
- `sync_logs`
- `likes`
- `comment_authors`
- `comments`

## 4.2 迁移规范

- 迁移文件放置于 `backend/migrations/`；
- 已执行迁移**只增不改**；
- 每次 schema 变更必须附带回滚脚本（若工具支持）。

## 4.3 索引建议

建议额外创建以下索引：

- `content_items(slug)`
- `content_items(repo_id, published_at DESC)`
- `content_items(category_id)`
- `comments(content_item_id, status, created_at DESC)`
- `sync_logs(repo_id, started_at DESC)`

---

## 五、同步链路实现（后续阶段）

## 5.1 Webhook 同步（主链路，后续阶段）

接口：`POST /api/webhook/github`

执行流程：

1. 验证 GitHub `X-Hub-Signature-256`；
2. 解析 push payload 与变更文件；
3. 过滤 `watch_paths` 且扩展名为 `.md` 的文件；
4. 调用 GitHub Contents API 拉取内容；
5. 解析 frontmatter 与正文；
6. 分类 slug 不存在则自动创建；
7. Upsert `content_items`，处理删除文件；
8. 写入 `sync_logs`。

失败策略：

- 单文件失败不阻断整批；
- 将错误写入 `sync_logs.error_detail`；
- 保证请求可重放与幂等。

## 5.2 Cron 兜底同步（补偿链路，后续阶段）

- 调度：每 30 分钟；
- 逻辑：对比 repo 最近 commit sha，发现偏差触发增量同步；
- 并发控制：使用 Redis 锁，避免重复执行。

---

## 六、互动链路实现

## 6.1 阅读量

接口：`POST /api/content/:slug/view`

- Redis Key：`viewed:{fingerprint}:{slug}`，TTL 24h；
- 命中则不计数；未命中则写 key 并 `view_count + 1`；
- 后台登录访问不计数。

## 6.2 点赞

接口：`POST /api/content/:slug/like`

- 去重键：`(content_item_id, fingerprint)` 唯一约束；
- 不存在则插入（点赞），存在则删除（取消）；
- 返回最新点赞总数。

## 6.3 评论与审核

- 提交接口：`POST /api/content/:slug/comments`
- 审核接口：`PUT /api/admin/comments/:id`

规则：

- 游客可提交昵称 + 内容；
- 新评论状态默认 `pending`；
- 仅 `approved` 评论在前台展示；
- 通过 fingerprint 复用 `comment_authors`。

---

## 七、API 规范

## 7.1 统一响应结构

```json
// success
{ "data": {}, "error": null }

// failed
{ "data": null, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

## 7.2 关键错误码

- `WEBHOOK_SIGNATURE_INVALID`
- `SYNC_IN_PROGRESS`
- `GITHUB_API_RATE_LIMIT`
- `CONTENT_NOT_FOUND`
- `UNAUTHORIZED`

## 7.3 权限模型

- Public：前台内容、点赞、阅读、评论提交
- Admin：仓库管理、同步管理、评论审核
- 鉴权：NextAuth + GitHub OAuth，管理员由 `ADMIN_GITHUB_ID` 白名单控制

---

## 八、前端开发规范

- 优先使用 RSC 获取数据，减少客户端 JS；
- 所有 API 请求统一封装于 `frontend/lib/api.ts`；
- 组件命名使用 PascalCase；工具函数使用 camelCase；
- 主题色通过 CSS 变量驱动，不硬编码颜色；
- 明暗主题由 `next-themes` 控制，默认 `system`。

---

## 九、服务端实现规范
- 第一期默认不新增 Go 服务；
- 需要服务端逻辑时，优先使用 Next.js Route Handlers / Server Components / `frontend/lib/*`；
- 所有接口保持统一响应结构，不在页面组件内直接散落 `fetch`；
- 本地开发库与正式数据源之间通过统一数据访问层切换；
- 若进入后续 Go 阶段，再补充 Handler / service / db 分层与 Go 代码规范。

---

## 十、部署与环境

## 10.1 环境变量

关键变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `GITHUB_TOKEN`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_URL`
- `ADMIN_GITHUB_ID`

## 10.2 部署步骤（最小闭环）

1. 配置 `.env` 并设置权限 `chmod 600 .env`；
2. 安装前端依赖并完成 `frontend` 构建；
3. 启动 Next.js 容器；
4. 配置 Nginx 与 HTTPS；
5. 验证首页、模块页、搜索与互动原型可访问；
6. 后续阶段再接入数据库迁移、GitHub Webhook 与正式同步链路。

---

## 十一、里程碑与验收

## Phase 0（3 天）Next.js 基线

交付：`frontend/`、主题系统、路由结构、环境变量样板、容器可启动。

验收：`cd frontend && npm run build` 通过，首页可访问。

## Phase 1（1 周）前台展示与原型交互

交付：blog / timeline / bookmarks 三模块，分类/标签/搜索，点赞/阅读量/评论原型。

验收：三模块可访问，筛选与搜索有效，互动原型可用。

## Phase 2（3 天）托管数据库切换

交付：接入 Supabase 或正式 PostgreSQL，替换本地开发库配置。

验收：互动数据在正式数据库中可持久化，页面不再依赖本地开发库地址。

## Phase 3（3 天）后台管理

交付：GitHub OAuth、评论审核、基础配置页、同步状态页。

验收：管理页功能可用，权限控制正确。

## Phase 4（1 周）正式同步链路

交付：Webhook、内容解析、分类自动创建、Upsert、sync 日志、cron 兜底。

验收：push `.md` 后 30 秒内数据库出现变更记录。

---

## 十二、风险与缓解

- **GitHub API 限流**：进入正式同步阶段后使用增量同步 + sha 对比，减少 API 调用。
- **Webhook 漏事件**：在 Phase 4 引入 cron 补偿兜底。
- **垃圾评论**：默认 pending + 后台审核。
- **低配 VPS 资源紧张**：优化镜像与并发，监控内存峰值。

---

## 十三、上线前检查清单

- [ ] 第一期开发不引入 Go 后端
- [ ] 所有必需环境变量已校验
- [ ] `frontend` 构建通过
- [ ] 互动接口具备原型级幂等控制
- [ ] 后台仅管理员可访问
- [ ] HTTPS 与强制跳转已配置
- [ ] Webhook 签名验证在后续同步阶段启用

---

*Reef 开发文档 v1.2 · 第一阶段采用 Next.js-only 实施*
