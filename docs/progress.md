# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-19 — 可读工作台 / Hermes blank-RO release candidate

- **当前目标**：交付 B「平衡学者工作台」，并让 Hermes 在真实 blank RO 流程中解释字段、生成 evidence-bounded diff、披露缺失证据；最终标准是 ECS 公网真实账号验收。
- **应用候选**：在 `6638aa8` 基础上的未提交工作树已补齐 evidence UI、durable metadata checkpoint、稳定幂等键、一次安全 retry、串行 polling、审批静止与 collision fallback；migration 27 只增加 `agent_tasks.retry_count`。
- **发布候选**：完整 `git archive` 进入 write-once `/opt/openscience-releases/<sha>`；API/Web/Worker 非 root 且只读挂载，Web runtime cache 独立 tmpfs；Worker/Parser 使用 SHA 镜像标签。首次切换保存实际运行容器 image ID 并使用显式 Compose 适配器，后续回滚使用上一 release 自己的 Compose；失败恢复撤销不可信 marker，并阻断后续部署直至显式恢复。备份脚本只在公网验收后替换。
- **当前证据**：全仓 test GREEN（Web `332/332`、Domain `342/342`、Worker `51/51`、API `66/66` 等）；发布/Nginx `22/22`、typecheck、canonical lint/docs-sync、17 页 build、product release `27/27`、readability `18/18`、blank-flow/field-guide `9/9` 与 155.4 秒 Hermes aggregate GREEN。两轮最终 release/security review 均 `APPROVE`（C/I/M = 0）。
- **下一步**：提交/push reviewed candidate；随后只读 ECS checkup 和带明确 `--rollback-ref` 的 dry-run。没有新的云写确认不得 backup/deploy。

## Stable production boundary

- ECS `39c752b` 已修复真实 Dashboard `needs_review` 误静止，并保持语义 part-rig、heartbeat、单次 context-loss 自动恢复与有界手动 retry；本分支尚未部署。
- Hermes 是常驻 Workspace 引导员和 Agent 入口；审批态与用户主动 reduced 必须静止，建议只有显式 Apply 才可写入。
- 文档只保留 bounded CURRENT window：progress ≤120 行、handoff ≤80 行；旧证据只从 Git history 或显式 archive 查阅。
- 旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO，不得恢复为实施入口。

## Version tuple

- Branch / base HEAD: `codex/readable-hermes-guidance` / `6638aa8`
- Local candidate: dirty/uncommitted（不得作为 release ref）
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none（PR 3 仅为旧 Hermes 集成历史）

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`
4. `docs/OpenScience_Kimi_Development_Spec.md`（只读 UI / Hermes / 权限相关段落）
5. `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`
6. 本文件
