# Handoff — Readable Workspace and Hermes Guidance

## Current truth

- 当前唯一实施入口是 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` 与 `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`。路线已确认，直接按 TDD 实施，不再重开形象或 renderer 选型。
- Tasks 1–4 已完成：阅读/控件 `ec553f8`；代表页面 `3cb00c1`；完整 footprint/移动 retreat `7878cc5`；1px 动态路径余量 `63a6eb9`；edit-before-accept 与 missing disclosure `44b61b0`。
- 最新证据：focused `30/30`、Hermes draft/field-guide `5/5`、可读性 `18` 路由/视图、真实 geometry gate、1440/390/320 shots、typecheck/diff-check GREEN；results 无证据时保持空白。
- 当前 next action 是 Task 5：把字段/证据/不确定性/成功语义映射到更清晰的现有 mesh 动作与真实像素门禁，不新增 renderer owner。
- 2026-08-17 motion spec/plan 只保留已实现 renderer/行为合同；旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。

## Version tuple

- Branch / application HEAD: `codex/readable-hermes-guidance` / `44b61b0`
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；不使用本机 Docker，不删除用户文件。
- 本地证据不能替代 ECS 公网验收；部署前必须再次核对 branch/HEAD/release/rollback 并取得云写确认。
- 真实 blank RO 的 per-field accept/edit/reject、六字段 gold rubric、保存/刷新/commit 尚未完成，不得写成 Hermes 全面完成。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC；本轮前端/docs 更新不得改变该边界。

## Next action

1. 执行 Task 5 RED：字段语义→动作映射、固定时钟真实角色像素区域差异、approval/reduced 静止。
2. 只扩展现有 action catalog/director/part-rig 通道，不增加 canvas/context/texture owner。
3. focused tests、motion pixel gate、typecheck/diff-check 后提交并同步 CURRENT docs，再进入 Task 6 公网真实链。

Read first：`AGENTS.md` → 本 handoff → `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` → 需求基线 UI/Hermes 段 → 短版 `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
