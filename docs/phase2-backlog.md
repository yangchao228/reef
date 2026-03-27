# Reef · Phase 2 执行 Backlog

**文档状态：** 执行中  
**更新日期：** 2026-03-27  
**关联文档：** `docs/phased-roadmap.md`、`docs/development.md`、`docs/single-tenant-cleanup-checklist.md`、`docs/ops-runbook.md`

---

## 一、说明

这份文档用于把下一阶段 backlog 固化成仓库内的执行基线。

当前尝试通过 GitHub API 直接创建 issue，但本地 `GITHUB_TOKEN` 仅具备读权限，GitHub 返回：

> `Resource not accessible by personal access token`

因此当前先采用：

- 仓库内 backlog 文档作为正式记录
- 代码实现直接按这里的顺序推进
- 待后续 token scope 补齐后，再回填远端 issue

---

## 二、执行顺序

### P0

1. `B01` 正式化补偿同步调度入口
2. `B02` 扩展 `sync_logs` 结构化 schema
3. `B03` 固化同步失败分类器
4. `B04` 补后台同步异常展示映射层

### P1

5. `B05` 重构测试分层并下沉异常验证到库级测试
6. `B06` 扩大关键补偿链路的 smoke 覆盖
7. `B07` 收紧开发态同步 fallback 与 legacy 命名

### P2

8. `B08` 补后台同步运维 runbook
9. `B09` 更新 Phase 2 路线图与状态文档

---

## 三、当前推进状态

### In Progress

- `B01` 正式化补偿同步调度入口
- `B07` 收紧开发态同步 fallback 与 legacy 命名

### Recently Landed

- `B02` 已补 `sync_logs` 结构化字段与展示映射
- `B03` 已固化首批失败分类器
- `B04` 后台已开始显示失败分类、恢复动作和 `compensationRunId`
- `B05` 已补同步分类器与补偿批次归组的库级测试
- `B06` smoke 已覆盖关键补偿链路，acceptance 环境已跑通
- `B08` 已补同步运维 runbook
- `B09` README / 开发文档 / 路线图已按当前实现更新

---

## 四、各项定义

### `B01` 正式化补偿同步调度入口

目标：
把 `npm run sync:compensate -- --only-failed` 从人工动作升级成稳定可调度的系统能力。

验收要点：

- 优先使用部署环境原生 scheduler
- 宿主机 cron 作为备用方案
- 不使用 GitHub Actions 承担生产补偿主链
- 同一 `workspace` 在一个调度窗口内不会重复执行同一轮补偿

当前状态：

- 已有正式执行命令、并发锁、去重窗口与 runbook
- 剩余工作是把调度入口挂到真实部署环境

### `B02` 扩展 `sync_logs` 结构化 schema

目标：
让后台和运维不再依赖原始错误字符串，而是直接消费结构化同步事实。

目标字段：

- `failure_category`
- `recovery_action`
- `compensation_run_id`
- `is_retryable`
- `operator_summary`

### `B03` 固化同步失败分类器

目标：
让 webhook、手动同步、补偿同步对同一类错误给出一致的分类和恢复建议。

首批覆盖类别：

- `installation_required`
- `authorization_required`
- `watch_paths_invalid`
- `repo_config_invalid`
- `github_api_temporary`
- `content_parse_failed`

### `B04` 补后台同步异常展示映射层

目标：
把后台从“展示状态”推进成“给出处理动作”的运营界面。

### `B05` 重构测试分层并下沉异常验证到库级测试

目标：
控制 CI 时长，把高频异常验证从 smoke 下沉到库级测试。

### `B06` 扩大关键补偿链路的 smoke 覆盖

目标：
保留最关键的补偿闭环端到端验证。

### `B07` 收紧开发态同步 fallback 与 legacy 命名

目标：
继续把 `GITHUB_TOKEN`、`GITHUB_APP_INSTALLATION_TOKENS_JSON` 限定在开发/验收语义内。

### `B08` 补后台同步运维 runbook

目标：
让接手人按文档即可完成一次基础诊断与恢复。

当前状态：

- 已完成，见 `docs/ops-runbook.md`

### `B09` 更新 Phase 2 路线图与状态文档

目标：
让 README、开发文档、路线图重新对齐当前真实实现。

当前状态：

- 已完成一轮更新；后续只需随主链小步同步
