# Handoff — Readable Workspace and Hermes Guidance

## Current truth

- 唯一实施入口是 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` 与同主题 plan；路线已确认，直接按 TDD 实施，不重开形象或 renderer 选型。
- Tasks 1–6 历史提交已经完成；当前未提交候选基于 `6638aa8`，进一步补齐 evidence UI、durable checkpoint、幂等恢复、一次安全 retry、真实可读性/blank-RO 门禁与 migration 27。
- Task 5 已移除 enclosing-image CSS 动画；evidence/read/compare/write/issue/arrival/success 由真实 head/forepaws/tail/crown/evidence nodes 表达，只有 patrol 保留整体巡游。
- 发布边界已改为 write-once Git SHA 目录、SHA-tagged Worker/Parser image、非 root 只读应用挂载、显式 rollback ref 与 fail-closed marker；首次切换保存真实运行 image ID 并使用显式 Compose 适配器，后续回滚使用上一 release 自己的 Compose；degraded marker/无 identity 的版本化挂载会阻断再次部署。
- 当前证据：全仓 test GREEN；发布/Nginx `22/22`、typecheck、canonical lint/docs-sync、17 页 build、product release `27/27`、readability `18/18`、blank-flow/field-guide `9/9` 与 155.4 秒 Hermes aggregate GREEN；最终 release/security review 均 `APPROVE`（C/I/M = 0）。
- 当前 next action 是 Task 7：完成剩余门禁/复审，commit/push，再只读 ECS checkup 与 deployment dry-run；无新的云写确认不得部署。
- 旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。

## Version tuple

- Branch / base HEAD: `codex/readable-hermes-guidance` / `6638aa8`
- Local candidate: dirty/uncommitted（不可部署）
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；不使用本机 Docker，不删除用户文件。
- 本地证据不能替代 ECS 公网验收；部署前必须核对 branch/HEAD/release/rollback 并取得新的云写确认。
- 本地 per-field accept/edit/reject、missing results、保存/刷新/commit 已有门禁；真实 ECS MiniMax、真实账户与公网动作状态仍未运行，不得写成全面完成。
- migration 27 为 additive retry metadata；应用自动回滚不撤销数据库迁移，部署前必须确认前后版本兼容。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC。

## Next action

1. 完成 Task 7 剩余本地门禁与独立审查，修复全部 Critical/Important。
2. commit/push reviewed candidate，运行只读 ECS checkup 与带 `--rollback-ref` 的 dry-run，核对版本元组。
3. 未获得最终云写确认则停止；确认后才 backup/deploy，并运行无网络拦截的 blank-RO production gate 与用户视觉验收。

Read first：`AGENTS.md` → 本 handoff → CURRENT design → 需求基线 UI/Hermes 段 → `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
