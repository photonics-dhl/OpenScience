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
| 生图 / `01a0e831-be19-7813-8379-58313178ff26` | `8f817cbc+b0d7f82e+2e9fa92a+0ee68fe5+55f3c9cd` 及后续 adapter/worker、floor、reader 切片均已独立 High GO 并合入；admission 191/195（4 skip）、Worker typecheck/diff-check 通过，journal 缺 RO/version 身份 fail-closed。唯一 Hermes 私有提交后，Synclip 受控读取仍遇模型容量错误，未得 PNG/SHA/科学质量；当前阻塞是 provider/browser 容量，禁止盲重试或换论文。 | `C:\...\illustration-chain-repair\XGS` |
| 视频 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | native-only/fixture 交付已完成并按序合入；browser-entry/native-video-planning 通过。Media workflow `38260970719` 只复现既有 queue-recovery 两失败，非本次视频代码回归；无真实短片/试听质量认可，故不部署、不新增 Provider。 | `C:\...\synclip-video-delivery\XGS` |
| UI / 原 `01a0f118-e09d-7671-af09-0592d6062a6c` 已由替代 `01a12fc3-b66e-7090-b95e-b7dccfa6ccb8` 接替 | StoryboardPanel/StoryboardPlans 写操作锁与处理中/成功/失败反馈经三轮 High GO，已合入 canonical：`035efaac`、`06fb102e`、`9e837b93`。定向证据 13/13、owner typecheck/diff-check 通过。真实 push workflow `38268914069` 的 browser-entry/web build 全通过；随后因既有 queue-recovery 2 用例失败而提前结束，UI typecheck 与 storyboard-panel CI 步骤被跳过。UI 写反馈主范围已完成；P2 类型契约修复提交 `5e1c4831` 已获独立 High GO，并按序合入 canonical 为 `c258da85`；不能声称 workflow 全绿。 | `E:\...\research-product-craft` |

## 当前 Git / CI / 运行事实
- canonical branch `release/onchip-production-line`, HEAD `c258da857476be48fc7ec3dce1de7e5f4220a741`, worktree clean and pushed; latest docs commit records UI merge.
- UI run `38268914069`: browser-entry (hermes-dashboard/auth-dashboard/research-continuation/hermes-workspace-stage) and each web build passed; `skill-path` failed only at `agent-worker queue-recovery.test.ts` two non-UI assertions. `storyboard-panel.test.tsx` and web typecheck were skipped because the job stopped early. No rerun, deploy, install or model call.
- Video current exact CI has the same two queue-recovery failures; browser-entry and native-video-planning pass. Journal/search evidence remains as previously recorded; no new failure is attributed to the merged UI/video code.
- Image admission/floor/reader code and High reviews are merged and preserved; complete producer/floor and real PNG quality remain open. The image task's model-capacity error is a provider/browser blocker, not evidence for a new code change.

## Open deliverables and gates
- Image: resume one controlled real-paper private acceptance only after an available >= gpt-6.1-sol capacity path is confirmed; reuse the existing single submission, do not resubmit, switch paper, or increase budget. If capacity remains unavailable, report blocked and preserve receipts.
- Video: keep native-only readiness and exact CI evidence; next code work requires a concrete capability gap or authorized real short-video/voice comparison. Do not invent filler checks.
- UI: write-feedback 主范围与 `5e1c4831` Promise outcome 类型契约修复均已 High GO 并合入 canonical `c258da85`。共享 queue-recovery 仍是 CI 限制；不把它冒充 UI 回归。 Overall visual/real-route and user-quality acceptance remains open.
- No deployment until the relevant code, exact CI, High review, and real-product/media quality gates close. Human review of paper visuals remains a separate acceptance gate.

## Historical pointers
- Full image/video/UI receipts, exact CI logs, releases, failures, protected assets and old next-actions remain in Git history (not active instructions). Read this file, project index, progress window and `node scripts/read-current-management-context.mjs` first.
- Taskmaster `currentTag=multistyle-research-illustration`; 1/4/5 remain in progress; 2/3 atomic items done only. Existing capability registry and Native plan remain applicable.
