# Handoff — 2026-08-09 researcher ingestion product slice

- **Current goal:** 完成研究者导入产品切片；Task 1 视觉地基与 Task 2 Auth/Dashboard/真实注册契约已完成，当前进入 Task 3 多格式导入。
- **Done:** 四个 UI 原语、设计 token、Figma foundations 与三视口门禁；邮箱验证码注册、登录、Dashboard；真实 signup API、signup_challenges 迁移、legacy invited-account 兼容；web 同源 `/api` 与 CSRF 写请求通道；CSRF 豁免仅限无会话认证写入，logout 受保护。
- **Figma IDs:** components `StatusBadge 101:38`、`ProgressRail 101:43`、`Dropzone 101:51`、`EvidenceCard 101:57`；screens `101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`；file key `rWS3seZaDMdlnSljqktMDp`。
- **Constraints:** 不读取/打印 `.env`；代码 token 为 canonical；不在 Task 1 实现 Auth、Dashboard、ingestion API、Hermes 业务页或 Workspace。
- **Open risks:** Code Connect 调用仍受 Figma 套餐/席位门禁；生产环境尚未部署 migration 22 与本分支；Task 3–6 未完成，不能把当前 Dashboard 视作完整产品。
- **Next action:** Task 3 先为多格式导入 API/文件策略写失败合同测试，再实现 import session、artifact 绑定、Hermes 任务启动与真实浏览器上传流程。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → 本 handoff → `docs/progress.md` → `project_index.md` → researcher ingestion design/plan。

## Task 2 complete

- Auth/Dashboard 前端已实现：验证码注册、登录、安全 returnTo、新用户/回访用户 Dashboard 状态与可行动 Hermes 任务。
- 真实后端已恢复：`/auth/request-signup-code`、`/auth/confirm-signup`、migration 22 与 legacy invited-account 迁移兼容。
- 验证：web focused 18/18、API auth/security 12/12、Playwright 4/4、全仓 build 通过。
- 下一动作：Task 3 多格式导入；禁止以 E2E route mock 替代真实 artifact/storage/Hermes 集成证据。
