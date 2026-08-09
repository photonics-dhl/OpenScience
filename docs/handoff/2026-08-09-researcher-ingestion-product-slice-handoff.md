# Handoff — 2026-08-09 researcher ingestion product slice

- **Current goal:** 完成研究者导入产品切片；Task 1 已完成，Task 2 当前处于 fix round 2/5 的最终独立复审前，Task 3 实现暂停。
- **Done:** 四个 UI 原语、设计 token、Figma foundations 与三视口门禁；邮箱验证码注册、登录、真实 Dashboard；同源 `/api`/CSRF；多文件 Artifact 上传后写入首个不可变 Commit；真实 Next→Fastify 验证码注册 smoke。
- **Figma IDs:** components `StatusBadge 101:38`、`ProgressRail 101:43`、`Dropzone 101:51`、`EvidenceCard 101:57`；screens `101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`；file key `rWS3seZaDMdlnSljqktMDp`。
- **Constraints:** 不读取/打印 `.env`；代码 token 为 canonical；不在 Task 1 实现 Auth、Dashboard、ingestion API、Hermes 业务页或 Workspace。
- **Open risks:** Fix round 2 尚待独立 scoped re-review；signup table 与 active-challenge unique index 两个新迁移均未部署，必须在云上迁移门禁验证；浏览器测试暴露既存 next-intl dotted-key 警告，未纳入本轮 Auth/入口修复；Code Connect 仍受套餐门禁。
- **Next action:** 对 fix round 2 做独立 scoped re-review；若无 load-bearing finding，更新 Task 2 complete 并提交，然后才进入 Task 3 ingestion task 状态机与 Hermes 解析。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → 本 handoff → `docs/progress.md` → `project_index.md` → researcher ingestion design/plan。

## Task 2 fix round 2/5

- Auth/Dashboard 前端已实现：验证码注册、登录、安全 returnTo、新用户/回访用户 Dashboard 状态与可行动 Hermes 任务。
- 已有基础：验证码 Auth UI、Dashboard shell、signup endpoints、migration 22、同源 API/CSRF transport。
- 复审否决：局部 18/18 + 12/12 + mock Playwright 不能证明真实闭环，具体问题见 task-2-review.md。
- Fix round 1：统一 web/Fastify payload；Fastify 两步注册 201 + cookie + provisioning 回调；真实 Dashboard list/task API；可达 `/research-objects/new`；signup 限流/并发/失败安全；XHR/script CSRF；ADR-005。
- Fix round 2：资料导入不再丢文件；新增真实 Next rewrite→Fastify schema/auth service/cookie smoke；已验证账号与 SMTP 故障不再形成公开枚举 oracle；partial unique index 拆为独立前向迁移。
- 当前验证：auth focused 23/23、web Auth/Dashboard 13/13、Playwright 资料导入桌面/移动 4/4、真实跨进程注册 1/1、web typecheck 通过；等待完整门禁与 scoped re-review。
