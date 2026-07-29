# P1A-4 Workspace 模型与成员管理设计

- 日期：2026-07-29
- 状态：已批准（2026-07-29 用户逐节确认设计）
- 关联：task-master 任务 2.4；Spec §3.2、§3.3、§15、§16、§17；ADR-001、ADR-002；`.agents/skills/architecture-guard/SKILL.md`、`.agents/skills/api-contract/SKILL.md`、`.agents/skills/database-migration/SKILL.md`、`.agents/skills/test-gate/SKILL.md`
- 前置：P1A-1 骨架完成；P1A-2 数据基础代码完成；P1A-3 Auth 完成（`packages/auth` + `apps/api` Fastify `/auth` + session cookie，集成测试云上待执行）

## 1. 范围

**做**：

- `packages/domain` 首个领域模块 `workspace/`（纯 TS，依赖注入 Prisma 客户端，无 HTTP 框架依赖）：Personal Workspace 自动创建、team workspace 管理、成员邀请/接受/拒绝/撤销、角色变更、转让所有权、退出、归档。
- `apps/api` 新增 `/workspaces` 路由模块（薄 HTTP 适配层，复用 P1A-3 的 session 认证、zod 校验、`{ error: { code, message } }` 错误格式）。
- 数据库迁移 3：`workspaces` / `memberships` / `workspace_invitations` 三张表（附 rollback.sql）。
- 最小内联权限检查：每个端点先判成员身份（非成员 404）再判角色（不足 403）；完整 RBAC 守卫抽象归 2.5。
- 写路径预留审计挂接点注释（`// audit(2.6): ...`），AuditLog 接线归 2.6。

**不做（YAGNI，留待后续任务）**：

- RO 归属字段与 RO 实体（1B）；完整 RBAC 授权矩阵与统一守卫（2.5）；AuditLog 表与写审计（2.6）；QuotaPolicy 存储额度字段（2.7）；限流（2.8）。
- workspace slug / URL 美化（API 一律 uuid 路径）；邀请邮件真实发送（复用 MailOutbox dev 捕获通道，生产 Mailer 守卫沿用 P1A-3）；web 端界面（API 级验收，UI 随后续阶段补）。
- 后台任务清理过期邀请（过期惰性判定，读取时计算）。

## 2. 选型决策（2026-07-29 用户确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| Personal Workspace 创建时机 | 邮箱验证通过时，与用户状态迁移同事务 | 只有激活用户产生 workspace 行，无僵尸空间；对齐验收步骤 2"验证邮箱用户拥有个人 Workspace" |
| auth → domain 依赖方向 | 回调注入：`verifyEmail(prisma, { onEmailVerified })`，`apps/api` 组装时传入 domain 的 `createPersonalWorkspace` | 避免 `packages/auth` 反向依赖 `packages/domain`；包边界符合 architecture-guard |
| 成员邀请机制 | 按邮箱邀请 + 受邀者显式 accept/decline | 无新码体系；受邀者有拒绝权；测试阶段所有用户已持平台邀请码注册，邮箱即可定位 |
| 邀请表 | 新表 `workspace_invitations`，不复用平台 `invitations` | 两者生命周期不同：无 code、有 invited_by、状态机 pending→accepted/declined/revoked/expired |
| Membership 角色枚举 | 全量 6 档：owner/maintainer/author/contributor/reviewer/viewer | 与 Spec §3.3 完全对齐，邀请时即可预指派；避免 1C 再迁移改枚举；Moderator/Platform Admin 为平台级，不进 Membership |
| Personal Workspace 成员 | 纯单人，邀请接口对 personal 类型直接拒绝 | 协作必须建 team workspace；personal/team 边界清晰 |
| 本任务权限检查 | 最小内联检查（成员→404，角色不足→403） | 2.5 才抽统一守卫；本任务端点不能无检查上线 |
| 乐观锁 | 不引入 etag/版本号 | 全部端点为单资源短事务（事务内条件更新），无并发覆盖面；重复 accept 由唯一约束转幂等 |
| 代码落点 | 领域逻辑进 `packages/domain`，`apps/api` 只做 HTTP 适配 | 与 P1A-3 `packages/auth` + 薄路由模式一致；task 2.1 已规划 `packages/domain` 放领域逻辑 |

## 3. 组件与职责

```text
apps/api (Fastify v5)
  └─ routes/workspaces.ts ──调用──► packages/domain/src/workspace/ (纯逻辑，无 HTTP 依赖)
                                       ├─ personal.ts     createPersonalWorkspace（幂等，事务内）
                                       ├─ workspaces.ts   创建/详情/改资料/归档 team workspace
                                       ├─ members.ts      成员列表/角色变更/移除/退出/转让
                                       ├─ invitations.ts  邀请/待邀列表/accept/decline/revoke
                                       └─ errors.ts       WorkspaceError 子类 → HTTP 映射表
packages/auth                  verifyEmail 增加可选 onEmailVerified 回调（P1A-3 代码最小改动）
packages/database              复用 createPrismaClient（P1A-2）
infra/migrations/              迁移 3：workspaces/memberships/workspace_invitations
```

边界规则：`packages/domain` 不 import fastify；路由层只做参数解析 → session 取当前用户 → 调 domain → 映射响应；session 认证复用 P1A-3 `openscience_session` cookie + Redis；审计挂接点只留注释，2.6 统一接线。

## 4. 数据模型（迁移 3，三张表）

枚举：`WorkspaceType{personal,team}`、`WorkspaceStatus{active,archived}`、`WorkspaceRole{owner,maintainer,author,contributor,reviewer,viewer}`、`WorkspaceInvitationStatus{pending,accepted,declined,revoked,expired}`。

- `workspaces`：`id` uuid PK；`type`；`name`；`owner_id` → `users.id`（当前 Owner 用户 id，personal 恒等于属主）；`status` 默认 `active`；`created_at` / `updated_at`。
  - **部分唯一索引**：`CREATE UNIQUE INDEX ... ON workspaces(owner_id) WHERE type='personal'`，保证一个用户最多一个 personal 空间（个人空间唯一性的数据库兜底）。
- `memberships`：`id` uuid PK；`workspace_id` → `workspaces.id`；`user_id` → `users.id`；`role`；`created_at` / `updated_at`；`@@unique([workspaceId, userId])`（同一用户在同一空间唯一成员身份，并发双 accept 的兜底）。
- `workspace_invitations`：`id` uuid PK；`workspace_id`；`email` citext（受邀邮箱，不强制已注册）；`role`（预指派角色，accept 后生效）；`status` 默认 `pending`；`invited_by` → `users.id`；`expires_at`（创建后 7 天）；`responded_at`（accept/decline/revoke 时写入）；`created_at` / `updated_at`。
  - 防重复待邀不用数据库唯一约束（同邮箱 revoke 后须能再邀），由领域层查"同 (workspace_id, email) 且 status=pending"拒绝。

不变量分工：personal 唯一性由部分唯一索引兜底；其余不变量（personal 纯单人、team 至少一个 owner、归档只读）由领域层强制并全部有单测。`owner_id` 不建外键到 Membership（避免循环依赖）；Owner 必有一条 role=owner 的 Membership 由领域层保证。

## 5. 领域逻辑

### 5.1 Personal Workspace 创建

- 挂接：`apps/api` 组装时向 `verifyEmail` 传入 `onEmailVerified = createPersonalWorkspace`；用户状态 `invited→email_verified` 与 workspace + owner membership 创建在**同一 Prisma 事务**，失败整体回滚。
- 幂等：重复调用由部分唯一索引兜底，冲突时查询返回既有空间而非报错。
- 命名：`"<displayName> 的个人空间"`（displayName 为空时回退邮箱前缀）。

### 5.2 不变量（领域层强制）

1. personal 空间：恰好一个成员（owner）；拒绝邀请、转让、退出、归档、移除成员、角色变更（错误码 `PERSONAL_WORKSPACE`，409）。
2. team 空间：任何时候至少一个 owner——退出/移除/转让/降角色前检查"操作后剩余 owner ≥ 1"，否则 `LAST_OWNER`（409）。
3. 归档的 team 空间：只读，拒绝邀请、成员变更、资料修改（`WORKSPACE_ARCHIVED`，409）。

### 5.3 邀请状态机 `pending → accepted | declined | revoked | expired`

- `invite`：仅 team、仅 owner/maintainer；受邀邮箱已注册且已是成员 → `ALREADY_MEMBER`（409）；已有同邮箱 pending 邀请 → `INVITATION_PENDING_EXISTS`（409，提示可 revoke 后重发）；通知邮件写 MailOutbox（复用 P1A-3 Mailer 通道，无验证码无密钥）。
- `accept`：受邀者本人（session 用户邮箱与 invitation.email 经 citext 不区分大小写匹配）且 pending 且未过期 → 创建 Membership（预指派 role）+ 邀请转 accepted，同一事务。并发双 accept 由 `@@unique([workspaceId, userId])` 兜底，冲突视为幂等成功返回既有 membership。
- `decline`：受邀者本人；`revoke`：owner/maintainer。
- 过期惰性判定：读取时 `expiresAt < now` 视为 expired，不写后台任务。
- **枚举面控制**：accept/decline 对"邀请不存在 / 不属于当前用户 / 已处理或已过期"统一返回 404，不泄露邀请存在性。

### 5.4 转让所有权

事务内三步：原 owner 降 maintainer、新 owner 升 owner、`workspaces.owner_id` 更新。拒绝转给非成员（`VALIDATION_ERROR` 400）；拒绝 personal（`PERSONAL_WORKSPACE` 409）。

## 6. API 端点（`/workspaces` 模块）

全部端点要求 session 认证（未认证 401）；请求体 zod 校验失败 400 `validation_error`。

```text
GET    /workspaces                          我加入的空间列表（含 personal）
POST   /workspaces                          创建 team workspace（name；创建者自动成为 owner）→ 201
GET    /workspaces/:id                      空间详情（成员可见）
PATCH  /workspaces/:id                      修改资料（name；owner/maintainer）
POST   /workspaces/:id/archive              归档（仅 owner，仅 team）→ 204

GET    /workspaces/:id/members              成员列表（成员可见）
POST   /workspaces/:id/invitations          邀请（email + role；owner/maintainer）→ 202
DELETE /workspaces/:id/invitations/:invId   撤销待邀（owner/maintainer）→ 204
GET    /workspaces/invitations              我收到的待邀列表（按 session 邮箱匹配）
POST   /workspaces/invitations/:id/accept   接受 → 201 membership（重复 accept 幂等返回同一 membership）
POST   /workspaces/invitations/:id/decline  拒绝 → 204

PATCH  /workspaces/:id/members/:userId      变更角色（仅 owner；不得把最后 owner 降级）
DELETE /workspaces/:id/members/:userId      移除成员（owner/maintainer；owner 不可被移除）
POST   /workspaces/:id/leave                主动退出（owner 须先转让）→ 204
POST   /workspaces/:id/transfer             转让所有权（仅 owner；body: newOwnerId）
```

合同要点（对照 api-contract skill）：

- **越权**：所有 `:id` 端点第一行解析"当前用户是否为该 workspace 成员"，非成员一律 404（不泄露空间存在性）；再判角色，不足 403。2.5 将此抽成统一守卫。
- **幂等**：accept 幂等（唯一约束兜底）；POST /workspaces 创建非幂等但低风险（重复点击产生两个空间，与 GitHub 一致的可接受行为）。
- **长任务/事件**：本任务无长任务；不新增领域事件（事件体系随 1B 落地）。
- 审计挂接点：每个写 handler 标注 `// audit(2.6): workspace.<action>`，2.6 统一接线。

## 7. 错误处理

错误响应沿用 P1A-3 `{ error: { code, message } }` 形态（code 命名沿用 P1A-3 SCREAMING_SNAKE 约定）：

| code | HTTP | 场景 |
|---|---|---|
| `SESSION_INVALID` | 401 | 无有效 session（沿用 P1A-3） |
| `VALIDATION_ERROR` | 400 | zod 校验失败（邮箱格式、非法 role、newOwnerId 非成员等） |
| `FORBIDDEN` | 403 | 是成员但角色不足 |
| `WORKSPACE_NOT_FOUND` | 404 | 空间不存在或非成员；邀请 accept/decline 枚举面统一 404 |
| `ALREADY_MEMBER` | 409 | 受邀邮箱已是成员 |
| `INVITATION_PENDING_EXISTS` | 409 | 同邮箱已有待邀 |
| `LAST_OWNER` | 409 | 操作会破坏"至少一个 owner"不变量 |
| `PERSONAL_WORKSPACE` | 409 | 对 personal 空间执行禁止操作 |
| `WORKSPACE_ARCHIVED` | 409 | 对已归档空间执行写操作 |

## 8. 测试策略

**单测（本机门禁）**：

- `packages/domain`：fake Prisma（复用 `packages/auth` 测试的 fake 模式）——personal 自动创建（含重复调用幂等）、5.2 三条不变量各自拒绝路径、邀请状态机全迁移、转让事务三步、并发双 accept 的 unique 冲突转幂等成功、`last_owner` 防护、过期惰性判定。
- `apps/api`：路由级单测（fake domain）——401/403/404/409 映射、zod 拒绝、session 邮箱与邀请邮箱不匹配 → 404。

**集成测试（留阿里云，与 2.2/2.3 集成测试一并执行）**：

- `apps/api/test/workspaces.integration.test.ts`：真实 PG 核心闭环——验证邮箱 → 自动拥有 personal 空间 → 建 team → 邀请 → accept → 变更角色 → 转让 → 退出；跨 workspace 越权负向用例（用户 B 访问 A 的空间 → 404）；真实并发双 accept（断言恰好一个 membership）。
- 迁移验证：云上 deploy → rollback → redeploy（沿用 P1A-2 迁移纪律）。

**门禁与状态纪律**：build/typecheck/lint/test + audit:* + docs:lint 全绿；task-master 2.4 按 test-gate 纪律保持 pending，云上集成测试全绿后才置 done（同 2.2/2.3）。

## 9. 风险与已知缺口

- **审计缺口**：本任务写操作不产生 AuditLog 行（表归 2.6），已留挂接点注释；2.6 落地后需回填检查本任务全部写路径已接线。
- **auth 包改动面**：`verifyEmail` 增加可选回调为向后兼容改动，既有 59 单测须保持全绿。
- **迁移顺序**：迁移 3 依赖迁移 2 的 `users` 表，云上 deploy 顺序由 migrate-cli 保证。
