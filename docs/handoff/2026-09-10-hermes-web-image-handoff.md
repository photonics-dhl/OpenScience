# Hermes / 论文视觉叙事 CURRENT
> 交付基线是 `.worktrees/onchip-video-release` / `release/onchip-production-line`；root `main` 仅导航。本页是三线唯一活跃状态，历史细节留在 Git。

## 目标与边界
- 依据开发规格：真实 NousResearch Hermes 先理解全文、提炼 Claims/Evidence，再规划视觉叙事并交 Synclip；论文是事实来源，不以 Codex 手稿代替科学能力。
- 目标仍是 2–3 篇真实论文的凝练、用户确认、配图与公开展示；三篇整体验收、普通用户旅程、完整视频、整站审美尚未完成。
- 用户已要求继续有价值的并行开发；idle 不等于完成，但不得用无关检查填充。保留 PDF/SourceMap、认可图片、公开标识、sealed 记录、原失败/费用/receipt/oncekey；未知 paid/started CP 不重放，不因容量或 idle 扩预算、安装、重启或切换主 Gateway/Native M3。
- 生图真实图片质量仍需来源明确的实际 PNG 与科学审阅；本轮私有任务失败/容量阻塞不等于后端代码完成。视频真实试听/完整影片与声音选择仍未验收。UI 单项代码合并不等于整站审美完成。

## 总控与并行分工
- 总控 `01a1197c-7a1e-7631-b1c1-2d09b587be9a` 负责集成、CI、CURRENT/progress/index 与串行发布；openscience ACTIVE。
| Session / ID | 当前责任、状态与下一动作 | 工作树 / branch |
|---|---|---|
| 生图 / `01a0e831-be19-7813-8379-58313178ff26` | `8f817cbc+b0d7f82e+2e9fa92a+0ee68fe5+55f3c9cd` 及后续 adapter/worker、floor、reader 切片均已独立 High GO 并合入；admission 191/195（4 skip）、Worker typecheck/diff-check 通过，journal 缺 RO/version 身份 fail-closed。唯一 Hermes 提交已完成并产出私有 art-only 草稿 `writing-draft-4237cbcf-8371-4222-bc53-4f6eb45b2111`（仍部分待核对）；逐场景入口 `b06a8fab` 已合入但线上尚未部署。首图最小 brief/普通 writer beta gate `2ae3133d` 定向验证触发独立 High **P1 NO-GO**；修复提交 `ad812d38` 已完成 Domain 115/115、API 140/140、build/typecheck/diff-check，独立 High 待回。Synclip=0、无 receipt/oncekey/PNG/SHA/质量。用户已决定：2.5 明确不可用时自动改用 image-2 并告知；超时/网络/未知状态先恢复原任务，不直接二次提交。 | `C:\...\illustration-chain-repair\XGS` |
| 视频 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | native-only/fixture 交付已完成并按序合入；browser-entry/native-video-planning 通过。夹具修复 `af42e5e2` 经独立 High GO 后已合入 canonical 为 `2e1a28de`；精确 Media workflow `38280757897` 正在运行。无真实短片/试听质量认可，故不部署、不新增 Provider。 | `C:\...\synclip-video-delivery\XGS` |
| UI / 原 `01a0f118-e09d-7671-af09-0592d6062a6c` 已由替代 `01a12fc3-b66e-7090-b95e-b7dccfa6ccb8` 接替 | StoryboardPanel/StoryboardPlans 写操作锁与处理中/成功/失败反馈经三轮 High GO，已合入 canonical：`035efaac`、`06fb102e`、`9e837b93`。定向证据 13/13、owner typecheck/diff-check 通过。真实 push workflow `38268914069` 的 browser-entry/web build 全通过；随后因既有 queue-recovery 2 用例失败而提前结束，UI typecheck 与 storyboard-panel CI 步骤被跳过。UI 写反馈、Promise 类型契约、silent outcome 与逐场景提交入口均已 High GO 并按序合入 canonical：`c258da85`、`b82594d8`、`b06a8fab`；`38277069403` 已回执，仅共享 queue-recovery 两断言失败，无 UI 回归证据。 | `E:\...\research-product-craft` |

## 当前 Git / CI / 运行事实
- canonical branch `release/onchip-production-line`, HEAD `e044d8655f5b5ac415d37ad015fe64ce22ffb5c3`, worktree clean and pushed; latest commit fixes handoff formatting after recording the image admission High blocker and approved queue-recovery fixture merge.
- UI runs `38268914069`, `38270923462`, `38274577962` and `38277069403`: browser-entry (hermes-dashboard/auth-dashboard/research-continuation/hermes-workspace-stage) and each web build passed; `skill-path` failed only at `agent-worker queue-recovery.test.ts` two non-UI assertions (`[]` vs `['image-running-task']`; `SYNCLIP_VIDEO_MODEL_MISMATCH` vs `lost acknowledgment`). `storyboard-panel.test.tsx` and web typecheck were skipped because the job stopped early. No deploy, install or model call; this remains a release gate and is assigned to the video session for minimal repair.
- Video exact CI `38280757897` is running after the High-approved fixture merge; prior runs failed only on the two stale queue-recovery assertions. Journal/search evidence remains as previously recorded; no production-code failure is attributed to the merged UI/video code.
- Image admission/floor/reader code and High reviews are merged and preserved; complete producer/floor and real PNG quality remain open. The approved-scene UI submission entry is now merged; no Synclip task has been created and real route observation remains open.

## Open deliverables and gates
- Image/UI: repair the P1 pay-once race exposed by `2ae3133d` (atomic scene spend/task/debit guard plus different-key concurrency test), obtain independent High and exact CI, then merge/deploy before real route observation. Preserve the one completed Hermes draft and fail-closed quality gates; do not resubmit Hermes, create Synclip work, switch paper, or increase budget.
- Video: close exact CI `38280757897`, then retain native-only readiness evidence; further code work requires a concrete capability gap or authorized real short-video/voice comparison. Do not invent filler checks.
- UI: write-feedback、`5e1c4831`、`d9afe946` 与 `43d0923d` 已 High GO 并合入 canonical（`c258da85`、`b82594d8`、`b06a8fab`）。`38277069403` 已回执：仅共享 queue-recovery 两断言失败，未证明 UI 回归；视频 session 正在做最小修复，修复需独立 High 与精确 CI。Overall visual/real-route and user-quality acceptance remains open.
- No deployment until the relevant code, exact CI, High review, and real-product/media quality gates close. Human review of paper visuals remains a separate acceptance gate.

## Historical pointers
- Full image/video/UI receipts, exact CI logs, releases, failures, protected assets and old next-actions remain in Git history (not active instructions). Read this file, project index, progress window and `node scripts/read-current-management-context.mjs` first.
- Taskmaster `currentTag=multistyle-research-illustration`; 1/4/5 remain in progress; 2/3 atomic items done only. Existing capability registry and Native plan remain applicable.
