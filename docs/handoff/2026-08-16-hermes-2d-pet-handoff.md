# Handoff — 2026-08-17 Hermes Workspace Companion

## Current truth

- 当前唯一设计/执行入口是 `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` 与 `docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md`。旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。
- 产品形象与技术路线已经确定，当前处于实现/生产验收阶段，不得重新讨论路线。运行事实源是 `action-catalog.ts`、`behavior-director.ts`、`motion-mixer.ts`、`pet-motion.ts` 与 `HermesWorkspaceStage.tsx`。
- 2026-08-18 release `1b76b46` 已修复 Windows 系统设置隐藏 WebGL canvas 与移动端透明舞台遮挡表单：首次默认 full，常驻 full/reduced 控制；只有真实 rig/控制/bubble 命中鼠标，审批与主动 reduced 同帧静止。
- PR、local-main merge、docs-sync 优化和 ECS 发布均已完成。禁止本机 Docker；生产事实只认 ECS 与公网验收。

## Workspace Companion candidate

- 单一 Workspace stage/canvas owner；27-action 确定优先级、独立关节与 whole-character presentation layer；用户停靠优先于自动航行。
- 创建/编辑页有真实 Drawer 与语义锚点：title→source import、选中 SDF 字段→Explain/Draft/Check；建议只在显式 Apply 后改 SDF。
- 合并/生产证据：Web `295/295`、产品 `27/27`、Hermes 聚合 `144.9s`、17-page build 与 PR CI GREEN；公网移动端 proposal-ready `1/1`，源码哈希和 ECS checkup 通过。完整指标见 `docs/progress.md` 最新条目。
- 未完成边界：高级 Quiet/Balanced/Active、sound/particle/proactive 设置 UI，以及两信号主动提示/cooldown 的完整矩阵。

## Version tuple

- Branch: `codex/hermes-2d-pet`
- Remote branch runtime/test HEAD: `fdba093` (Hermes hit-area fix + deterministic Parser/breathing/pointer gates); branch docs commit `c175d50` precedes this final test head
- Local `main` integrated test HEAD: `272b613`; application release ref remains `1b76b46`, and succeeding docs-only commits are not deployed application refs
- ECS release / rollback: `1b76b46` / `017bf1e`
- PR: `https://github.com/photonics-dhl/OpenScience/pull/3`

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；部署不迁移、不 seed。
- 真实论文链的 per-field accept/edit/reject、完整 six-field gold rubric 与独立 persisted-audit 查询仍未完成，不得写成 Hermes 全面完成。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC；本轮前端/docs 更新不得改变该边界。
- 本地 `main` 有用户自有未跟踪设计资产；合并不得删除、移动或提交它们。

## Next action

1. 产品负责人用真实账号复验无 query 默认 full、常驻 full/reduced 切换、跨路由持久化、透明区表单穿透、创建 title→source-import 与编辑字段引导。
2. 高级 Quiet/Balanced/Active、sound/particle/proactive 设置 UI 与两信号主动提示/cooldown 仍是后续范围，不得写成已完成。
3. 若远端 PR 合并或 `main` 推送，先核对 GitHub CI 与 version tuple；不得把 post-deploy docs commit 冒充已部署应用 release。

Read first：`AGENTS.md` → 本 handoff → CURRENT spec/plan → `docs/progress.md` first 80 lines → `project_index.md` 相关 CURRENT 行。
