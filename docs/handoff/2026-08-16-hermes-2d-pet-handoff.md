# Handoff — 2026-08-17 Hermes Workspace Companion

## Current truth

- 当前唯一设计/执行入口是 `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` 与 `docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md`。旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。
- 产品形象与技术路线已经确定，当前处于实现/生产验收阶段，不得重新讨论路线。运行事实源是 `action-catalog.ts`、`behavior-director.ts`、`motion-mixer.ts`、`pet-motion.ts` 与 `HermesWorkspaceStage.tsx`。
- 2026-08-18 候选已修复 Windows 系统设置隐藏 WebGL canvas 的根因：首次默认 full，常驻 full/reduced 控制，偏好跨路由/刷新保存；审批与主动 reduced 同帧静止。
- 用户已授权：更新 PR、合并本地 `main`、优化 docs-sync，并部署 ECS。禁止本机 Docker；生产事实只认 ECS 与公网验收。

## Workspace Companion candidate

- 单一 Workspace stage/canvas owner；27-action 确定优先级、独立关节与 whole-character presentation layer；用户停靠优先于自动航行。
- 创建/编辑页有真实 Drawer 与语义锚点：title→source import、选中 SDF 字段→Explain/Draft/Check；建议只在显式 Apply 后改 SDF。
- 本地候选证据：motion `16/16`、自包含单 worker 浏览器 `18/18`、Web `295/295`、17-page build、聚合 release `144.7s` exit 0；完整指标见 `docs/progress.md` 最新条目。
- 未完成边界：高级 Quiet/Balanced/Active、sound/particle/proactive 设置 UI，以及两信号主动提示/cooldown 的完整矩阵。

## Version tuple

- Branch: `codex/hermes-2d-pet`
- Feature commit: `ee514aa`; current branch HEAD is the succeeding docs-sync commit (`git rev-parse HEAD` is authoritative)
- Remote branch before push: `0398838`
- ECS release / rollback: `aa1c8af` / `c9df24d`
- PR: `https://github.com/photonics-dhl/OpenScience/pull/3`

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；部署不迁移、不 seed。
- 真实论文链的 per-field accept/edit/reject、完整 six-field gold rubric 与独立 persisted-audit 查询仍未完成，不得写成 Hermes 全面完成。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC；本轮前端/docs 更新不得改变该边界。
- 本地 `main` 有用户自有未跟踪设计资产；合并不得删除、移动或提交它们。

## Next action

1. 完成 docs-sync 门禁与文档压缩，提交并推送 `codex/hermes-2d-pet`，更新 PR #3。
2. 合并到本地 `main`，保护用户未跟踪资产；验证合并结果。
3. 按 `docs/runbooks/deployment.md` 执行 checkup、DB backup、dry-run、`--confirm --skip-migrate`，再验证容器、版本哈希与公网行为。

Read first：`AGENTS.md` → 本 handoff → CURRENT spec/plan → `docs/progress.md` first 80 lines → `project_index.md` 相关 CURRENT 行。
