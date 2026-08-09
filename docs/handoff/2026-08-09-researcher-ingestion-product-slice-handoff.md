# Handoff — 2026-08-09 researcher ingestion product slice

- **Current goal:** 完成研究者导入产品切片；当前仅 Task 1 视觉地基完成，Task 2–6 尚未开始。
- **Done:** 四个 UI 原语与中英消息；workbench/evidence/status/focus/spacing/type/radius token；focused tests 19/19 + web typecheck/build + root lint；Playwright 从仅开发态 `/_visual/ingestion-foundations` 捕获真实编译组件的三视口截图；Figma 30 variables、1 effect style、4 components、6 screen skeletons。
- **Figma IDs:** components `StatusBadge 101:38`、`ProgressRail 101:43`、`Dropzone 101:51`、`EvidenceCard 101:57`；screens `101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`；file key `rWS3seZaDMdlnSljqktMDp`。
- **Constraints:** 不读取/打印 `.env`；代码 token 为 canonical；不在 Task 1 实现 Auth、Dashboard、ingestion API、Hermes 业务页或 Workspace。
- **Open risks:** Code Connect 调用被 Figma 官方套餐门禁拒绝，需 Organization/Enterprise 的 Dev/Full seat 且 component library 已发布；当前节点只有组件/屏幕骨架，不代表 Tasks 2–5 的产品页面完成。
- **Next action:** Task 2 Auth/Dashboard design-to-code 前先复核本 commit 与 node IDs，再按计划写失败合同测试。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → 本 handoff → `docs/progress.md` → `project_index.md` → researcher ingestion design/plan。

## Task 2 checkpoint

- Auth/Dashboard 前端已实现：验证码注册、登录、安全 returnTo、新用户/回访用户 Dashboard 状态与可行动 Hermes 任务。
- 验证：focused test 10/10、Playwright 4/4、web typecheck/build 通过。
- 当前阻断：本分支缺少生产已部署的两个 signup API 后端提交；不得在未合入和真实集成验证前部署本分支。
- 下一动作：恢复 `/auth/request-signup-code`、`/auth/confirm-signup` 与 legacy invited-account 迁移兼容，再完成 Task 2 审查。
