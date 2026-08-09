# Handoff — 2026-08-09 researcher ingestion product slice

- **Current goal:** 完成研究者导入产品切片；Task 1 已完成，Task 2 独立复审未通过，当前处于 fix round 1/5，Task 3 实现暂停。
- **Done:** 四个 UI 原语、设计 token、Figma foundations 与三视口门禁；邮箱验证码注册、登录、Dashboard；真实 signup API、signup_challenges 迁移、legacy invited-account 兼容；web 同源 `/api` 与 CSRF 写请求通道；CSRF 豁免仅限无会话认证写入，logout 受保护。
- **Figma IDs:** components `StatusBadge 101:38`、`ProgressRail 101:43`、`Dropzone 101:51`、`EvidenceCard 101:57`；screens `101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`；file key `rWS3seZaDMdlnSljqktMDp`。
- **Constraints:** 不读取/打印 `.env`；代码 token 为 canonical；不在 Task 1 实现 Auth、Dashboard、ingestion API、Hermes 业务页或 Workspace。
- **Open risks:** Fix round 1 已覆盖原六项重要缺口，但尚待独立 scoped re-review；migration 22 未部署且 partial unique index 必须在云上迁移门禁验证；Code Connect 仍受套餐门禁。
- **Next action:** 对当前 fix diff 做独立 scoped re-review；若无 load-bearing finding，更新 Task 2 complete 并提交，然后才进入 Task 3。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → 本 handoff → `docs/progress.md` → `project_index.md` → researcher ingestion design/plan。

## Task 2 fix round 1/5

- Auth/Dashboard 前端已实现：验证码注册、登录、安全 returnTo、新用户/回访用户 Dashboard 状态与可行动 Hermes 任务。
- 已有基础：验证码 Auth UI、Dashboard shell、signup endpoints、migration 22、同源 API/CSRF transport。
- 复审否决：局部 18/18 + 12/12 + mock Playwright 不能证明真实闭环，具体问题见 task-2-review.md。
- Fix round 1：统一 web/Fastify payload；Fastify 两步注册 201 + cookie + provisioning 回调；真实 Dashboard list/task API；可达 `/research-objects/new`；signup 限流/并发/失败安全；XHR/script CSRF；ADR-005。
- 验证：auth 22/22、domain 18/18、API 20/20、web 22/22、Playwright 4/4、Prisma validate 与 root build 通过；等待 scoped re-review。
