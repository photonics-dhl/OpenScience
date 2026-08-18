# Handoff — Readable Workspace and Hermes Guidance

## Current truth

- 当前唯一实施入口是 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` 与 `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`。路线已确认，直接按 TDD 实施，不再重开形象或 renderer 选型。
- Tasks 1–3 已完成：语义阅读/控件基线 `ec553f8`；代表页面阅读层级 `3cb00c1`；完整 Hermes footprint、动态障碍、安全航线与移动端 retreat `7878cc5`。
- Task 3 最新证据：travel-path `10/10`、field-guide `4/4`、真实 geometry gate、1440/390/320 workspace shots、Web typecheck 与 diff-check GREEN。老化 3201 dev server 曾在导航阶段超时；全新日志隔离服务复跑全部通过。
- 当前 next action 是 Task 4：支持 edit-before-accept，消费现有 `needsMoreInformation`，把缺失结果作为不写入的证据警告；仅显式接受的文本可更新 SDF。
- 2026-08-17 motion spec/plan 只保留已实现 renderer/行为合同；旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。

## Version tuple

- Branch / application HEAD: `codex/readable-hermes-guidance` / `7878cc5`
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none

## Constraints and open risks

- 不读取/记录 `.env`、Secret 或真实用户内容；不使用本机 Docker，不删除用户文件。
- 本地证据不能替代 ECS 公网验收；部署前必须再次核对 branch/HEAD/release/rollback 并取得云写确认。
- 真实 blank RO 的 per-field accept/edit/reject、六字段 gold rubric、保存/刷新/commit 尚未完成，不得写成 Hermes 全面完成。
- ECS Parser 必须保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC；本轮前端/docs 更新不得改变该边界。

## Next action

1. 执行 Task 4 RED：reducer `revise`、浏览器 edit-apply、results missing disclosure。
2. 最小实现 Suggestion transition；missing fields 与 suggestions 分离，绝不合成研究结果。
3. focused tests/typecheck/diff-check 后提交并同步 CURRENT docs，再进入 Task 5。

Read first：`AGENTS.md` → 本 handoff → `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` → 需求基线 UI/Hermes 段 → 短版 `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
