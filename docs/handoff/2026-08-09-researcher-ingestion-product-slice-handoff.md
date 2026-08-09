# Handoff — 2026-08-09 researcher ingestion product slice

> **Update 2026-08-10:** MiniMax domestic Token Plan endpoint and structured-output parser fix are deployed; production retry reached `needs_review`. A review/confirm UI/API and transactional consume ledger are now implemented locally; read the newest progress entry before continuing deployment.

- **Current goal:** 将 review/confirm UI/API、成功任务 consume 流水和对象卷备份部署到服务器并完成真实验收；之后处理 OCR/AV。
- **Done:** 四个 UI 原语、设计 token、Figma foundations 与三视口门禁；邮箱验证码注册、登录、真实 Dashboard；同源 `/api`/CSRF；多文件 Artifact 上传后写入首个不可变 Commit；真实 Next→Fastify 验证码注册 smoke；生产 API/Web/agent-worker 与迁移已部署。
- **Figma IDs:** components `StatusBadge 101:38`、`ProgressRail 101:43`、`Dropzone 101:51`、`EvidenceCard 101:57`；screens `101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`；file key `rWS3seZaDMdlnSljqktMDp`。
- **Constraints:** 不读取/打印 `.env`；代码 token 为 canonical；不在 Task 1 实现 Auth、Dashboard、ingestion API、Hermes 业务页或 Workspace。
- **Open risks:** 生产 AV/quarantine 与图片 OCR 未实现；隔离 integration 尚未实跑；备份脚本已支持对象卷快照但尚未完成服务器恢复演练。失败尝试产生的明确测试 RO 均保留。浏览器仍有既存 next-intl dotted-key 警告；Code Connect 仍受套餐门禁。
- **Next action:** 同步本轮代码，重建 API/Web/worker，在已有 `needs_review` 任务上调用 confirm API，核验 `confirmed`、SDF version+1 与一条 consume 流水；随后接入 ClamAV/OCR。
- **Deployment checkpoint:** clean server release switch completed after explicit authorization. Previous code is recoverable at `/opt/openscience-backup-20260809-2218`; database backup was created before applying the remaining migrations. API/Web/agent-worker are running; parser runtime loaded in the worker container; public home=200 and unauthenticated auth=401.

## Production parser acceptance checkpoint

- Production read-only probe found no Artifact rows, so storage reachability remains unproven rather than failed.
- Added `apps/agent-worker/src/parser-self-test.ts` with deterministic, non-user PDF and DOCX fixtures; it invokes the same default adapters as the worker composition root and emits only a redacted pass/fail marker.
- TDD evidence: focused test first failed on the missing module, then passed 7/7 after implementation. Server execution is the immediate next gate.

## Production object-storage root cause checkpoint

- Real API flow reached CSRF 200 and RO creation 201, then ingestion returned 500 before dispatch.
- Redacted runtime probe: no S3 env fields, loopback fallback, `StorageUnavailableError`; this is the confirmed root cause.
- ADR-007 selects private SeaweedFS 4.41 S3 mode instead of the archived/unmaintained MinIO community binary line. Compose contract test passed after a verified red state.

## Registration credit checkpoint

- Storage deployment moved the real ingestion failure from 500 to 409 `INSUFFICIENT_CREDIT`, proving the next blocker is onboarding credit rather than S3 reachability.
- `createPersonalWorkspace` now ensures the current UTC month's `ai_credit` grant from the active policy even when the workspace already exists. The deterministic ledger key prevents duplicate grants.
- TDD red was an empty ledger after workspace creation; focused workspace/usage tests are 19/19 green. Production deployment and the authorized-account E2E remain the next gate.

## Production ingestion and Token Plan checkpoint

- Production grant execution returned `granted=2, skipped=0`; real API evidence is CSRF 200, RO 201, ingest 202, Blob HEAD present. Worker reached `failed_retryable`, so S3/Redis/claim are proven while AI remains the terminal blocker.
- MiniMax official Token Plan documentation states Subscription Keys differ from standard API Keys and demonstrates Anthropic Messages. This account is domestic: `https://api.minimaxi.com/anthropic` returns 200 while the international endpoint returns 401 for both valid keys. ADR-008 supersedes the earlier OpenAI-only assumption for Token Plan.
- TDD covers Anthropic request/response mapping, key1 HTTP failure → key2 success, and MiniMax thinking/markdown-fenced JSON extraction while preserving `MiniMax-M3` as the actual model ID. Server build/recreate passed; formal retry returned HTTP 200 and progressed `failed_retryable → parsing → needs_review`.

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
