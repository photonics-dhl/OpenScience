# P1A-6 统一错误、日志、配置与审计底座 — Design Spec

- 日期：2026-08-01
- 关联：task-master 2.6；Spec（Baseline v1.0）§17 MUST（审计日志、密钥管理、日志脱敏）
- 状态：design gate 四节已逐节确认（2026-08-01）

## 0. 范围

一个 P1A-6 覆盖四块：统一错误、结构化日志（含脱敏）、集中配置、AuditLog 审计。
不做：CORS/CSRF/rate-limit（2.8）、storage 的 S3 env 收敛、全局错误类层级、审计 UI。

## 1. 总体架构

四块落点，沿用现有依赖方向（app → packages，无环）：

- **`packages/config`**（占位 → 实装）：接收 `apps/api/env.ts` 迁入的 `loadApiEnv`；`DEFAULT_DEV_DATABASE_URL` / `DEFAULT_DEV_REDIS_URL` 常量从 database 移入 config 做唯一事实源，database 反向 import（database → config 单向依赖，无环）。storage 的 S3 env 读取保持原样。
- **`packages/observability`**（占位 → 实装）：导出 `createLogger`（封装 fastify 内建 pino）、`redactPaths` 脱敏路径表、统一错误响应 Schema（`ErrorBody` + requestId）、`AuditEvent`/`AuditSink` 审计接口（§3.1）。`apps/api/error-map.ts` 保留（code→HTTP 映射属 app 层），响应体结构以 observability Schema 为准。
- **AuditLog（migration 5）**：新表，只追加。domain 各写操作在同一 `$transaction` 内写审计行；`WorkspaceDeps` 扩展为 `{ prisma, audit? }`——audit 缺省时行为不变（现有测试零改动），api 装配时注入真 sink。AuditSink 接口放 observability（domain → auth 已存在，接口不能放 domain 否则成环）。
- **`GET /admin/audit-logs`**：`platformRole = platform_admin` 守卫（P1A-5 预留字段首个消费方），按 workspaceId / action / actorId / 时间范围过滤 + 游标分页。

新增包依赖边（均指向叶子包，无环，需过 `audit:dep`）：`domain → observability`、`auth → observability`（均 type-only）、`database → observability`、`database → config`。

## 2. 数据模型：AuditLog（migration 5）

只追加，无 `updatedAt`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | String cuid | 主键 |
| `createdAt` | DateTime | 默认 now()，索引 |
| `actorId` | String? | 操作者；匿名/system 为 null |
| `action` | String | 如 `workspace.create`、`auth.login`、`authz.deny`，索引 |
| `workspaceId` | String? | 所属 workspace（auth 类事件为 null），索引 |
| `targetType` / `targetId` | String? | 目标实体（如 `user`/`invitation` + id） |
| `metadata` | Json | 关键上下文字段（写入前已脱敏，见 §4） |
| `requestId` | String? | 与结构化日志 trace id 串联 |
| `ip` | String? | 来源 IP |

迁移放 `infra/migrations/<ts>_audit_log/`，附 `rollback.sql`（惯例）。

## 3. 审计写入机制与覆盖清单

### 3.1 AuditSink 接口（定义在 observability，保持依赖方向）

依赖约束：domain → auth 已存在（`Mailer` 类型），auth 不能再依赖 domain（成环）；domain/auth 也都不依赖 database。故接口放 observability（叶子包，零内部依赖），domain、auth、database 各自 import 类型。

```ts
// packages/observability/src/audit.ts
export interface AuditEvent {
  actorId: string | null;
  action: string;            // 'workspace.create' | 'auth.login' | 'authz.deny' | ...
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;  // 已由调用方脱敏/裁剪
  requestId?: string;
  ip?: string;
}
export interface AuditSink {
  record(event: AuditEvent, tx: Prisma.TransactionClient): Promise<void>;
}
```

- 实现 `prismaAuditSink` 放 `packages/database`（落 AuditLog 表；database → observability 单向，无环）。
- domain 写函数在现有 `$transaction`（无事务的如 `workspace.create` 则包一层）里调用 `deps.audit?.record(...)`——审计行与业务行同生共死；sink throw 则业务回滚。
- `WorkspaceDeps` 加可选 `audit?: AuditSink`；auth-service 函数 deps 同样加可选 `audit`；现有调用方/测试不传则完全无感。
- API 层组装 `requestId`/`ip`（fastify request）经可选尾参 `ctx?: { requestId?: string; ip?: string }` 传入 domain，不破坏现有调用。
- `authz.deny`（workspace-guard 两处挂接点）：守卫拒绝时在 API 层直接调 sink（不经 domain），actorId 取 session 用户（匿名则 null），metadata 记 `{ reason: 'not_member' | 'role_insufficient', requiredAction }`。

### 3.2 覆盖清单（action 命名 `<域>.<动作>`）

- workspace 域（既有 `// audit(2.6)` 挂接点原样接线）：
  `workspace.create` / `workspace.update` / `workspace.archive` /
  `workspace.member.changeRole` / `workspace.member.remove` / `workspace.member.leave` /
  `workspace.transfer` /
  `workspace.invitation.create` / `workspace.invitation.accept` / `workspace.invitation.decline` / `workspace.invitation.revoke`
- auth 域（`auth-service.ts` 写操作）：`auth.register` / `auth.verify` / `auth.resend` / `auth.login`（成功与失败均记，失败 metadata 只记原因码不记密码）/ `auth.logout`
- 拒绝事件：`authz.deny`（workspace-guard 2 处）

### 3.3 metadata 内容原则

只记标识与结果（userId、角色变更 from→to、原因码等）；绝不记密码、验证码、session token 等敏感件——与日志脱敏共用一份敏感字段清单（§4）。

## 4. 结构化日志、脱敏与统一错误

### 4.1 日志

- api 从 `Fastify({ logger: false })` 改为注入 observability 的 `createLogger({ level, redact })`——底层即 fastify 内建 pino，配置集中在 observability 一处，零新依赖。
- 请求级 `requestId`：用 fastify 自带 `req.id`；日志行、AuditLog.requestId、错误响应体三方串联。
- 级别：dev `debug`、prod `info`；500 log error 带 stack，4xx log warn 不带。

### 4.2 脱敏（§17 MUST，双闸）

- pino 原生 `redact.paths`：`req.headers.authorization`、`req.headers.cookie`、`body.password`、`body.code`、`body.token`、`*.accessKey`、`*.secretKey` 等，替换值 `"[Redacted]"`。
- 自定义序列化兜底：身份证样式（18 位/15 位数字+X）、JWT 样式（`eyJ` 三段）、长 hex（≥32）匹配即打码——防业务代码把敏感串塞进任意字段。
- 单测（task-master testStrategy）：构造含密钥/token/身份证样式的字符串过 logger，断言落盘内容已脱敏。

### 4.3 统一错误

- `ErrorBody` Schema 收敛到 observability：`{ error: { code, message, requestId } }`（比现状多 `requestId`，便于报障定位）。
- `apps/api/error-map.ts` 职责不变（AuthError/WorkspaceError/Zod → HTTP 映射），响应体经 observability Schema 构造；`INTERNAL` 分支 message 固定"内部错误"，细节只进日志。
- 不新建全局错误类层级（YAGNI）：现有两个领域错误类 + 映射表够用，后续域照此扩展。

## 5. config 收敛

- `apps/api/env.ts` → `packages/config/src/api-env.ts`：函数、默认值、生产快速失败语义原样搬，仅改导入路径；`apps/api/src/index.ts` 改从 `@openscience/config` 导入。`apps/api/test/env.test.ts` 随同迁到 config 包测试目录，断言不变。
- `DEFAULT_DEV_DATABASE_URL` / `DEFAULT_DEV_REDIS_URL` 移入 config 导出；`packages/database` 改从 config import。
- `.env.example` 核对补全（不读真实 `.env`，仅比对 key 名）。

## 6. admin 查询接口

- `GET /admin/audit-logs`：query `workspaceId?`、`action?`、`actorId?`、`from?`、`to?`（ISO 时间）、`cursor?`、`limit`（默认 50，上限 200；游标分页按 `(createdAt, id)` 倒序）。
- 守卫：session 必需 + `platformRole === 'platform_admin'`，否则 403。响应为审计行本体（metadata 写入时已脱敏，原样返回），不做额外联表。
- 路由 `apps/api/src/routes/admin.ts`，挂 `/admin` 前缀。

## 7. 测试策略（TDD）

- config：env 加载单测（迁入原有用例 + 生产缺 env 快速失败）。
- observability：脱敏过滤器单测（密钥/JWT/身份证样式不落盘）；ErrorBody Schema 单测。
- domain：写操作注入 recording sink，断言审计事件 action/actor/target 正确、与业务同事务（sink throw 时业务回滚）。
- api 集成（云上跑）：任意写路径产生审计行（抽查 `workspace.create` + `auth.login`）；`/admin/audit-logs` 三用例（无 session→401、非 admin→403、admin→200 含过滤生效）；错误响应体含 requestId。
- 全门禁：build / typecheck / lint / test / knip / dep / dup / deps / docs:lint；云上 `test:integration`（跑前必须全量 build，见 AGENTS.md 坑）。

## 8. 与 task-master 2.6 的映射 / 偏离

- 「AuditLog 只追加写入，覆盖 auth/workspace/成员/权限全部写操作」→ §3.2 全覆盖（含 authz.deny，超出原文，design gate 已确认）。
- 「审计查询最小管理员接口（/admin 占位）」→ 实现为真查询接口 + platform_admin 守卫（超出"占位"，design gate 已确认）。
- 「统一错误码/错误响应 Schema」「结构化日志 + 脱敏过滤器」「配置集中读取」→ §4 / §5，无偏离。
