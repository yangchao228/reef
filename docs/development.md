# Reef · 开发文档 v2.0

**文档状态：** 当前可执行版本  
**更新日期：** 2026-03-24  
**关联文档：** `docs/design.md`、`docs/product-direction.md`、`docs/phased-roadmap.md`

---

## 一、文档目标

本文档用于描述 Reef 当前主干的真实工程状态，统一：

1. 当前运行时架构；
2. 当前多租户数据模型；
3. 当前鉴权、同步、后台运维与 CI 主链；
4. 下一阶段仍需收口的工作。

当前主线已经不是“单租户内容站原型”，而是：

> 以 `workspace` 为边界、以 GitHub App 为授权主线、以数字资产沉淀为核心目标的多租户资产平台底座。

---

## 二、当前阶段判断

当前项目处于 `Phase 1 -> Phase 2` 的收口阶段：

- `v1` 内容平台原型已经可用；
- `v2` 多租户 schema 已进入运行时与 CI；
- 后台审核、模块绑定、手动同步、失败重试和风险提示已具备；
- 正式 GitHub OAuth / GitHub App 身份链路已接入，但仍有少量开发态 fallback 尚未彻底退出；
- 定时补偿同步、失败重试自动化、更多后台运维细节仍待继续补齐。
- 当前补偿脚本已具备 workspace 级并发保护和短窗口去重保护，避免重复执行同一轮补偿。

当前不再把单租户 schema 视为有效运行选项。

---

## 三、技术架构与仓库组织

### 3.1 当前技术选型

- 前端与服务端：Next.js 14（App Router）
- 数据访问：`frontend/lib/*` + Route Handlers
- 数据库：PostgreSQL
- 内容源：GitHub repo / Markdown
- 授权主线：GitHub OAuth + GitHub App installation
- 搜索与前台展示：Next.js 页面 + 当前 workspace 动态模块清单
- 部署形态：当前主干仍以单体 Next.js 服务为主，不引入独立 Go 服务

### 3.2 当前仓库组织

```text
reef/
├── frontend/
│   ├── app/
│   │   ├── (public)/
│   │   ├── admin/
│   │   ├── auth/
│   │   └── github-app/
│   ├── components/
│   ├── db/init/
│   ├── lib/
│   └── scripts/
├── docs/
└── .github/workflows/
```

### 3.3 当前运行时边界

- 页面层不直接写 SQL；
- 数据访问通过 `frontend/lib/*` repository 与服务函数集中处理；
- 请求上下文必须显式解析当前 `workspace`；
- 后台、同步、互动、前台查询全部以 `workspace_id` 为边界；
- 当前唯一支持的初始化 schema 为 `frontend/db/init/002_multitenant_v2.sql`。

---

## 四、当前数据模型

### 4.1 当前主干使用的 v2 多租户表

当前运行时和 CI 使用的是 `frontend/db/init/002_multitenant_v2.sql`，核心表包括：

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

### 4.2 核心约束

- 所有内容、互动、同步日志都必须显式绑定 `workspace_id`
- `workspace_members` 决定当前 workspace 内角色
- `repo_registry` 在 workspace 内唯一，模块定义来自数据库，不再来自硬编码枚举
- `github_app_installations` 与 workspace 绑定，repo 同步权限按 installation 解析
- 评论、点赞、阅读去重都已改为 workspace 级约束

### 4.3 当前不再支持的旧假设

- 单租户 `001_schema.sql`
- 不带 `workspace_id` 的查询/写入分支
- 全局 repo / 全局 slug / 全局 fingerprint 假设
- 请求未指定 workspace 时静默回退到默认空间

---

## 五、身份、权限与工作区模型

### 5.1 当前身份链路

- `/workspaces` 负责当前登录身份建立、workspace 选择和 workspace 创建入口
- 正式 GitHub 登录通过 `GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET` 驱动
- 运行时默认读取统一用户会话语义：`x-reef-user-login` / `reef_user_login`
- `x-reef-user-login` / `reef_user_login` 是当前唯一用户身份解析入口
- `reef_admin_login` 旧 cookie 已退出运行时主链

### 5.2 当前后台权限模型

- `/admin` 按 workspace 成员关系鉴权
- 当前 workspace 内角色为 `owner` 或 `admin` 才能访问后台
- 后台不再依赖 IP 白名单，也不再依赖单一系统管理员模型

### 5.3 当前工作区解析要求

- 请求侧通过 `x-reef-workspace` 或 `reef_workspace` cookie 指定当前 workspace
- 未选择 workspace 时，依赖内容上下文的页面会跳转到 `/workspaces`
- 脚本侧通过 `REEF_WORKSPACE_SLUG` 或 `--workspace` 显式指定目标 workspace

---

## 六、内容与同步链路

### 6.1 内容来源

- GitHub Markdown 仍是内容真相源
- 数据库保存的是镜像、索引、互动与同步状态
- 本地和 CI 仍支持 fixture / Markdown 目录导入

### 6.2 当前同步主链

- 手动脚本可从本地目录或 GitHub repo 拉取 Markdown
- 运行时支持 `POST /api/webhook/github`
- webhook / 手动同步都会写入 `sync_logs`
- 同步授权优先走 `workspace -> github_app_installations -> installation token`
- `GITHUB_TOKEN` 与 `GITHUB_APP_INSTALLATION_TOKENS_JSON` 只保留为开发态 fallback

### 6.3 当前后台运维能力

- 维护 workspace 的 GitHub App installation
- 绑定模块与 installation
- 手动触发模块同步
- 失败后直接重试同步
- 查看模块级最近同步状态、错误提示和风险提示
- 查看最近同步日志

### 6.4 仍待继续补齐的同步能力

- 定时补偿同步的系统调度层
- 更明确的失败重试策略
- 更细的同步日志可视化和运营指标

当前已经补了一个可直接被系统定时器调用的补偿脚本：

- `npm run sync:compensate -- --workspace <workspace-slug>`
- 支持 `--only-failed`
- 支持 `--module <module-slug>`
- 支持 `--dedupe-window-minutes <n>`
- 只会处理 `meta.source = github` 的模块，并把结果继续写入 `sync_logs`
- 同一 workspace 的补偿运行会先拿 advisory lock，避免并发补偿互相重叠
- 默认带 10 分钟去重窗口，短时间内重复触发相同范围补偿会直接跳过

---

## 七、互动与后台审核

### 7.1 当前互动接口

- 阅读：`POST /api/content/:slug/view`
- 点赞：`POST /api/content/:slug/like`
- 评论提交：`POST /api/content/:slug/comments`

### 7.2 当前评论审核闭环

- 新评论默认 `pending`
- 后台可直接批准或拒绝
- 只有 `approved` 评论在前台可见
- smoke test 已覆盖“提交评论 -> 后台审核 -> 前台展示”闭环

---

## 八、CI 与验收

### 8.1 当前 CI 主链

`.github/workflows/ci.yml` 当前执行：

1. 安装依赖
2. 初始化 `v2` schema
3. 创建默认测试 workspace
4. 校验 `v2` schema
5. 运行库级同步测试
6. 导入 fixture 内容
7. 运行 `npm run build`
8. 启动服务
9. 运行 `npm run test:smoke`

### 8.2 当前 smoke 覆盖重点

- workspace 上下文可用
- 前台内容基础访问
- 评论提交与后台审核闭环
- 后台同步风险提示
- 手动同步失败后的错误展示
- 失败模块显示“重试同步”

---

## 九、环境变量

按当前实现，环境变量分为四组。

### 9.1 本地开发必需

- `DATABASE_URL`
- `REEF_WORKSPACE_SLUG`
- `REEF_ADMIN_GITHUB_LOGIN`
- `NEXT_PUBLIC_SITE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

### 9.2 推荐配置

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_OAUTH_STATE_SECRET`
- `GITHUB_APP_NAME`
- `GITHUB_APP_STATE_SECRET`

### 9.3 生产 GitHub App 主链必需

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` 或 `GITHUB_APP_PRIVATE_KEY_BASE64`
- `GITHUB_WEBHOOK_SECRET`

### 9.4 开发态 fallback / 测试专用

- `GITHUB_TOKEN`
- `GITHUB_APP_INSTALLATION_TOKENS_JSON`
- `SMOKE_BASE_URL`

说明：

- `GITHUB_TOKEN` 不再是自动同步主链前提；
- `GITHUB_APP_INSTALLATION_TOKENS_JSON` 只适合本地桥接调试；
- `.env.example` 为当前推荐最小模板。

---

## 十、本地开发与部署最小闭环

### 10.1 本地开发最小闭环

1. 复制 `.env.example` 为 `.env`
2. 启动本地 PostgreSQL
3. 在 `frontend/` 下执行 `npm install`
4. 运行 `npm run db:init`
5. 运行 `npm run workspace:ensure`
6. 导入 fixture 或本地 Markdown 内容
7. 启动 `npm run dev`
8. 访问 `/workspaces` 建立身份并选择 workspace
9. 访问 `/admin` 验证后台运维链路

### 10.2 当前部署验收点

- workspace 目录页可访问
- 当前 workspace 可正常浏览内容
- `/admin` 能读取评论队列、installation、模块状态和同步日志
- 手动同步入口可见
- smoke test 可通过

---

## 十一、当前阶段里程碑

### 已完成

- `v1` 内容平台原型
- `v2` 多租户 schema 落地
- workspace 选择与当前身份建立
- 评论审核闭环
- GitHub App installation 保存与模块绑定
- 后台模块手动同步、失败重试和风险提示
- CI 多租户化与 smoke 扩展

### 正在收口

- 继续清理少量 legacy 命名与文档残留
- 继续补同步补偿与后台运维细节
- 继续扩大自动化验证覆盖

### 明确后置

- Agent Module / OpenClaw 接入
- 更复杂的资产检索层与长期记忆层

---

## 十二、下一步建议

当前最合适的后续顺序仍是：

1. 继续完善同步补偿和失败恢复；
2. 继续清理剩余单租户/过渡逻辑；
3. 继续扩大 CI 和 smoke 对后台主链的覆盖；
4. 主链稳定后，再推进 Agent Module。

---

*Reef 开发文档 v2.0 · 当前主干以多租户资产底座收口为核心*
