# Handoff — 2026-08-17 Hermes Workspace Companion

## Current truth

- 当前唯一设计/执行入口是 `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` 与 `docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md`。旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。
- 产品形象与技术路线已经确定，当前处于实现/生产验收阶段，不得重新讨论路线。运行事实源是 `action-catalog.ts`、`behavior-director.ts`、`motion-mixer.ts`、`pet-motion.ts` 与 `HermesWorkspaceStage.tsx`。
- 2026-08-18 release `1b76b46` 已修复 Windows 系统设置隐藏 WebGL canvas 与移动端透明舞台遮挡表单：首次默认 full，常驻 full/reduced 控制；只有真实 rig/控制/bubble 命中鼠标，审批与主动 reduced 同帧静止。
- PR、local-main merge 和 ECS 发布均已完成，但用户真实账号仍看到静态图片，视觉/runtime 验收重开为 NOT ACCEPTED。禁止本机 Docker；生产事实只认 ECS 与同条件公网验收。

## Workspace Companion candidate

- 单一 Workspace stage/canvas owner；27-action 确定优先级、独立关节与 whole-character presentation layer；用户停靠优先于自动航行。
- 创建/编辑页有真实 Drawer 与语义锚点：title→source import、选中 SDF 字段→Explain/Draft/Check；建议只在显式 Apply 后改 SDF。
- 旧合并/生产门禁仍是工程历史证据，不再代表用户可见完成：动效 gate 使用 mock API + 全新 browser context；renderer 失败又会静默退回 PNG。当前必须验证真实会话的 preference、WebGL capability、renderer status、draw activity 与 fallback reason。
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

1. 先在真实页面暴露 `preference / WebGL capability / renderer status / draw activity / fallback reason`，复现用户同条件静止链；禁止继续用 mock 录屏替代。
2. 根因确认后以真实账号同浏览器完成 RED→GREEN：可见待机、指针互动、语义航行、Drawer 唤起与字段引导；用户视觉验收前不得写完成。
3. 高级 Quiet/Balanced/Active、sound/particle/proactive 设置 UI 与两信号主动提示/cooldown 仍是后续范围。

Read first：`AGENTS.md` → 本 handoff → 需求基线 Hermes 相关段 → CURRENT spec/plan 的 summary/acceptance → 短版 `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
