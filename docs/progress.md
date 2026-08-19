# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-19 — Readable Workspace / Hermes blank-RO production release

- **已交付**：B「平衡学者工作台」、浏览器无关可读控件、Hermes 字段引导与 evidence-bounded diff 已部署 ECS。用户可从空白私有 RO 开始，逐字段接受、编辑后接受、拒绝或保留 unresolved，再保存、刷新和提交 immutable version。
- **生产版本**：应用 release `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`，rollback `8ecf96c193e0010329cdf3330819063d1ad7958d`；27/27 migrations current，公网 `/` 与 `/__release` 为 200/精确 SHA，release-failed 不存在，服务健康。
- **真实验收**：公网、真实管理员、真实 MiniMax、零网络拦截。保留私有证据 RO `ad35cac3-cbd9-4a2a-9a00-9762fcc15e91`；1 task，Hermes `idle/travel/working/review`，5 个有原文 locator 的建议，`results` 明确缺失，unsupported claim 0；edit-accept / accept / reject / save / reload / commit 全链通过，version 2。
- **现场修复**：首次真实 gate 在 `PUT /sdf` 返回 400，定位为草稿误用六字段非空发布校验。TDD 新增 draft-core 合同：六字段结构/schemaVersion 必须完整，但 draft 可保留明确 unresolved 的空字段；非 draft 继续使用原非空校验。修复 commit `06072c1`。
- **工程证据**：SDF `16/16`、Domain `343/343`、API `66/66`、全仓 typecheck/build/lint/docs-sync GREEN；17 页 production build。最新 DB backup 433,513 bytes、7 轮。ignored 证据位于 `apps/web/test/visual/out/hermes-blank-ro/`。
- **下一步**：用户在公网按自己的账号做最终审美/操作体验复验；若无新问题，本主题关闭并转入个人 Workspace/RO 内容工作流的下一任务。

## Stable boundaries

- Hermes 是常驻 Workspace 引导员和 Agent 入口；审批态与用户主动 reduced 必须静止，建议只有显式 Apply 才可写入。
- 草稿可保存 evidence-missing 空字段；非草稿完整性、权限、AI Credit、幂等、乐观锁、审计与 commit/version 边界不变。
- 文档只保留 bounded CURRENT window：progress ≤120 行、handoff ≤80 行；旧证据只从 Git history 或显式 archive 查阅。
- 旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO，不得恢复为实施入口。

## Version tuple

- Branch / implementation HEAD: `codex/readable-hermes-guidance` / `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`
- Remote candidate: `origin/codex/readable-hermes-guidance`（release record commit 位于该 implementation 之后）
- Local main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05`
- ECS release / rollback: `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8` / `8ecf96c193e0010329cdf3330819063d1ad7958d`
- Current branch PR: none

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`
4. `docs/OpenScience_Kimi_Development_Spec.md`（只读 UI / Hermes / 权限相关段落）
5. 本文件
