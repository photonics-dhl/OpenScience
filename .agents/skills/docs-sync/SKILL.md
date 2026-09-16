---
name: docs-sync
description: Sync actual project changes and decisions before ending a work turn, at meaningful checkpoints, and before handoff/compaction/deployment. Resolve stale or conflicting state; skip unchanged question-only turns.
---

# Docs Sync

核心原则：**先核用户目标，再定版本与 CURRENT；缩小 active-memory surface，不删除历史证据。**

## 触发与执行边界

- 有代码、配置、需求决策、部署或任务状态变化的回合，在最终回复前主动同步，不等待用户提醒。普通问答且无状态变化时不重写文档。
- 长任务在明确决策、完成一段修改、遇到阻塞或完成部署后保存必要状态，不把所有交接留到对话结束。中断后下一轮先核实际 Git 差异和相关运行记录，补齐未写下的状态。
- 只更新变化的归属：当前任务/版本在 CURRENT handoff，短摘要在 progress，文件定位在 index，能力断点在原台账，长期决策按需进入 ADR/Memory。不逐回合复制全部表格或审查历史全文。
- 记录已实现、已部署、已观察与未确认的区别；未完成事项写出具体位置、影响、下一动作和未提交改动归属。同步完再回复实际完成情况，不把文档写入当作功能验证。
- 这是执行回合内的 Skill 指令，不是后台进程或关闭应用后的回调；中断时不能保证运行。不新增定时任务、自动提交/推送、自动部署或模型调用来伪装结束同步。

## 1. 启动时先定锚

从 project_index.md 指向的实际交付树运行 `node scripts/read-current-management-context.mjs`，同读 Git、Taskmaster 当前目标及 CURRENT 指针；需要完整验收条件时加 `--task <id>`。这是读取现有状态，不运行产品流程或自动判定完成；不要在根目录 dirty main 创建第二份任务状态。

在解释任务前运行：

```text
git worktree list --porcelain
git branch --sort=-committerdate
git status --short
```

然后按相关主题执行 `rg -n "CURRENT|<topic>" project_index.md docs/handoff docs/specs docs/plans`。先读 **one CURRENT handoff per topic**，再读需求基线相关章节和 `docs/progress.md` 当前窗口；`project_index.md` 只用 `rg` 定向读取，never default-read 全文。`DEPRECATED`、`NO-GO`、`HISTORICAL` 或被 CURRENT handoff 取代的文件不得成为实施入口；文件名日期不能覆盖正文状态。

决定下一动作及改写 CURRENT 前，将最新用户决定、需求基线的具体条款和上一轮未完成交付项对照。CURRENT 是执行状态记录，不能覆盖用户目标；局部修复、暂缓出图、工具安装或单次成功均不能取消其他交付项。只有用户明确改变范围才移除对应目标，并记录该决定；阶段性暂停须保留被暂停项与恢复条件。

若项目已有 `.taskmaster/state.json`，同时读取其 currentTag，将未完成任务 ID 与 CURRENT 交付表对齐。Taskmaster 保存稳定验收条件，CURRENT 独占资产、反馈、版本与下一动作；状态同步不复制叙述。要求用户认可的交付仅在用户明确认可后置 done，不能因调用/部署成功或本轮结束置 done；不用 parse/expand 或额外模型调用整理状态。

## 2. 同步合同

- `docs/progress.md`：是 CURRENT progress window，不是永久日志；最多 120 lines。只保留最近状态、当前版本、未完成项与最新证据，旧条目由 Git history 保存，必要时转入明确标记的 archive，且不得默认读取。
- `project_index.md`：登记路径/用途，当前状态链接唯一 handoff；历史交付版本须标明是当时记录，不再复制可漂移的当前 release。设计仍适用不等于当前已部署。
- CURRENT handoff：原地压缩到 80 行内，只保留 goal、branch / HEAD / release / rollback、done、constraints、open risks、next action、read-first。goal指向用户决定/需求条款；多项交付用一处短表保留已有任务/资产ID、用户反馈和剩余差额，next action必须推进未完成项或解除其具体阻塞，不得被最新返工覆盖。progress/index只引用该表，不另写动态下一步；不得成为聊天 transcript。
- `AGENTS.md`：只记录长期规则、命令和拓扑；重大不可逆决策进入 ADR。规则及 Skill 修改须进入实际交付分支；根目录 dirty main 的更新不会自动传到 worktree。
- Memory MCP 可用时只保存跨 session 的决策/纠错，不复制测试日志或 handoff。

version tuple `branch / HEAD / release / rollback` 只在 CURRENT handoff 定锚。handoff 或部署前读取 `git status --short`，核对本轮 diff；`git diff --check` 仅在当前规则允许检查时执行。其他工作树只留指向交付树的导航，不复制版本或 next action，也不覆盖无关改动。

## 3. 去重与清理

- 能力变化更新现有 `docs/runbooks/hermes-capability-registry.md` 当前行：产品目的、实现/调用方、安装与启用范围、最近真实结果和已知缺口。部署版本只在 CURRENT handoff 定锚，其他文档链接它；旧表格标历史，不能把 `PRODUCTION` 解释为当前质量合格。
- Skill是否安装、是否注入模型、是否有真实成功产物分别记录。检索仅加载匹配行与代码；无新证据就保留“未观察”，不靠扩大测试或新模型运行补齐状态。

- **Do not delete historical files**；通过降级状态、Git history/archive、移出 read-first 和压缩 CURRENT 文档清理活跃记忆。archive 不得成为启动入口。
- Do not copy full test matrices across progress/index/handoff。完整输出留在测试报告或日志；活文档只写命令、总数、关键指标和证据路径。
- 新决策与旧 CURRENT 冲突时，同一轮完成：更新 CURRENT → 降级旧入口 → 修索引 → 修 handoff → 加最新 progress。
- 旧 handoff/实施计划的目标、版本和待办是历史；保留正文证据并在入口明示，不按旧待办重新生成、迁移或部署。设计/ADR 的需求依据与历史执行状态分别标注，不把全部旧需求判为失效。
- 技术债写进现有能力台账的相关行或定向审查节：具体位置、触发条件、后果、处理/下一步。优先修当前改动依赖的重复或断点；小修不启动全仓重构或新增评分门禁。
- 不创建同主题第二份活文档，不向仓库外写项目 handoff，不记录 `.env`、Secret 或生产数据。
- `AGENTS.md` ≤100 lines、CURRENT handoff ≤80 lines、`docs/progress.md` ≤120 lines；超限必须先压缩/轮转再完成任务。

## 4. 完成门禁

以下命令仅在当前用户与项目规则允许检查时适用；明确禁止测试/预检时不运行（其中 `audit:docs-sync` 包含测试），只静态核对本次改动与既有证据。文档整理不触发部署或模型任务。

运行：

```text
npx pnpm@9.15.0 audit:docs-sync
npx pnpm@9.15.0 docs:lint
git diff --check
```

门禁验证结构与关键纪律；它不能判断文案真伪。若仍存在两个 CURRENT、版本未绑定、旧 next action 可被误执行、或 handoff 超过 80 行，任务不得标完成。
