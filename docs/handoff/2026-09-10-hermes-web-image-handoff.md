# Hermes / 论文视觉叙事 CURRENT
> 交付基线是 `.worktrees/onchip-video-release` / `release/onchip-production-line`；root `main` 仅导航。本页是三线唯一活跃状态，历史细节留在 Git。

## 目标与边界
- 依据开发规格：真实 NousResearch Hermes 先理解全文、提炼 Claims/Evidence，再规划视觉叙事并交 Synclip；论文是事实来源，不以 Codex 手稿代替科学能力。
- 目标仍是 2–3 篇真实论文的凝练、用户确认、配图与公开展示；三篇整体验收、普通用户旅程、完整视频、整站审美尚未完成。
- 用户已要求继续有价值的并行开发；idle 不等于完成，但不得用无关检查填充。保留 PDF/SourceMap、认可图片、公开标识、sealed 记录、原失败/费用/receipt/oncekey；未知 paid/started CP 不重放，不因容量或 idle 扩预算、安装、重启或切换主 Gateway/Native M3。
- 生图真实图片质量仍需来源明确的实际 PNG 与科学审阅；本轮仅完成 API-only 代码、测试与复审准备，尚未调用 Provider/部署。视频真实试听/完整影片与声音选择仍未验收；只读线上观察返回“视频制作暂不可用”，根因为 broker/audio 能力未启用。UI 单项代码合并不等于整站审美完成。

## 总控与并行分工
- 总控 `01a1197c-7a1e-7631-b1c1-2d09b587be9a` 负责集成、CI、CURRENT/progress/index 与串行发布；openscience ACTIVE。
| Session / ID | 当前责任、状态与下一动作 | 工作树 / branch |
|---|---|---|
| 生图 / `01a0e831-be19-7813-8379-58313178ff26` | 完整链 `0e6e8440→b7bd1e08→d55eba8c→9799196c→c9030710→624b147c→5ca05a74→51fbe596` 后，最终修复 `7b1f8466` 已经独立 High GO（P0/P1=0）并合入 canonical `1a22f83c`：所有 sceneImage 预订统一先做 parent CAS，再执行 approved-child spend 与 pending/running guard；补不同幂等键 Promise.allSettled 回归。Media `38291046457` 已全绿；当前生图路线是 Synclip API 的 `gpt-image-2.5` 主模型（截图确认 `POST /v1/image` 合同），仅明确结构化“模型不可用”时一次性降级 `gpt-image-2`；实际模型写入 attempt/receipt/spool result 与生成器版本，完全不使用 `chatgpt-web` 或浏览器生图；尚无真实提交/Provider/PNG/receipt/质量或部署验收。 | `C:\...\illustration-chain-repair\XGS` |
| 视频 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | native-only/fixture 交付已完成；新夹具修复 `613db2c8` 经独立 High GO（P0/P1/P2=0）并合入 canonical，精确 Media `38291046457` 全绿。只读能力核对确认 API/Worker readiness 接线无遗漏；当前真实缺口是服务器 `adminModelsEnabled=false`、无 `.ready`、timer disabled/inactive，且 audio catalog 返回 `SYNCLIP_AUDIO_CATALOG_FAILED`，需要先获得 Synclip Admin/LTX 与 Audio 权限和有效 voice；不应在此状态重启、部署或发起付费任务。 | `C:\...\synclip-video-delivery\XGS` |
| UI / 原 `01a0f118-e09d-7671-af09-0592d6062a6c` 已由替代 `01a12fc3-b66e-7090-b95e-b7dccfa6ccb8` 接替 | StoryboardPanel/StoryboardPlans 写操作锁与处理中/成功/失败反馈经三轮 High GO，已合入 canonical：`035efaac`、`06fb102e`、`9e837b93`。定向证据 13/13、owner typecheck/diff-check 通过。真实 push workflow `38268914069` 的 browser-entry/web build 全通过；随后因既有 queue-recovery 2 用例失败而提前结束，UI typecheck 与 storyboard-panel CI 步骤被跳过。UI 写反馈、Promise 类型契约、silent outcome 与逐场景提交入口均已 High GO 并按序合入 canonical：`c258da85`、`b82594d8`、`b06a8fab`；`38277069403` 已回执，仅共享 queue-recovery 两断言失败，无 UI 回归证据。最新 Guide 主线已补入 P04→P05、研究者/Hermes/读者/期刊协作者角色与入口、节点展开说明；独立 High GO，23/23 Guide/companion tests 与 web typecheck 通过。 | `E:\...\research-product-craft` |

## 当前 Git / CI / 运行事实
- canonical branch `release/onchip-production-line`, latest code commit pending this Guide commit (prior code `5e2da652`: API-only Synclip image model/fallback and request-bound identity fix); worktree clean locally after commit; push/CI remain pending. Earlier code commits are `613db2c8` (fixture state) and `1a22f83c` (scene-image parent serialization), with exact Media CI `38291046457` green.
- UI runs `38268914069`, `38270923462`, `38274577962` and `38277069403`: browser-entry (hermes-dashboard/auth-dashboard/research-continuation/hermes-workspace-stage) and each web build passed; `skill-path` failed only at the two stale non-UI queue-recovery assertions. Those fixtures were refreshed in `af42e5e2`, and the subsequent exact Media run `38280757897` passed all jobs. No deploy, install or model call.
- Video exact CI `38280757897` for merge head `2e1a28de` completed successfully: skill-path and all four browser-entry jobs passed. The two stale queue-recovery fixture failures are closed; Journal/search evidence remains as previously recorded, with no production-code failure attributed to the merged UI/video code.
- Image admission/floor/reader and beta-gate alignment are merged and High-reviewed; complete producer/floor and real PNG quality remain open. The API submission contract is merged; no Synclip task has been created and API receipt/PNG/scientific review remain open. Media `38288353198`'s four shared native-video parent failures are addressed by `613db2c8` plus `1a22f83c`; exact Media `38291046457` is green. No deployment until the API result, human PNG/scientific gates and receipt evidence close.

## Open deliverables and gates
- Image/UI: with exact Media `38291046457` green, the image session has the API-only `gpt-image-2.5` primary path, strict explicit-unavailable fallback to `gpt-image-2`, and `presentation-assets/generations` contract; next is one controlled API generation only after explicit execution authorization and the human PNG/scientific review gate. Preserve the one completed Hermes draft and fail-closed quality gates; do not use `chatgpt-web`, browser generation, resubmit Hermes, switch paper, or increase budget until the API call is authorized and the review gates close.
- Video: exact CI `38280757897` and current Media `38291046457` are green; read-only production diagnosis shows broker timer disabled/inactive, missing `.ready`, `adminModelsEnabled=false`, and no audio config; catalog returns `SYNCLIP_AUDIO_CATALOG_FAILED`. API/Worker adapter wiring is complete. Further work requires authorized server-key capability remediation (Admin/LTX + Audio permissions and valid voice), then the existing installer/config/timer flow; no code-only workaround or blind voice/model selection is available.
- UI: write-feedback、`5e1c4831`、`d9afe946` 与 `43d0923d` 已 High GO 并合入 canonical（`c258da85`、`b82594d8`、`b06a8fab`）。最新 Guide 主线改动已独立 High GO；Guide/companion 23/23 与 web typecheck 通过，full web suite 仍有与本 diff 无关的既有失败。`38277069403` 的共享 queue-recovery 夹具失败已由 `af42e5e2` 修复并经 High GO、定向 45/45 与精确 Media CI 通过；未观察到 UI 回归。Overall visual/real-route and user-quality acceptance remains open.
- No deployment until the relevant code, exact CI, High review, and real-product/media quality gates close. Human review of paper visuals remains a separate acceptance gate.

## Historical pointers
- Full image/video/UI receipts, exact CI logs, releases, failures, protected assets and old next-actions remain in Git history (not active instructions). Read this file, project index, progress window and `node scripts/read-current-management-context.mjs` first.
- Taskmaster `currentTag=multistyle-research-illustration`; 1/4/5 remain in progress; 2/3 atomic items done only. Existing capability registry and Native plan remain applicable.
