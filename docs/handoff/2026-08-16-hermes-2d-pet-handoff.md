# Handoff — 2026-08-17 Hermes Workspace Companion

## Current truth

- 2026-08-18 用户公网复验确认：动画存在，但角色仍不够优雅/有生命感；全站阅读层级、字号、对比和控件默认样式有系统问题，guide bubble 会遮挡字段/diff。CURRENT next-design 是 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`，方向已确认，业务实现尚未开始。
- 当前唯一设计/执行入口是 `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` 与 `docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md`。旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。
- 产品形象与技术路线已经确定，当前处于实现/生产验收阶段，不得重新讨论路线。运行事实源是 `action-catalog.ts`、`behavior-director.ts`、`motion-mixer.ts`、`pet-motion.ts` 与 `HermesWorkspaceStage.tsx`。
- 2026-08-18 release `1b76b46` 已修复 Windows 系统设置隐藏 WebGL canvas 与移动端透明舞台遮挡表单：首次默认 full，常驻 full/reduced 控制；只有真实 rig/控制/bubble 命中鼠标，审批与主动 reduced 同帧静止。
- 真实静止根因已经闭合：Dashboard 曾把队列 `needs_review` 误当作审批 UI 已打开；旧空任务 mock 录屏未覆盖该分支。release `39c752b` 已部署并通过公网真实账号验收。禁止本机 Docker；后续视觉判断仍以 ECS 公网页面为准。

## Workspace Companion candidate

- 单一 Workspace stage/canvas owner；27-action 确定优先级、独立关节与 whole-character presentation layer；用户停靠优先于自动航行。
- 创建/编辑页有真实 Drawer 与语义锚点：title→source import、选中 SDF 字段→Explain/Draft/Check；建议只在显式 Apply 后改 SDF。
- `needs_review` 在 Dashboard 映射为 `suggesting`；真实六字段审批页只在服务端 state 为 `needs_review` 时注册 approval-still，确认或以 `confirmed/written` 重载后恢复 idle。
- 新 part-rig 从 bind UV 一次合成语义部件刚体位移并归一化重叠，不再重复拉伸整图；runtime 暴露 heartbeat、fallback reason，并对 context loss 仅自动恢复一次，随后由用户 retry。
- 未完成边界：高级 Quiet/Balanced/Active、sound/particle/proactive 设置 UI，以及两信号主动提示/cooldown 的完整矩阵。

## Version tuple

- Branch / application HEAD: `main` / `39c752b`
- Integrated source: `codex/hermes-2d-pet` / `b9db36e`
- ECS release / rollback: `39c752b` / `1b76b46`
- PR: `https://github.com/photonics-dhl/OpenScience/pull/3`

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；部署不迁移、不 seed。
- 真实论文链的 per-field accept/edit/reject、完整 six-field gold rubric 与独立 persisted-audit 查询仍未完成，不得写成 Hermes 全面完成。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC；本轮前端/docs 更新不得改变该边界。
- 本地 `main` 有用户自有未跟踪设计资产；合并不得删除、移动或提交它们。

## Next action

1. 用户复核 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`；确认后写单一实施计划。
2. 实施必须同时修复阅读 token/控件基线、Hermes 避让与真实 blank RO per-field diff 引导；不得只增加动作数量。
3. 最终只接受 ECS 公网真实账号的 blank→六字段→accept/edit/reject→save/refresh/commit 连续证据，不以 mock 录屏替代。

Read first：`AGENTS.md` → 本 handoff → `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` → 需求基线 UI/Hermes 段 → 短版 `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
