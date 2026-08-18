# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-19 — 可读工作台与 Hermes 引导实施中

- **当前目标**：落实已确认的 B「平衡学者工作台」，并让 Hermes 在真实 blank RO 流程中安全游动、解释字段、生成可审阅 diff、披露缺失证据，最终以 ECS 公网真实账号验收。
- **Tasks 1–3 已完成**：`ec553f8` 建立 14–17 px 语义阅读角色与浏览器无关控件；`3cb00c1` 将阅读层级应用到代表页面；`7878cc5` 将 actor+bubble 完整 footprint、动态字段/diff 障碍和安全 edge-stop 纳入路径，移动端无安全位置时暂退并在安全后恢复。
- **Task 3 当前证据**：travel-path Vitest `10/10`、field-guide Playwright `4/4`、真实 guidance geometry gate、1440/390/320 workspace shots、Web typecheck 与 diff-check 均 GREEN。一次老化 dev server 导航超时已由全新 3201 复跑排除，未冒充产品断言失败。
- **下一步**：Task 4——编辑后接受建议、只写入显式接受文本，并直接消费 `needsMoreInformation` 显示无证据字段；禁止合成结果句或静默写入。
- **最终验收边界**：完成 Tasks 4–6 后，以公网真实管理员从 blank RO 输入受控研究构想，验证 evidence / missing disclosure、accept / edit-accept / reject、保存、刷新和 commit。本地仅预检，部署仍需最终云写确认。

## Stable production boundary

- ECS `39c752b` 已修复真实 Dashboard `needs_review` 误静止，并保持语义 part-rig、heartbeat、单次 context-loss 自动恢复与有界手动 retry；本分支尚未部署。
- Hermes 是常驻 Workspace 引导员和 Agent 入口；审批态与用户主动 reduced 必须静止，建议只有显式 Apply 才可写入。
- 文档只保留 bounded CURRENT window：progress ≤120 行、handoff ≤80 行；旧证据只从 Git history 或显式 archive 查阅。
- 旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO，不得恢复为实施入口。

## Version tuple

- Branch / application HEAD: `codex/readable-hermes-guidance` / `7878cc5`
- Local main: `c60ffdd`
- ECS release / rollback: `39c752b` / `1b76b46`
- Current branch PR: none（PR 3 仅为旧 Hermes 集成历史）

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/OpenScience_Kimi_Development_Spec.md`（只读 Hermes / 权限相关段落）
4. `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`
5. 本文件
