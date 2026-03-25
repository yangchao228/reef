# Reef · 单租户遗留逻辑清理清单

**文档状态：** 收口中  
**版本日期：** 2026-03-24  
**关联文档：** `docs/development.md`、`docs/phased-roadmap.md`、`docs/pre-build-decisions.md`

---

## 一、目的

这份文档用于明确三件事：

1. 哪些单租户遗留逻辑已经清理完成；
2. 哪些逻辑仍然以兼容/开发态形式保留；
3. 哪些能力不应在“清理单租户”时被误删。

结论先写在前面：

> Reef 当前主干已经以多租户模型为唯一运行时前提；剩余工作不再是“是否切换”，而是“把少量兼容桥和开发态 fallback 继续压缩”。

单人使用场景统一视为：

> 多租户内核下的一个单人 workspace。

---

## 二、当前结论

### 2.1 已经完成的主切换

- 新环境和 CI 已统一使用 `frontend/db/init/002_multitenant_v2.sql`
- repository / API 主链已不再保留旧 schema 双分支
- 核心查询和写入都显式带 `workspace_id`
- 后台权限已从 IP 白名单切到 `users + workspace_members`
- 请求未指定 workspace 时已不再静默回退到进程级默认 workspace
- 前台模块定义已改为从 `repo_registry` 动态读取

### 2.2 当前仍保留的过渡层

- `GITHUB_TOKEN` 仍作为开发态手动同步 fallback
- `GITHUB_APP_INSTALLATION_TOKENS_JSON` 仍作为本地 installation token 桥接方式保留
- 少量历史草案文档中仍可见 `default-personal` 这类示例 workspace 名称，但它已不是运行时隐式默认值

### 2.3 当前最重要的剩余清理目标

- 继续收紧开发态 GitHub token fallback 的使用边界
- 继续清理文档、脚本提示和注释中的原型期命名残留

---

## 三、清理原则

### 3.1 不兼容旧运行时，只兼容内容来源

后续系统不需要继续兼容：

- 单租户 schema
- 单租户查询分支
- 单租户管理员模型
- 单系统全局 token 授权模型

后续系统只需要兼容：

- 如何重新从 GitHub 恢复内容

### 3.2 单人模式不等于单租户

未来即使仍支持单人部署，也应通过：

- 一个用户
- 一个 workspace
- 一套标准多租户 schema

来实现，而不是恢复旧运行时分支。

### 3.3 开发态 fallback 可以存在，但不能成为主链

允许保留：

- fixture 导入
- 本地 markdown 导入
- `GITHUB_TOKEN` / installation token 映射的本地调试能力

但它们必须始终被明确标注为：

- 开发态工具
- 验收工具
- 调试桥接

而不是生产主链。

---

## 四、已完成清理项

## 4.1 双 schema 探测与分支兼容

状态：已完成

结论：

- `hasWorkspaceSchema()` 这类双 schema 探测逻辑已不再是主链实现的一部分
- repository 和 API 层默认按多租户模型读写
- `001_schema.sql` 已不再是新环境和 CI 的有效入口

影响：

- 代码主干只剩一种有效数据模型
- 多租户测试覆盖面明显更清晰

## 4.2 后台 IP 白名单模型

状态：已完成

结论：

- `ADMIN_IP_ALLOWLIST` 已退出主链
- `/admin` 当前按 `workspace_members` 中的 `owner/admin` 角色鉴权
- 后台已经从“系统后台”转成“workspace 后台”

## 4.3 进程级默认 workspace 回退

状态：已完成

结论：

- 请求未指定 workspace 时，前台会跳转到 `/workspaces`
- `REEF_WORKSPACE_SLUG ?? "default-personal"` 这类全局默认主路径已被移除
- 当前 `default-personal` 只会作为示例或测试 workspace 名称出现，不再承担隐式运行时回退

## 4.4 固定模块硬编码

状态：基本完成

已完成：

- `ModuleSlug` 固定联合类型已删除
- 前台模块卡片、导航和模块路由已按 `repo_registry` 动态生成
- 后台模块卡片与同步目标也按当前 workspace 动态读取

剩余尾巴：

- fixture、smoke 与部分示例文档仍以 `human30/openclaw/bookmarks` 作为默认演示集

---

## 五、仍在保留的过渡逻辑

## 5.1 后台身份桥接

状态：已基本完成

当前情况：

- 主路径已经统一到 `x-reef-user-login` / `reef_user_login`
- `reef_admin_login` 旧 cookie 已退出运行时主链，只保留清理逻辑
- `x-reef-github-login` header 兼容已从主链移除

剩余尾巴：

- 少量文档和注释仍会提到过渡期身份桥接的历史背景

## 5.2 开发态 GitHub token fallback

状态：进行中

当前情况：

- webhook / 自动同步主链已优先走 GitHub App installation
- `GITHUB_TOKEN` 只用于开发态手动同步 fallback
- `GITHUB_APP_INSTALLATION_TOKENS_JSON` 只用于本地 installation token 桥接

为什么还没完全删：

- 本地验收、仓库调试和尚未完全配好 GitHub App 的环境仍需要低成本补偿入口

后续动作：

- 继续把这两项限制在开发/验收文档与脚本说明中
- 避免它们继续出现在生产语义文档或运行时默认路径上

## 5.3 示例 workspace 命名残留

状态：低优先级尾项

当前情况：

- README 和 CI 主链示例已改为更明确的 `reef-ci-space`
- 少量历史草案文档仍保留 `default-personal` 这类示例名称
- 这些都只是示例 workspace slug，不再代表系统会默认回退到它

后续动作：

- 继续在非主干文档中逐步替换为更明确的“示例 workspace”语义

---

## 六、不应误删的能力

## 6.1 workspace 解析能力

需要保留：

- 从 header / cookie / 路由上下文解析 workspace
- `/workspaces` 选择与创建入口

不应恢复：

- 全局默认 workspace 静默回退

## 6.2 本地导入与 fixture 导入能力

需要保留：

- `import:markdown`
- fixture seed
- smoke 验收数据准备

原因：

- 这些能力对开发、验收和 CI 仍有高价值
- 它们是工具链，不是单租户运行时

## 6.3 单人部署能力

需要保留：

- 单用户部署 Reef 的能力

实现要求：

- 通过“一个用户 + 一个 workspace + 多租户 schema”实现
- 不能通过恢复旧单租户 schema 或旧查询分支实现

---

## 七、后续清理顺序

## Phase A：继续清理 legacy 身份命名

目标：

- 继续减少文档、注释和提示语中的过渡期身份术语
- 仅保留正式用户会话和 OAuth 身份语义

## Phase B：继续收紧开发态同步 fallback

目标：

- 明确 `GITHUB_TOKEN` 与 installation token 映射只用于开发/验收
- 继续避免其出现在生产语义主链中

## Phase C：继续清理文档与提示语

目标：

- 把“已完成切换”的项从待办文档中移出
- 减少原型期命名在 README、脚本 usage、后台提示中的残留

---

## 八、完成标准

当下面条件全部成立时，可以认为单租户遗留逻辑已经基本清理完成：

1. 代码主干不再包含旧 schema / 新 schema 双分支
2. 所有核心表读写都显式带 workspace 边界
3. 后台权限基于成员关系而不是 IP 白名单
4. 自动同步授权基于 GitHub App installation
5. 请求上下文不再依赖隐式默认 workspace
6. 模块定义不再硬编码为固定三项
7. legacy header 身份桥接已移除
8. 开发态 token fallback 不再被误解为生产主链

---

## 九、最终结论

Reef 当前真正需要做的，不再是“从单租户切到多租户”，而是：

> 在已经完成的多租户主干之上，继续压缩最后一层兼容桥和开发态 fallback，让运行时、文档和运维认知完全一致。
