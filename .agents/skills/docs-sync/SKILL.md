---
name: docs-sync
description: Use when creating/modifying project files, changing task status, switching agents/sessions, or before claiming work is complete, to keep progress/project_index/AGENTS/handoff aligned without duplicating source of truth.
---

# Docs Sync — 开发文档同步纪律

核心原则：**事实源唯一，同步动作小而固定**。不复制大段聊天历史；每个文档只回答一个问题。

## 事实源顺序

1. `AGENTS.md`：规则与命令入口。
2. `docs/OpenScience_Kimi_Development_Spec.md`：需求基线。
3. `docs/decisions/`：架构/工具决策。
4. `project_index.md`：文件地图与状态。
5. `docs/progress.md`：时间序进度与坑。
6. task-master：当前任务与依赖。
7. Memory MCP：跨 session 决策/纠正/坑。

## 何时必须同步

- 例行同步由 agent 主动完成，不需要用户逐次提醒：创建/修改/移动文件后更新 `project_index.md`；任务状态变化后更新 task-master；完成/阻塞/用户确认后写 `docs/progress.md` 置顶条目。
- 规则、命令、目录结构、工具能力变化后：更新 `AGENTS.md`；重大变化补 ADR。
- 正式 handoff：长 session、上下文压缩、换 agent/电脑、阶段边界，或用户明确要求时主动写；必须存入项目 `docs/handoff/YYYY-MM-DD-<topic>-handoff.md`，不得写到 C:/tmp 等仓库外位置。
- 发现旧文档与新决策冲突：先标冲突并修活文档；历史 progress 不改写，用新条目说明取代关系。

## Handoff 最小模板

```markdown
# Handoff — YYYY-MM-DD <topic>
- Current goal: <one sentence>
- Done: <3-6 bullets with evidence paths/commands>
- Constraints: <no commit/no .env/MiniMax-M3/ADR ids>
- Open risks: <blockers, secrets, dirty git, deferred tests>
- Next action: <single next task id + first step>
- Read first: AGENTS.md → Spec → ADR-001/002 → progress.md → project_index.md → task-master → Memory
```

## 不做的事

- 不手写维护 `CLAUDE.md`/Cursor 规则；`AGENTS.md` 是 canonical。确需多工具规则时用 rulesync 生成，先写 ADR。
- 不把 `.env`、真实 key、生产数据写进任何文档/Memory/handoff。
- 不把项目 handoff/规则/索引/进度写到仓库外（C:/tmp、系统临时目录、用户全局 skills）；跨电脑迁移以 git 仓库内容为准。
- 不创建同主题第二份活文档；迭代原地更新，取代时标 `DEPRECATED → 见 <新路径>`。
- 不把“记得更新文档”当唯一防线；可脚本化的检查进 `scripts/docs/check-docs-sync.mjs` 与 CI。

## 自动化边界

当前为半自动：同步动作由 agent 按本清单执行；`check-docs-sync.mjs` 与 CI gate 在 Phase 1A 后补。脚本只能验证存在性/一致性/泄露样式，不能替代人工判断该写什么。

## Red Flags

- 新建文件后没登记 `project_index.md`
- 任务 done 但 `progress.md` 没有证据命令/路径
- handoff 变成聊天 transcript
- `AGENTS.md` 与实际命令不一致
- 出现 GLM/旧模型路由残留或密钥样式字符串
