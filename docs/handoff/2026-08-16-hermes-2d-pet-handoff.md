# Handoff — Readable Workspace and Hermes Guidance

## Current truth

- 当前唯一实施入口是 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` 与 `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`。路线已确认，直接按 TDD 实施，不再重开形象或 renderer 选型。
- Tasks 1–5 已完成：阅读/控件 `ec553f8`；代表页面 `3cb00c1`；完整 footprint/移动 retreat `7878cc5`；1px 动态路径余量 `63a6eb9`；edit-before-accept 与 missing disclosure `44b61b0`；语义关节动作 `757de5b`。
- Task 5 已移除 observe/evidence/page/stretch/doze/wake/surprise/citation/pointer 的 enclosing-image CSS 动画；evidence/read/compare/write/issue/arrival/success 改由真实 head/forepaws/tail/crown/evidence nodes 表达。只有 patrol 保留整体巡游。
- 最新证据：focused `16/16`、Dashboard E2E `14/14`、90 秒 companion 与 articulation real-pixel gates、production build/typecheck/diff-check GREEN；performance first-ready `958ms`、idle/pointer p95 `18ms`、0 drop（SwiftShader）。
- 当前 next action 是 Task 6：建立 ECS-only blank-RO 真实 production gate；不得把本地 mock 当作最终证据。
- 2026-08-17 motion spec/plan 只保留已实现 renderer/行为合同；旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。

## Version tuple

- Branch / application HEAD: `codex/readable-hermes-guidance` / `757de5b`
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；不使用本机 Docker，不删除用户文件。
- 本地证据不能替代 ECS 公网验收；部署前必须再次核对 branch/HEAD/release/rollback 并取得云写确认。
- 真实 blank RO 的 per-field accept/edit/reject、六字段 gold rubric、保存/刷新/commit 尚未完成，不得写成 Hermes 全面完成。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC；本轮前端/docs 更新不得改变该边界。

## Next action

1. 执行 Task 6 RED：先写 blank-RO production contract；不得通过网络拦截伪造 ECS GREEN。
2. 本地只验证 gate 语法、mocked accept/edit/reject/missing/save/reload/commit 流程与唯一 task ID。
3. 完成 Task 6 后进入 Task 7 全量审查与云写检查点；未获得最终确认不得部署。

Read first：`AGENTS.md` → 本 handoff → `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` → 需求基线 UI/Hermes 段 → 短版 `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
