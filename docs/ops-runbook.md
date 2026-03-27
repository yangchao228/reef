# Reef · 同步运维 Runbook

**文档状态：** 当前可执行  
**更新日期：** 2026-03-27  
**关联文档：** `README.md`、`docs/development.md`、`docs/phase2-backlog.md`

---

## 一、目的

这份 runbook 用于把 Reef 当前同步主链的诊断与恢复动作固定下来。

目标不是解释架构，而是回答两件事：

1. 模块不同步时先看什么；
2. 看到不同异常时该执行什么动作。

---

## 二、当前推荐的补偿调度方式

生产环境优先级固定如下：

1. 部署环境原生 scheduler
2. 宿主机 cron
3. 不使用 GitHub Actions 承担生产补偿主链

当前推荐执行命令：

```bash
cd frontend
DATABASE_URL=postgres://reef:reef@127.0.0.1:5432/reef \
REEF_WORKSPACE_SLUG=your-workspace-slug \
  npm run sync:compensate -- --only-failed
```

当前建议：

- 默认每 15 分钟执行一次
- 默认保留 `--only-failed`
- 默认保留脚本内置的 10 分钟去重窗口
- 不额外包一层自定义并发锁，直接复用脚本内置 guard
- 同一 scheduler 只负责一个 `workspace`

当前仓库已提供宿主机包装脚本：

```bash
REEF_WORKSPACE_SLUG=your-workspace-slug ./deploy/reef-compensate.sh
```

如果采用 Docker 部署，这个脚本会转而执行：

```bash
docker compose run --rm compensator
```

如果采用 systemd，可直接使用仓库内模板：

- `deploy/systemd/reef-compensate@.service`
- `deploy/systemd/reef-compensate@.timer`

宿主机 cron 备用示例：

```cron
*/15 * * * * cd /srv/reef && REEF_WORKSPACE_SLUG=your-workspace-slug ./deploy/reef-compensate.sh >> /var/log/reef-compensate.log 2>&1
```

说明：

- 若有多个 `workspace`，建议一行 cron 对应一个 `workspace`
- 出现 `COMPENSATION_ALREADY_RUNNING` 或 `COMPENSATION_RECENT_DUPLICATE` 时，属于预期保护，不算事故
- 当前补偿脚本会继续写入 `sync_logs`，`trigger_type = cron`

---

## 三、标准排查顺序

模块不同步时，固定按这个顺序排查：

1. 先看 `/admin` 顶部状态消息和 `Compensation Sync` 卡片
2. 再看模块卡片中的最近一次同步状态、失败分类、恢复动作
3. 再跳到 `Sync Logs` 看最近失败日志
4. 如果失败分类指向 installation / 授权问题，回到 installation 区确认绑定和凭据
5. 如果失败分类指向模块配置问题，回到对应模块卡片确认 `watch paths` 和 repo 绑定
6. 如果只是 GitHub 临时失败，先不要改配置，等下一轮补偿或手动重试

不建议一上来直接重跑所有同步。

先判断是配置错误、授权失效，还是临时波动，否则只会重复制造失败日志。

---

## 四、异常分类与处理动作

### 4.1 `installation_required`

含义：

- 模块没有绑定 GitHub App installation
- 或当前 workspace 下没有对应 installation 记录

先看：

- `/admin#installation-settings`
- 模块卡片上的 installation 绑定状态

处理动作：

1. 确认当前 workspace 已完成 GitHub App 安装
2. 确认 installation 已登记到当前 workspace
3. 确认目标模块已绑定 installation
4. 再执行“重试同步”或等待下一轮补偿

### 4.2 `authorization_required`

含义：

- App 私钥不可用
- installation token 无法获取
- GitHub OAuth / App 授权链路不完整

先看：

- 服务端 `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_PRIVATE_KEY_BASE64`
- 当前 workspace installation 绑定

处理动作：

1. 确认服务端 GitHub App 配置存在且未过期
2. 确认当前 installation 仍可访问目标 repo
3. 如果是本地验收环境，确认不是误用了开发态 fallback
4. 修复后执行一次手动重试，观察日志是否恢复

### 4.3 `watch_paths_invalid`

含义：

- 模块没有配置有效 `watch paths`
- 同步目标路径为空或不合法

先看：

- 模块卡片中的 `Watch paths`
- `repo_registry` 对应模块配置

处理动作：

1. 补齐目标模块的 `watch paths`
2. 确认路径与目标仓库分支一致
3. 再执行手动同步验证

### 4.4 `repo_config_invalid`

含义：

- repo owner / repo 名称 / branch / 绑定关系不正确
- 或模块并不属于 GitHub 主链同步目标

先看：

- 模块卡片中的 repo 信息
- 最近一次失败日志里的 `operator_summary`

处理动作：

1. 核对 repo owner、repo、branch
2. 核对模块来源是否应为 `meta.source = github`
3. 对于本地 fixture / 导入模块，不要把它们放进生产补偿主链

### 4.5 `github_api_temporary`

含义：

- GitHub 5xx
- GitHub API 临时不可用
- 速率限制或短时抖动

先看：

- 最近失败日志时间是否集中
- 是否多个模块同时报相同类别

处理动作：

1. 不立即改 installation 或 repo 配置
2. 等待下一轮 scheduler 补偿
3. 如果连续多个补偿窗口仍失败，再人工重试并继续观察

### 4.6 `content_parse_failed`

含义：

- Markdown frontmatter 或正文格式异常
- 内容层无法被当前导入逻辑解析

先看：

- 失败日志中的 `operator_summary`
- 对应 repo / 文件内容

处理动作：

1. 修复 Markdown 内容
2. 再执行手动同步
3. 确认日志恢复为成功后结束处理

---

## 五、什么时候点“重试同步”，什么时候点“补偿失败模块”

优先点“重试同步”：

- 只影响单个模块
- 刚修完 installation、repo 绑定或 `watch paths`
- 想快速验证配置是否已恢复

优先点“补偿失败模块”：

- 失败可能涉及多个模块
- 刚恢复了 GitHub App 或全局授权问题
- 想让系统批量恢复最近失败的 GitHub 模块

不要直接补偿：

- 模块是本地 fixture / 本地导入模块
- `watch paths` 仍为空
- installation 根本没绑定

---

## 六、什么时候需要人工介入

出现下面情况时，不要只靠自动补偿：

- 同一模块连续多个补偿窗口都失败
- 多个模块同时出现 `authorization_required`
- installation 已存在，但所有 GitHub 模块都同步失败
- 日志中出现明确内容解析错误
- webhook 长时间没有命中任何模块，同时手动同步也异常

这类情况应直接进入“配置 / 授权 / 内容”排障，不应继续重复点击补偿。

---

## 七、最小运维闭环

一次标准恢复流程应是：

1. 在 `/admin` 确认失败分类
2. 修 installation / 授权 / repo / `watch paths` / Markdown 内容
3. 对单模块先点“重试同步”验证
4. 若问题影响多个模块，再执行“补偿失败模块”
5. 最后回看 `Sync Logs`，确认成功日志已写回

完成以上五步，才算一次同步故障真正恢复。
