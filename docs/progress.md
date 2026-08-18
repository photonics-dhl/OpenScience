# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-19 — 可读工作台与 Hermes 引导实施中

- **当前目标**：落实已确认的 B「平衡学者工作台」，并让 Hermes 在真实 blank RO 流程中安全游动、解释字段、生成可审阅 diff、披露缺失证据，最终以 ECS 公网真实账号验收。
- **Tasks 1–4 已完成**：`ec553f8` 建立阅读/控件基线；`3cb00c1` 应用代表页面层级；`7878cc5` 落实完整 footprint/动态障碍/移动 retreat；`44b61b0` 支持 edit-before-accept、dismiss 与 missing acknowledgement 的确定推进，并直接消费 `needsMoreInformation`，不合成结果。
- **路径复核**：`63a6eb9` 让门禁先观察 travel-hidden→arrival，修复旧气泡首帧竞态，并为动态 footprint 留 1px 物理余量；真实 geometry gate 无字段相交。
- **当前证据**：focused Vitest `30/30`、Hermes draft/field-guide Playwright `5/5`、可读性 `18` 路由/视图、真实 geometry gate、1440/390/320 shots、Web typecheck 与 diff-check GREEN。dismiss 与 missing-ack 均用 real-browser mutation 证明门禁可失败。
- **下一步**：Task 5——在不增加新 renderer owner 的前提下，把字段语义映射到可辨认的阅读/证据/不确定性/成功动作，并验证真实角色像素差异；审批与 reduced 仍静止。
- **最终验收边界**：完成 Tasks 4–6 后，以公网真实管理员从 blank RO 输入受控研究构想，验证 evidence / missing disclosure、accept / edit-accept / reject、保存、刷新和 commit。本地仅预检，部署仍需最终云写确认。

## Stable production boundary

- ECS `39c752b` 已修复真实 Dashboard `needs_review` 误静止，并保持语义 part-rig、heartbeat、单次 context-loss 自动恢复与有界手动 retry；本分支尚未部署。
- Hermes 是常驻 Workspace 引导员和 Agent 入口；审批态与用户主动 reduced 必须静止，建议只有显式 Apply 才可写入。
- 文档只保留 bounded CURRENT window：progress ≤120 行、handoff ≤80 行；旧证据只从 Git history 或显式 archive 查阅。
- 旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO，不得恢复为实施入口。

## Version tuple

- Branch / application HEAD: `codex/readable-hermes-guidance` / `44b61b0`
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none（PR 3 仅为旧 Hermes 集成历史）

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/OpenScience_Kimi_Development_Spec.md`（只读 Hermes / 权限相关段落）
4. `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`
5. 本文件
