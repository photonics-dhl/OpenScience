---
name: docs-sync
description: Use when project files or task status change, before handoff/compaction/deployment, or when stale docs, old memory, conflicting CURRENT claims, version drift, or bloated context could misroute the next session.
---

# Docs Sync

核心原则：**先定版本，再定 CURRENT；缩小 active-memory surface，不删除历史证据。**

## 1. 启动时先定锚

在解释任务前运行：

```text
git worktree list --porcelain
git branch --sort=-committerdate
git status --short
```

然后按相关主题执行 `rg -n "CURRENT|<topic>" project_index.md docs/handoff docs/specs docs/plans`。读取需求基线的相关章节、`docs/progress.md` first 80 lines、相关索引行和 **one CURRENT handoff per topic**。`DEPRECATED`、`NO-GO`、`HISTORICAL` 或被 CURRENT handoff 取代的文件不得成为实施入口；文件名日期不能覆盖正文状态。

## 2. 同步合同

- `docs/progress.md`：只追加 latest entry，3–5 bullets，写本轮 delta、证据和下一步；历史条目不改写。
- `project_index.md`：登记路径，并把状态绑定到具体版本；同主题旧入口标 `DEPRECATED/HISTORICAL → CURRENT path`。
- CURRENT handoff：原地压缩到 80 行内，只保留 goal、branch / HEAD / release / rollback、done、constraints、open risks、next action、read-first；不得成为聊天 transcript。
- `AGENTS.md`：只记录长期规则、命令和拓扑；重大不可逆决策进入 ADR。
- Memory MCP 可用时只保存跨 session 的决策/纠错，不复制测试日志或 handoff。

必须写清 version tuple：`branch / HEAD / release / rollback`。handoff 或部署前再次运行 `git status --short` 与 `git diff --check`，区分本地候选、远端分支、本地 main 和 ECS 生产版本。

## 3. 去重与清理

- **Do not delete historical files**；通过降级状态、移出 read-first 和压缩 CURRENT 文档清理活跃记忆。
- Do not copy full test matrices across progress/index/handoff。完整输出留在测试报告或日志；活文档只写命令、总数、关键指标和证据路径。
- 新决策与旧 CURRENT 冲突时，同一轮完成：更新 CURRENT → 降级旧入口 → 修索引 → 修 handoff → 加最新 progress。
- 不创建同主题第二份活文档，不向仓库外写项目 handoff，不记录 `.env`、Secret 或生产数据。

## 4. 完成门禁

运行：

```text
npx pnpm@9.15.0 audit:docs-sync
npx pnpm@9.15.0 docs:lint
git diff --check
```

门禁验证结构与关键纪律；它不能判断文案真伪。若仍存在两个 CURRENT、版本未绑定、旧 next action 可被误执行、或 handoff 超过 80 行，任务不得标完成。
