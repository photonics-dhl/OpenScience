# Handoff — 2026-08-09 researcher ingestion product slice

- **Current goal:** 完成研究者导入产品切片；Task 1–2 已完成，Task 3 深度复审为 BLOCK，正在重建安全上传与可靠队列合同。
- **Done:** 四个 UI 原语、设计 token、Figma foundations 与三视口门禁；邮箱验证码注册、登录、真实 Dashboard；同源 `/api`/CSRF；多文件 Artifact 上传后写入首个不可变 Commit；真实 Next→Fastify 验证码注册 smoke。
- **Figma IDs:** components `StatusBadge 101:38`、`ProgressRail 101:43`、`Dropzone 101:51`、`EvidenceCard 101:57`；screens `101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`；file key `rWS3seZaDMdlnSljqktMDp`。
- **Constraints:** 不读取/打印 `.env`；代码 token 为 canonical；不在 Task 1 实现 Auth、Dashboard、ingestion API、Hermes 业务页或 Workspace。
- **Open risks:** 迁移 22–25 均未部署；Task 3 尚存在实际 MIME/恶意扫描与 extractor payload 漂移；隔离 integration 尚未实跑。原 integration teardown 已改为隔离数据库守卫+按测试用户清理，禁止连接生产库执行。浏览器仍有既存 next-intl dotted-key 警告；Code Connect 仍受套餐门禁。
- **Next action:** 先关闭 Task 3 安全上传阻断，再实现可恢复 dispatch + worker 原子 claim 和真实 Artifact 多格式解析；新一轮独立复审通过后才允许云上备份、apply 迁移 22–25 与隔离 integration。

Task 3 初版 hardening 已加入 batch request digest、multipart truncated 拒绝和 retry 原子 claim，但深度复审证明当前实现不可发布。Hermes Session/Task 幂等重放的 user/session/kind/payload 绑定已用红绿测试修复；其余阻断见 progress 顶部，migration 25 保持未部署。

## Task 3 deep-review fix round 2

- 权限：`authorizeIngestionWrite` 在 API 读取 multipart 前校验 RO、Workspace active 状态与 Owner/Maintainer/Author/Contributor 角色；Viewer/Reviewer/归档空间被拒绝。
- 内存/限流：multipart 使用逐 chunk 聚合上限、`files=20`/`fields=1`/`parts=21`，单进程并发 ingestion=1；路由参数限流改用模板 bucket；Fastify multipart 限制映射为 413。
- 队列：migration 25 增加 `agent_tasks.dispatched_at`；AgentTask replay 只由未 dispatch 任务重新投递；IngestionTask 关联先于 dispatch；worker 以 DB CAS claim `pending|failed → running`；retry dispatch 失败恢复 `failed_retryable`。
- 证据：domain ingestion/agent 30/30；agent-worker 15/15；本轮变更后的全仓 build 尚待再次执行。
- 已补桥接：worker 读取 Artifact/Blob；Markdown/TeX 走确定性 UTF-8 解码后进入 `sdf.extract`，PDF/Office/图片无受控解析器时返回 `needs_review`，避免二进制伪装成正文。未关闭：生产级二进制 parser 与完整 AV/quarantine adapter；integration test 已加隔离数据库守卫与按测试用户清理，但仍待隔离 PG/Redis/MinIO 实跑。
- 内容安全补充：入口已对 PDF/Office/ZIP/图片做服务端 signature 检查，对 Markdown/TeX/SVG 做 UTF-8/主动内容检查；Artifact 层增加 EICAR/PE/明显归档路径快速阻断。该扫描明确不是完整 AV，生产 quarantine/ClamAV adapter 尚未接入。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → 本 handoff → `docs/progress.md` → `project_index.md` → researcher ingestion design/plan。

## Latest verification

- Commit `de29f81` adds the Artifact→Blob worker bridge and deterministic Markdown/TeX parser; `1a6d1c0` adds content signatures and fast blocking checks.
- Full `test`, `build`, `lint`, `docs:lint`, `audit:docs-sync`, and `git diff --check` passed on 2026-08-09; worktree is clean.
- This slice remains blocked for production deployment until controlled PDF/Office/image parsers, quarantine/AV scanning, failure taxonomy/audit completeness, and isolated infrastructure integration evidence are complete.
- Failure taxonomy now maps worker errors prefixed `[blocked]` to `failed_blocked`; only non-blocked failures remain `failed_retryable` and eligible for retry.
- Controlled adapters now include `pdf-parse@2.4.5` and `mammoth@1.12.0`; parser input is capped at 20 MiB and parser exceptions become `needs_review`. Realistic PDF/DOCX fixtures and production AV/quarantine remain open.
- ADR-006 records that `any2pdf` is an export-only MIT component; OCR remains local-engine-first with MiniMax as consented fallback.

## Task 2 fix round 3/5

- Auth/Dashboard 前端已实现：验证码注册、登录、安全 returnTo、新用户/回访用户 Dashboard 状态与可行动 Hermes 任务。
- 已有基础：验证码 Auth UI、Dashboard shell、signup endpoints、migration 22、同源 API/CSRF transport。
- 复审否决：局部 18/18 + 12/12 + mock Playwright 不能证明真实闭环，具体问题见 task-2-review.md。
- Fix round 1：统一 web/Fastify payload；Fastify 两步注册 201 + cookie + provisioning 回调；真实 Dashboard list/task API；可达 `/research-objects/new`；signup 限流/并发/失败安全；XHR/script CSRF；ADR-005。
- Fix round 2：资料导入不再丢文件；新增真实 Next rewrite→Fastify schema/auth service/cookie smoke；已验证账号与 SMTP 故障不再形成公开枚举 oracle；partial unique index 拆为独立前向迁移。
- Fix round 3：同名文件路径消歧；页面级 checkpoint + 稳定幂等键支持中断后从已上传位置恢复；migration 23 先清理历史重复 active rows，再创建唯一索引；新增迁移顺序门禁测试。
- Fix round 4：migration 24 将 RO/Artifact 幂等键落实到数据库唯一约束，Fastify/domain 对同 key 返回原对象；上传使用稳定 import/index key；checkpoint 同步 localStorage，覆盖响应丢失与页面刷新；migration 23 集成测试改为执行实际 SQL 文件，消除测试副本漂移。
- Fix round 5：客户端 SHA-256 与完整材料集合绑定 checkpoint；同名不同内容不再复用旧导入；服务端按实际内容 digest 校验 replay，并将并发 P2002 转为同一成功结果；迁移集成测试逐语句执行真实 SQL。
- 最终复审：`6296343..3cd0c79` READY，Task 2 正式完成。
- 当前验证：auth focused 23/23、web Auth/Dashboard 15/15、database migration order 1/1、web typecheck 通过；等待完整门禁与 scoped re-review。
