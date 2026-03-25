# Reef · 多租户数据库骨架草案

**文档状态：** 草案  
**版本日期：** 2026-03-20  
**关联文档：** `docs/pre-build-decisions.md`、`docs/product-direction.md`、`docs/phased-roadmap.md`

---

## 一、目标

这份文档用于定义 Reef 从当前单租户原型演进到多租户平台时的数据库骨架。

目标不是一次性把所有未来能力做完，而是先建立一个不会阻碍后续扩展的基础结构。

根据当前已确认决策，多租户设计必须满足：

- 一个用户可以拥有多个 workspace
- workspace 是后续资产、repo、权限、Agent 调用的主要边界
- 默认私有，公开显式开启
- GitHub 授权方案未来采用 GitHub App
- 资产结构未来需要支持 Material / Insight / Model / Output / Agent 扩展

---

## 二、当前问题

当前 schema 仍然是典型单租户结构，主要问题有：

1. `repo_registry.slug` 是全局唯一，没有 workspace 边界
2. `categories.slug` 是全局唯一，不适合多租户
3. `comment_authors.fingerprint` 是全局唯一，未来容易串用户数据
4. 前台查询默认按全库内容读取，没有租户过滤
5. 后台鉴权是全局 IP 白名单，不是资源归属模型
6. GitHub repo 目前直接挂在系统级配置上，不具备用户级授权结构

结论：

> 如果不先补多租户骨架，后续越往上做功能，返工成本越高。

---

## 三、设计原则

本次多租户骨架遵循以下原则：

## 3.1 workspace 是核心租户边界

用户可以有多个 workspace。  
后续 repo、内容、评论、同步日志、Agent 配置等，都应首先归属到 workspace。

## 3.2 用户是身份主体，不是唯一资产边界

用户负责：

- 登录
- 授权
- 成员身份
- 权限关系

但资产本身优先归 workspace，而不是直接归 user。

## 3.3 兼容未来 GitHub App

数据库设计要能承接：

- GitHub 安装信息
- 安装与 workspace 的绑定
- 一个 workspace 连接多个 repo

## 3.4 兼容未来资产分层

当前 `content_items` 可以先继续承接文章与内容镜像；  
未来再向 `assets` / `insights` / `models` / `outputs` 扩展。

本次不强行一步到位改成完整五层模型，但会预留演进路径。

---

## 四、建议引入的新核心实体

## 4.1 users

代表用户身份主体。

建议字段：

- `id`
- `github_user_id`
- `github_login`
- `name`
- `avatar_url`
- `email`
- `created_at`
- `updated_at`

用途：

- 用户登录
- 用户绑定 GitHub 身份
- 成员关系与权限判断

## 4.2 workspaces

代表资产空间，是最核心的租户边界。

建议字段：

- `id`
- `owner_user_id`
- `slug`
- `name`
- `description`
- `visibility` (`private` / `public`)
- `created_at`
- `updated_at`

说明：

- 一个用户可以拥有多个 workspace
- `slug` 建议在全局唯一，或至少未来保证可做公开 URL

## 4.3 workspace_members

代表用户与 workspace 的成员关系。

建议字段：

- `id`
- `workspace_id`
- `user_id`
- `role` (`owner` / `admin` / `editor` / `viewer`)
- `created_at`

说明：

- 当前阶段即便只有 owner，也建议先建这张表
- 这样未来协作权限不会推翻现有结构

## 4.4 github_app_installations

代表 GitHub App 安装信息。

建议字段：

- `id`
- `workspace_id`
- `github_installation_id`
- `github_account_login`
- `github_account_type`
- `created_at`
- `updated_at`

用途：

- 为未来 GitHub App 授权与 repo 同步做准备

---

## 五、现有核心表的改造方向

## 5.1 repo_registry

当前问题：

- 缺少 workspace 归属
- `slug` 全局唯一，不适合多租户

建议新增字段：

- `workspace_id`
- `github_installation_id`（可为空，未来接 GitHub App）

建议调整唯一约束：

- 从 `slug UNIQUE`
- 改为 `(workspace_id, slug) UNIQUE`

说明：

- 同一个 workspace 内 repo slug 唯一即可
- 不同 workspace 允许出现相同 slug

## 5.2 categories

当前问题：

- `slug` 全局唯一
- 类别没有租户边界

建议新增字段：

- `workspace_id`

建议调整唯一约束：

- `(workspace_id, slug) UNIQUE`

说明：

- 分类是资产组织能力，应该至少在 workspace 级隔离

## 5.3 content_items

当前状态：

- 已通过 `repo_id` 间接归属 repo

建议：

- 保持 `repo_id` 为主归属
- 可考虑冗余增加 `workspace_id`，用于查询和后续 RLS

理由：

- 通过 `repo_id -> workspace_id` 能间接归属
- 但为了查询效率与权限控制，冗余 `workspace_id` 会更稳

## 5.4 sync_logs

建议：

- 保留 `repo_id`
- 增加 `workspace_id`

理由：

- 后台按 workspace 查看同步状态会更方便

## 5.5 comments / comment_authors / likes / view_events

这些表虽然通过 `content_item_id` 可以间接归属，但建议后续逐步补：

- `workspace_id`

原因：

- 未来做权限隔离、审计、统计会更清晰

其中要特别注意：

- `comment_authors.fingerprint` 不能继续全局唯一

建议改为：

- `(workspace_id, fingerprint) UNIQUE`

否则不同 workspace 下会错误复用评论身份。

---

## 六、建议的目标关系

推荐主链路：

`users -> workspace_members -> workspaces -> repo_registry -> content_items`

同时：

- `workspaces -> github_app_installations`
- `content_items -> comments / likes / view_events`
- `repo_registry -> sync_logs`

如果未来扩展资产结构层，则路径可继续演进为：

`workspaces -> assets -> insights -> models -> outputs`

但当前阶段不必强拆现有 `content_items`。

---

## 七、建议的迁移顺序

为了降低风险，建议分三步迁移，而不是一次性替换。

## Step 1：补多租户骨架，不改现有读路径

新增：

- `users`
- `workspaces`
- `workspace_members`
- `github_app_installations`

并为现有单租户数据创建一个默认 workspace，例如：

- `default-personal`

目标：

- 先建立归属关系，不立刻打碎现有查询

## Step 2：把现有业务表挂到 workspace

依次给以下表补归属：

- `repo_registry.workspace_id`
- `categories.workspace_id`
- `sync_logs.workspace_id`
- 视情况补 `content_items.workspace_id`

并调整唯一约束与索引。

目标：

- 让“租户边界”在数据库层成立

## Step 3：改查询与权限模型

改造重点：

- 所有内容查询默认带 workspace 条件
- 后台能力按 workspace 权限控制
- 多用户访问能力围绕 workspace 展开

目标：

- 从“结构已存在”推进到“真正多租户运行”

---

## 八、暂时不要做的事

这份草案阶段，建议明确不做：

- 不一步到位拆成完整五层资产表
- 不先做复杂协作角色体系
- 不先做跨 workspace 共享网络
- 不先做复杂公开市场或社区系统

理由：

- 当前第一目标是建立稳定的租户骨架
- 不是一次性完成最终平台形态

---

## 九、下一步建议

基于这份草案，下一步最合理的是：

1. 产出一版 `v2 schema` SQL 草案
2. 明确默认 workspace 初始化策略
3. 设计 `repo_registry`、`categories` 的新唯一约束
4. 列出 repository 层最先要改的查询函数

也就是先从“文档草案”进入“可执行 schema 草案”。

---

## 十、结论

多租户数据库骨架的核心结论是：

> Reef 未来的真正边界不是 user，也不是 repo，而是 workspace。

因此后续数据库演进应以 workspace 为中心，把 repo、内容、同步、评论、权限、GitHub 授权全部逐步纳入这个边界之内。

只有这样，Reef 才能从当前个人原型，平滑升级为可扩展的多用户数字资产平台。
