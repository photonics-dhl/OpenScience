# P1A-3 邀请码注册与邮箱验证 Auth 设计

- 日期：2026-07-28
- 状态：已批准（2026-07-28 用户逐节确认设计）
- 关联：task-master 任务 2.3；Spec §2.1.3、§2.1.4、§3.1、§16、§17；ADR-001、ADR-002；`.agents/skills/architecture-guard/SKILL.md`、`.agents/skills/api-contract/SKILL.md`、`.agents/skills/security-review/SKILL.md`、`.agents/skills/database-migration/SKILL.md`
- 前置：P1A-1 Monorepo 骨架完成；P1A-2 数据基础代码完成（`packages/database` 连接工厂 + 迁移 runner + 生产守卫；集成测试云上执行中）

## 1. 范围

**做**：

- `packages/auth`（纯逻辑，无 HTTP 框架依赖）：密码哈希（argon2id）、邀请码核销、邮箱验证码流（防枚举/冷却/尝试锁）、Redis 不透明 token session、Mailer 接口 + dev outbox 捕获实现。
- `apps/api` 首次落地 Fastify v5 骨架：`/auth` 六个端点、最小统一错误格式、cookie 安全配置、启动 env 校验。
- 数据库迁移 2：`users` / `invitations` / `email_verifications` / `mail_outbox` 四张表（附 rollback.sql）。
- `scripts/invite.ts` CLI：邀请码 create/list/revoke（管理员侧最小能力）。
- 顺手修复终审 parked 项：`NODE_ENV=production` 且缺 `DATABASE_URL` 时启动即 throw（快速失败）。

**不做（YAGNI，留待后续任务）**：

- Personal Workspace 自动创建（2.4）；RBAC（2.5）；统一错误/审计全局化（2.6，本任务只做 /auth 最小错误格式）；限流实现（2.8，只留挂载点注释）。
- SmtpMailer 真实实现（§24 邮件服务商未定，只留接口与配置位）；第三方实名认证（§24，`identity_verified` 仅状态位预留）。
- 忘记密码/改邮箱/SSO（Baseline MVP 未列）；web 端注册页面（API 级验收，UI 随后续阶段补）。

## 2. 选型决策（2026-07-28 用户确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 邮件发送通道 | Mailer 接口 + dev 捕获（`mail_outbox` 表） | §24 邮件服务商未定，不猜测写死；outbox 同时是测试钩子；生产 SMTP 配置位预留 |
| 登录态 | Redis 不透明 token | 可主动吊销、权限变更即时生效；与 2.8 限流共用 Redis；JWT 吊销难，PG 存 session 增加主库高频读写 |
| 邀请码管理面 | CLI 脚本 | task 2.3 只要求管理员侧最小能力；/admin 界面归 2.5/2.6 |
| 实现结构 | 核心逻辑进 `packages/auth`，`apps/api` 做 Fastify 薄路由层 | architecture-guard 包边界；2.5 RBAC / 2.8 限流直接复用挂载点不返工 |
| 密码哈希 | argon2id（`argon2` 包） | 现代标准；预建二进制 Windows/Linux 均可 |
| 输入校验 | zod（唯一新增运行时依赖） | 路由层 schema 复用，与 api-contract skill 一致 |

## 3. 组件与职责

```text
apps/api (Fastify v5 首次落地)
  ├─ plugins: @fastify/cookie、最小错误格式、env 校验
  └─ routes/auth.ts ──调用──► packages/auth (纯逻辑，无 HTTP 依赖)
                                 ├─ password.ts     argon2id hash/verify
                                 ├─ invitations.ts  邀请码核销（事务内标记 used）
                                 ├─ verification.ts 6 位验证码：生成/校验/冷却/尝试锁
                                 ├─ session.ts      Redis opaque token 签发/校验/吊销
                                 ├─ mailer.ts       Mailer 接口 + DevOutboxMailer + SmtpMailer 预留
                                 └─ errors.ts       AuthError 子类 → HTTP 映射表
packages/database              复用 createPrismaClient/createRedisClient（P1A-2）
infra/migrations/              迁移 2：users/invitations/email_verifications/mail_outbox
scripts/                       invite.ts CLI（create/list/revoke，走 packages/database）
```

边界规则：`packages/auth` 不 import fastify；路由层只做参数解析 → 调 service → 映射响应；session 数据只在 Redis 不落库；`mail_outbox` 为 dev 捕获通道，生产配 SMTP 后停用；生产环境尚无真实 Mailer 时启动即 throw（2026-07-28 终审修订）。plugins 只装 `@fastify/cookie`；CORS/CSRF/rate-limit 归 2.8，本任务只留挂载点注释。

## 4. 数据模型（迁移 2，四张表）

- `users`：`id` uuid PK；`email` citext unique；`password_hash`；`display_name`；`status` enum（`invited` / `email_verified` / `identity_verified` / `suspended` / `deleted`，对应 Spec §3.1）；`created_at` / `updated_at`。`identity_verified` 仅状态位预留。
- `invitations`：`id`；`code` unique（20 位随机 base32）；`email`（可选，限定受邀邮箱）；`created_by`（text，CLI 标来源）；`used_by` → `users.id`（null=未用）；`used_at`；`revoked_at`；`expires_at`；`created_at`。核销条件：未用 + 未吊销 + 未过期 +（限定邮箱时匹配）。
- `email_verifications`：`id`；`user_id`；`code_hash`（验证码只存 sha256，不明文）；`attempts`（默认 0，≥5 锁 15 分钟）；`expires_at`（10 分钟）；`last_sent_at`（冷却 60s）；`verified_at`。
- `mail_outbox`：`id`；`to_email`；`subject`；`body_text`；`created_at`；`sent_via`（dev 恒 `'outbox'`）。

迁移纪律沿用 P1A-2：每个迁移目录附手写 `rollback.sql`（database-migration skill 第 2 条）。`citext` 需 `CREATE EXTENSION IF NOT EXISTS citext` 写进 migration.sql；rollback 不 drop extension（可能影响同库其他对象，rollback.sql 内注明理由）。

## 5. API 面（全部 `/auth` 前缀，REST/JSON）

| 端点 | 说明 | 成功 | 关键错误 |
|---|---|---|---|
| `POST /auth/register` | body `{ invitationCode, email, password, displayName }`；事务内核销邀请码 + 建 user（status=invited）+ 发验证码 | 201 `{ userId, status }` | 400 邀请码无效/已用/过期/吊销/邮箱不匹配；409 邮箱已注册 |
| `POST /auth/verify-email` | body `{ email, code }`；通过 → status=email_verified + 发 session cookie | 200 `{ userId, status }` | 400 码错误（attempts+1，≥5 锁）；410 码过期；429 锁定中 |
| `POST /auth/resend-code` | body `{ email }`；60s 冷却 | 202（统一响应，防枚举；冷却中同样 202 但不发送） | — |
| `POST /auth/login` | body `{ email, password }`；仅 email_verified 可登；发 session cookie | 200 `{ userId, status }` | 401 凭据错误（统一文案，不区分邮箱不存在/密码错）；403 invited/suspended/deleted |
| `POST /auth/logout` | 吊销 Redis token + 清 cookie | 204 | — |
| `GET /auth/me` | 校验 cookie → 当前用户 | 200 `{ userId, email, status, displayName }` | 401 |

统一错误格式（2.6 扩展为全局标准）：`{ "error": { "code": "INVITATION_INVALID" | "CREDENTIALS_INVALID" | ..., "message": "..." } }`。防枚举：register / login / resend-code 三处外部响应不泄露"邮箱是否已注册"。

## 6. 流程与安全细节

**注册闭环**：`register`（邀请码有效 + 邮箱未注册 → argon2id 哈希入库，status=invited，发码）→ 用户收码 → `verify-email`（对码 → status=email_verified，自动登录发 cookie）。一个邀请码只可用一次，核销与建用户在同一事务，且核销用 guarded `updateMany`（`usedBy IS NULL` 条件）原子完成，防并发双核销（2026-07-28 终审修订）。

**防枚举补强**（2026-07-28 终审修订）：login 未知邮箱路径执行一次 dummy argon2 校验抹平计时侧信道；resend 冷却期静默 202。

**验证码流**（借鉴 Scholars Tea 防枚举/限流/冷却经验，ADR-001 可抽取模块，只借鉴设计不搬代码）：6 位数字、sha256 存库、10 分钟过期、同一邮箱 60s 重发冷却（冷却中静默 202 不发送，防枚举；2026-07-28 终审修订）、连续 5 次错误锁 15 分钟；重发使旧码失效（同 user 只保留最新一条未验证记录）。

**Session / cookie**（Spec §17 对齐）：token = 32 字节随机 base64url；Redis key `sess:{token}` → `{ userId, status, createdAt }`，TTL 7 天滑动；cookie `HttpOnly; Secure; SameSite=Lax; Path=/`，dev 下 Secure 按 env 关闭（本机 http）。登录时把 status 快照进 session；`suspended` / `deleted` 即时被拒。`GET /auth/me` 与后续受保护端点统一走 `session.ts` 的 `requireSession`，2.5 RBAC 复用此挂载点。

**密码**：argon2id；最小强度校验 8 位 + 字母数字（zod schema）。

**env 校验**：API 启动校验必需 env（`DATABASE_URL` / `REDIS_URL` / cookie 密钥）；`NODE_ENV=production` 且缺 `DATABASE_URL` 时启动即 throw（修终审 parked 项）；dev 继续回落 P1A-2 默认值。

## 7. 测试

- **单测（本地，无 Docker）**：argon2 hash/verify；邀请码核销条件矩阵（未用/已用/吊销/过期/限定邮箱不匹配）；验证码生成格式、sha256 存库、过期/冷却/尝试锁判定纯函数；session token 生成与序列化；login 两条失败路径文案一致（防枚举）；env 校验生产快速失败。
- **API 集成测试（Fastify `inject`，不起真实端口；需 Docker 栈 PG+Redis，与 P1A-2 Task 4/5 一起在云上执行）**：注册→验证→登录全链路；无邀请码/无效码/无效验证码拒绝路径；409 重复注册；logout 后 `/auth/me` 401；invited 状态 login 403；CLI create/list/revoke 走真实 dev 库。
- **证据纪律**：本地单测 + 静态门禁全绿；集成测试云上补；两边都绿后 task-master 2.3 方可置 done（test-gate）。

## 8. 收尾同步（docs-sync）

- 登记 `project_index.md`；`docs/progress.md` 置顶条目（含证据命令输出）；`AGENTS.md` 补新命令（api dev 启动、invite CLI）；task-master 2.3 状态流转（子任务 MCP 写入有已知故障，必要时 JSON 修复路径 + 备份）。
- 实施沿用 SDD（主目录直做，P1A-2 已验证该模式）；本任务完成后建议小步提交一次（需用户批准）。

## 9. 验收标准

- `POST /auth/register` 持有效邀请码可注册（status=invited），无/无效邀请码被拒；验证码写入 `mail_outbox`。
- `POST /auth/verify-email` 正确验证码 → status=email_verified 且获得 session cookie；错误码 5 次锁定。
- `POST /auth/login` 仅 email_verified 可登；`logout` 后 `/auth/me` 401。
- 邀请码核销与建用户同事务；验证码不明文落库；cookie 带 HttpOnly/SameSite=Lax。
- 本地：`lint` / `typecheck` / `build` / 单测全绿；`NODE_ENV=production` 缺 `DATABASE_URL` 启动即 throw。
- 云上：API 集成测试全过（对应 Spec §21.2 验收步骤 1：受邀用户可注册并验证邮箱）。
