# P1A-6 统一错误、日志、配置与审计底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实装 packages/config 与 packages/observability，落地 AuditLog 表与全部写操作审计（auth/workspace/authz.deny 全覆盖），提供 /admin/audit-logs 查询接口（platform_admin 守卫）。

**Architecture:** AuditSink 接口放 observability（叶子包），prismaAuditSink 实现放 database；domain/auth 写函数在同一 $transaction 内写审计行（deps 可选注入，缺省无感）；日志用 fastify 内建 pino + redact 双闸脱敏；api env 与 dev 常量收敛到 config。

**Tech Stack:** Fastify 5.10 / pino 9.14 / Prisma 5.22 / vitest 2 / pnpm workspace（一律 `npx pnpm@9.15.0`）。

**Spec:** `docs/specs/2026-08-01-p1a-6-audit-observability-design.md`（design gate 四节已确认）

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；不全局安装。
- 本机不做 Docker；集成测试（`*.integration.test.ts`）只在云上跑，且跑前必须云上全量 `build`（AGENTS.md 坑）。
- 所有 git mutation（add/commit/push）逐次用户批准；云上写操作逐次用户确认。
- 不读/打印 `.env`；`.env.example` 只比对 key 名。
- 迁移归 `infra/migrations/<ts>_<name>/`，每个迁移附 `rollback.sql`（格式仿 `20260801010000_user_platform_role`）。
- metadata 只记标识与结果；绝不记密码、验证码、session token（Spec §17）。
- 审计写与业务写同一 `$transaction`；sink throw 则业务回滚（promise reject 传播）。
- 每个 Task 完成后跑对应包 `test` + 根 `typecheck`；Task 9 跑全量门禁。

---

### Task 1: packages/config 实装（api env 迁入 + dev 常量共源）

**Files:**
- Create: `packages/config/src/dev-defaults.ts`
- Create: `packages/config/src/api-env.ts`
- Create: `packages/config/test/api-env.test.ts`
- Create: `packages/config/vitest.config.ts`
- Modify: `packages/config/src/index.ts`（替换占位）
- Modify: `packages/config/package.json`
- Modify: `packages/database/src/client.ts:1`、`packages/database/src/redis.ts`、`packages/database/src/migrate-cli.ts`（导入来源）
- Modify: `packages/database/src/index.ts`（移除 dev-defaults 导出）
- Modify: `packages/database/package.json`（+config 依赖）
- Delete: `packages/database/src/dev-defaults.ts`
- Delete: `apps/api/src/env.ts`、`apps/api/test/env.test.ts`（迁入 config）
- Modify: `apps/api/src/index.ts:5`（导入来源）
- Modify: `apps/api/package.json`（+config 依赖）

**Interfaces:**
- Produces: `@openscience/config` 导出 `DEFAULT_DEV_DATABASE_URL`、`DEFAULT_DEV_REDIS_URL`、`loadApiEnv(env?)`、`ApiEnv`——签名与现 `apps/api/src/env.ts` 完全一致。
- Consumes: 无（首个任务）。

- [ ] **Step 1: 迁移失败测试**

把 `apps/api/test/env.test.ts` 原样移到 `packages/config/test/api-env.test.ts`，只改导入行为：

```ts
import { loadApiEnv } from '../src/api-env';
```

Run: `npx pnpm@9.15.0 --filter @openscience/config test`
Expected: FAIL（`../src/api-env` 不存在）

- [ ] **Step 2: 实装 config 包**

`packages/config/src/dev-defaults.ts`（从 database 原样搬）：

```ts
// 开发态默认值（本机 docker-compose.dev.yml 专用，非真实密钥）。
export const DEFAULT_DEV_DATABASE_URL =
  'postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience';
export const DEFAULT_DEV_REDIS_URL = 'redis://127.0.0.1:6379';
```

`packages/config/src/api-env.ts`：现 `apps/api/src/env.ts` 全文原样搬，仅首行改为 `import { DEFAULT_DEV_DATABASE_URL, DEFAULT_DEV_REDIS_URL } from './dev-defaults';`

`packages/config/src/index.ts`（替换占位）：

```ts
export { DEFAULT_DEV_DATABASE_URL, DEFAULT_DEV_REDIS_URL } from './dev-defaults';
export { loadApiEnv, type ApiEnv } from './api-env';
```

`packages/config/vitest.config.ts`（与 domain 同款）：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
  },
});
```

`packages/config/package.json` scripts 加 `"test": "vitest run"`，devDependencies 加 `"@types/node": "20.14.10"`、`"vitest": "2"`。

- [ ] **Step 3: 切换全部消费方**

- `packages/database/src/client.ts:2` → `import { DEFAULT_DEV_DATABASE_URL } from '@openscience/config';`
- `packages/database/src/redis.ts`、`migrate-cli.ts` 同样改为从 `@openscience/config` 导入。
- `packages/database/src/index.ts` 删除 dev-defaults 那行导出；删除 `packages/database/src/dev-defaults.ts`。
- `packages/database/package.json` dependencies 加 `"@openscience/config": "workspace:^"`。
- `apps/api/src/index.ts:5` → `import { loadApiEnv } from '@openscience/config';`；删除 `apps/api/src/env.ts`。
- `apps/api/package.json` dependencies 加 `"@openscience/config": "workspace:^"`。
- 先 `grep -rn "dev-defaults\|from './env'\|from '../src/env'" --include=*.ts packages apps` 确认无遗漏引用，再删文件。

- [ ] **Step 4: 接线并全量验证**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 test`
Expected: 全绿（含 config 新测试 5 用例左右）；knip 若报 `DEFAULT_DEV_*` 未用属预期外——database 内部仍消费。

- [ ] **Step 5: 核对 .env.example**

`grep -oE '^[A-Z_]+' .env.example | sort` 与 `loadApiEnv` 读取的 key（NODE_ENV/DATABASE_URL/REDIS_URL/COOKIE_SECRET/PORT/SECURE_COOKIES）比对，缺则补 key 名（不填真实值）。

- [ ] **Step 6: Commit（需用户批准）**

```bash
git add packages/config packages/database apps/api
git commit -m "refactor(config): 收敛 api env 与 dev 常量至 packages/config（P1A-6 Task 1）"
```

---

### Task 2: observability 结构化日志 + 脱敏

**Files:**
- Create: `packages/observability/src/logger.ts`
- Create: `packages/observability/test/logger.test.ts`
- Create: `packages/observability/vitest.config.ts`
- Modify: `packages/observability/src/index.ts`（替换占位）
- Modify: `packages/observability/package.json`（+pino 依赖、test 脚本）

**Interfaces:**
- Produces: `createLogger(opts?: { level?: string; base?: Record<string, unknown>; destination?: NodeJS.WritableStream }): pino.Logger`；`REDACT_PATHS: string[]`；`redactSensitiveString(s: string): string`；`sanitizeValue(v: unknown): unknown`。
- Consumes: pino 9.14.0（lockfile 已有，随 fastify 引入）。

- [ ] **Step 1: 写失败测试**

`packages/observability/test/logger.test.ts`：

```ts
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, redactSensitiveString, sanitizeValue } from '../src/logger';

function capture(): { stream: Writable; lines: () => string } {
  let buf = '';
  const stream = new Writable({ write(chunk, _enc, cb) { buf += String(chunk); cb(); } });
  return { stream, lines: () => buf };
}

describe('createLogger 脱敏（Spec §17 MUST）', () => {
  it('redact.paths：password/token/cookie 字段不落盘', () => {
    const { stream, lines } = capture();
    const log = createLogger({ destination: stream });
    log.info({ body: { password: 'secret-pw', code: '123456' }, req: { headers: { cookie: 'os_session=abc', authorization: 'Bearer x' } } }, 'login');
    const out = lines();
    expect(out).not.toContain('secret-pw');
    expect(out).not.toContain('os_session=abc');
    expect(out).toContain('[Redacted]');
  });

  it('兜底序列化：JWT/身份证/长 hex 样式字符串打码', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    expect(redactSensitiveString(`tok=${jwt}`)).not.toContain('SflKxw');
    expect(redactSensitiveString('id 11010119900307777X')).toBe('id [Redacted]');
    expect(redactSensitiveString('hex a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe('hex [Redacted]');
    expect(redactSensitiveString('hello world')).toBe('hello world');
  });

  it('sanitizeValue 递归处理嵌套对象与数组', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    const out = sanitizeValue({ a: [jwt, { b: '11010119900307777X' }], c: 1 }) as { a: unknown[]; c: number };
    expect(JSON.stringify(out)).not.toContain('SflKxw');
    expect(JSON.stringify(out)).not.toContain('11010119900307777X');
    expect(out.c).toBe(1);
  });

  it('日志行含 level/time/msg 基础字段', () => {
    const { stream, lines } = capture();
    createLogger({ destination: stream, level: 'debug' }).info('hello');
    const row = JSON.parse(lines()) as { level: number; msg: string; time: number };
    expect(row.msg).toBe('hello');
    expect(row.time).toBeTypeOf('number');
  });
});
```

Run: `npx pnpm@9.15.0 --filter @openscience/observability test`
Expected: FAIL（`../src/logger` 不存在）

- [ ] **Step 2: 实装 logger**

`packages/observability/src/logger.ts`：

```ts
import { pino, type Logger, type LoggerOptions } from 'pino';

/** pino/fast-redact 路径表（第一闸）：已知敏感字段整体替换。 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'body.password',
  'body.code',
  'body.token',
  '*.password',
  '*.passwordHash',
  '*.codeHash',
  '*.sessionToken',
  '*.accessKey',
  '*.secretKey',
];

const SENSITIVE_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
  /\b\d{17}[\dXx]\b/g, // 身份证 18 位
  /\b\d{15}\b/g, // 身份证 15 位
  /\b[0-9a-fA-F]{32,}\b/g, // 长 hex（token/secret 样式）
];

/** 第二闸：任意字符串值中的敏感样式打码（防业务代码把密钥塞进任意字段）。 */
export function redactSensitiveString(input: string): string {
  let out = input;
  for (const pattern of SENSITIVE_PATTERNS) out = out.replace(pattern, '[Redacted]');
  return out;
}

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeValue(v);
    return out;
  }
  return value;
}

export interface CreateLoggerOptions {
  level?: string;
  base?: Record<string, unknown>;
  /** 测试注入捕获流；缺省 pino 默认 stdout。 */
  destination?: NodeJS.WritableStream;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const opts: LoggerOptions = {
    level: options.level ?? 'info',
    base: options.base ?? {},
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    formatters: { log: (obj) => sanitizeValue(obj) as Record<string, unknown> },
  };
  return options.destination ? pino(opts, options.destination) : pino(opts);
}
```

`packages/observability/src/index.ts`（替换占位）：

```ts
export { createLogger, REDACT_PATHS, redactSensitiveString, sanitizeValue, type CreateLoggerOptions } from './logger';
```

`packages/observability/package.json`：dependencies 加 `"pino": "9.14.0"`；scripts 加 `"test": "vitest run"`；devDependencies 加 `"@types/node": "20.14.10"`、`"vitest": "2"`。`vitest.config.ts` 同 Task 1 模板。

- [ ] **Step 3: 验证**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 --filter @openscience/observability test && npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck`
Expected: 4 用例全绿，build/typecheck exit 0

- [ ] **Step 4: Commit（需用户批准）**

```bash
git add packages/observability pnpm-lock.yaml
git commit -m "feat(observability): pino 结构化日志 + 双闸脱敏（P1A-6 Task 2）"
```

---

### Task 3: 统一错误 Schema + requestId 串联

**Files:**
- Create: `packages/observability/src/errors.ts`
- Create: `packages/observability/test/errors.test.ts`
- Modify: `packages/observability/src/index.ts`（+导出）
- Modify: `apps/api/src/error-map.ts`（全文替换）
- Modify: `apps/api/src/app.ts:15-18`（handler 传 requestId + 日志）
- Modify: `apps/api/src/routes/workspace-guard.ts:8-9,36,40`（静态 body → buildErrorBody）
- Modify: `apps/api/test/error-map.test.ts`（断言加 requestId）
- Modify: `apps/api/package.json`（+observability 依赖）

**Interfaces:**
- Produces: `buildErrorBody(code: string, message: string, requestId?: string): ErrorBody`；`ErrorBody = { error: { code: string; message: string; requestId?: string } }`；`httpStatusForError(err: unknown, requestId?: string): { status: number; body: ErrorBody }`。
- Consumes: Task 2 的 logger（app.ts handler 用 `req.log`）。

- [ ] **Step 1: 写失败测试**

`packages/observability/test/errors.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildErrorBody } from '../src/errors';

describe('buildErrorBody', () => {
  it('带 requestId 时三方串联字段落响应体', () => {
    expect(buildErrorBody('FORBIDDEN', '权限不足', 'req-1')).toEqual({
      error: { code: 'FORBIDDEN', message: '权限不足', requestId: 'req-1' },
    });
  });
  it('缺省 requestId 不产出该字段', () => {
    expect(buildErrorBody('INTERNAL', '内部错误')).toEqual({ error: { code: 'INTERNAL', message: '内部错误' } });
  });
});
```

`apps/api/test/error-map.test.ts` 既有 `toEqual({ error: { code, message } })` 断言改为传入 requestId 的新签名断言，例如：

```ts
const { body } = httpStatusForError(new AuthError('CODE_INVALID', '验证码错误或已失效'), 'req-9');
expect(body).toEqual({ error: { code: 'CODE_INVALID', message: '验证码错误或已失效', requestId: 'req-9' } });
```

Run: `npx pnpm@9.15.0 --filter @openscience/observability --filter @openscience/api test`
Expected: FAIL（`../src/errors` 不存在 / 签名不符）

- [ ] **Step 2: 实装**

`packages/observability/src/errors.ts`：

```ts
export interface ErrorBody {
  error: { code: string; message: string; requestId?: string };
}

/** 统一错误响应体（Spec §17）：requestId 与日志行、AuditLog.requestId 三方串联。 */
export function buildErrorBody(code: string, message: string, requestId?: string): ErrorBody {
  return { error: { code, message, ...(requestId ? { requestId } : {}) } };
}
```

`packages/observability/src/index.ts` 追加：

```ts
export { buildErrorBody, type ErrorBody } from './errors';
```

`apps/api/src/error-map.ts`：`httpStatusForError(err: unknown, requestId?: string)`，三处 body 构造改 `buildErrorBody(code, message, requestId)`；`ErrorBody` 改为从 `@openscience/observability` re-export。映射表（AUTH_ERROR_HTTP / WORKSPACE_ERROR_HTTP / Zod / INTERNAL）不动。

`apps/api/src/app.ts:15-18`：

```ts
app.setErrorHandler((err, req, reply) => {
  const { status, body } = httpStatusForError(err, String(req.id));
  if (status >= 500) req.log.error({ err }, 'unhandled error');
  else req.log.warn({ err: { code: body.error.code } }, 'request rejected');
  void reply.status(status).send(body);
});
```

`apps/api/src/routes/workspace-guard.ts`：删除 `NOT_FOUND_BODY`/`FORBIDDEN_BODY` 常量，两处 send 改：

```ts
return reply.status(404).send(buildErrorBody('WORKSPACE_NOT_FOUND', '空间不存在', String(req.id)));
// ...
return reply.status(403).send(buildErrorBody('FORBIDDEN', '权限不足', String(req.id)));
```

（`buildErrorBody` 从 `@openscience/observability` 导入；`apps/api/package.json` dependencies 加 `"@openscience/observability": "workspace:^"`。）

- [ ] **Step 3: 验证**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 build && npx pnpm@9.15.0 test`
Expected: 全绿（api 34 + observability 新增用例）

- [ ] **Step 4: Commit（需用户批准）**

```bash
git add packages/observability apps/api pnpm-lock.yaml
git commit -m "feat(api): 统一错误响应体 + requestId 三方串联（P1A-6 Task 3）"
```

---

### Task 4: AuditLog 表（migration 5）+ prismaAuditSink

**Files:**
- Modify: `infra/schema.prisma`（+AuditLog model，追加到文件尾）
- Create: `infra/migrations/20260801143000_audit_log/migration.sql`
- Create: `infra/migrations/20260801143000_audit_log/rollback.sql`
- Create: `packages/observability/src/audit.ts`
- Modify: `packages/observability/src/index.ts`（+导出）
- Create: `packages/database/src/audit-sink.ts`
- Create: `packages/database/test/audit-sink.test.ts`
- Modify: `packages/database/src/index.ts`（+导出）
- Modify: `packages/database/package.json`（+observability 依赖）

**Interfaces:**
- Produces:
  - `interface AuditEvent { actorId: string | null; action: string; workspaceId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; requestId?: string; ip?: string }`
  - `interface AuditContext { requestId?: string; ip?: string }`
  - `interface AuditSink { record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> }`
  - `createPrismaAuditSink(client: PrismaClient): AuditSink`
- Consumes: Task 2/3 的 observability 包。

- [ ] **Step 1: 写失败测试**

`packages/database/test/audit-sink.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPrismaAuditSink } from '../src/audit-sink';

function stub() {
  const create = vi.fn().mockResolvedValue({});
  return { create, client: { auditLog: { create } } as never };
}

describe('createPrismaAuditSink', () => {
  it('无 tx 时走持有的 client，字段完整映射', async () => {
    const { create, client } = stub();
    const sink = createPrismaAuditSink(client);
    await sink.record({
      actorId: 'u1', action: 'workspace.create', workspaceId: 'w1',
      targetType: 'workspace', targetId: 'w1', metadata: { name: 'Lab' },
      requestId: 'req-1', ip: '127.0.0.1',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'u1', action: 'workspace.create', workspaceId: 'w1',
        targetType: 'workspace', targetId: 'w1', metadata: { name: 'Lab' },
        requestId: 'req-1', ip: '127.0.0.1',
      },
    });
  });

  it('可选字段缺省 → null / JsonNull；有 tx 优先用 tx', async () => {
    const { create, client } = stub();
    const txCreate = vi.fn().mockResolvedValue({});
    const sink = createPrismaAuditSink(client);
    await sink.record({ actorId: null, action: 'auth.login' }, { auditLog: { create: txCreate } } as never);
    expect(create).not.toHaveBeenCalled();
    expect(txCreate).toHaveBeenCalledWith({
      data: {
        actorId: null, action: 'auth.login', workspaceId: null,
        targetType: null, targetId: null, metadata: expect.anything(),
        requestId: null, ip: null,
      },
    });
  });
});
```

Run: `npx pnpm@9.15.0 --filter @openscience/database test`
Expected: FAIL（`../src/audit-sink` 不存在）

- [ ] **Step 2: observability 审计接口**

`packages/observability/src/audit.ts`：

```ts
import type { Prisma } from '@prisma/client';

export interface AuditEvent {
  actorId: string | null;
  /** `<域>.<动作>`，如 'workspace.create' / 'auth.login' / 'authz.deny'。 */
  action: string;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  /** 已由调用方脱敏/裁剪；绝不记密码、验证码、session token（Spec §17）。 */
  metadata?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
}

/** API 层组装、domain/auth 尾参传入的请求上下文。 */
export interface AuditContext {
  requestId?: string;
  ip?: string;
}

export interface AuditSink {
  /** 有 tx 时审计行与业务行同事务；sink throw 则业务回滚。 */
  record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void>;
}
```

`packages/observability/src/index.ts` 追加：

```ts
export type { AuditContext, AuditEvent, AuditSink } from './audit';
```

`packages/observability/package.json` dependencies 加 `"@prisma/client": "5.22.0"`（type-only）。

- [ ] **Step 3: AuditLog model + migration 5**

`infra/schema.prisma` 文件尾追加：

```prisma
model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")
  actorId     String?  @map("actor_id") @db.Uuid
  action      String
  workspaceId String?  @map("workspace_id") @db.Uuid
  targetType  String?  @map("target_type")
  targetId    String?  @map("target_id")
  metadata    Json?
  requestId   String?  @map("request_id")
  ip          String?

  @@index([action])
  @@index([workspaceId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

（只追加、无 `updatedAt`、无外键关系——actor 可能被逻辑删除，审计行须独立存活。）

`infra/migrations/20260801143000_audit_log/migration.sql`：

```sql
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "workspace_id" UUID,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "request_id" TEXT,
    "ip" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_workspace_id_idx" ON "audit_logs"("workspace_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
```

`infra/migrations/20260801143000_audit_log/rollback.sql`：

```sql
-- Compensation rollback for 20260801143000_audit_log.
DROP TABLE IF EXISTS "audit_logs";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260801143000_audit_log';
```

- [ ] **Step 4: 实装 sink**

`packages/database/src/audit-sink.ts`：

```ts
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuditEvent, AuditSink } from '@openscience/observability';

/** AuditLog 落库实现：有 tx 走 tx（与业务同事务），否则走持有的 client。 */
export function createPrismaAuditSink(client: PrismaClient): AuditSink {
  return {
    async record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void> {
      const db = tx ?? client;
      await db.auditLog.create({
        data: {
          actorId: event.actorId,
          action: event.action,
          workspaceId: event.workspaceId ?? null,
          targetType: event.targetType ?? null,
          targetId: event.targetId ?? null,
          metadata: event.metadata === undefined ? Prisma.JsonNull : (event.metadata as Prisma.InputJsonValue),
          requestId: event.requestId ?? null,
          ip: event.ip ?? null,
        },
      });
    },
  };
}
```

`packages/database/src/index.ts` 追加：

```ts
export { createPrismaAuditSink } from './audit-sink';
```

`packages/database/package.json` dependencies 加 `"@openscience/observability": "workspace:^"`。

- [ ] **Step 5: 验证（generate + 全量）**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 test`
Expected: 全绿（database build 先跑 `prisma generate` 产出 AuditLog 类型；audit-sink 2 用例过）

注：本机无 Docker 不跑 `migrate deploy`；迁移云上执行（Task 9）。

- [ ] **Step 6: Commit（需用户批准）**

```bash
git add infra/schema.prisma infra/migrations packages/observability packages/database pnpm-lock.yaml
git commit -m "feat(database): AuditLog 表（migration 5）+ prismaAuditSink（P1A-6 Task 4）"
```

---

### Task 5: domain 审计接线（11 个 workspace 挂接点）

**Files:**
- Create: `packages/domain/src/workspace/audit.ts`
- Create: `packages/domain/test/workspace-audit.test.ts`
- Modify: `packages/domain/src/workspace/types.ts`（+audit/+AuditContext）
- Modify: `packages/domain/src/workspace/workspaces.ts`（3 处写操作）
- Modify: `packages/domain/src/workspace/members.ts`（4 处写操作）
- Modify: `packages/domain/src/workspace/invitations.ts`（4 处写操作）
- Modify: `packages/domain/package.json`（+observability 依赖）

**Interfaces:**
- Consumes: Task 4 的 `AuditSink`/`AuditEvent`/`AuditContext`。
- Produces: `WorkspaceDeps` 加可选 `audit?: AuditSink`；全部写函数加可选尾参 `ctx: AuditContext = {}`；内部 `recordAudit(deps, tx, event, ctx)`。现有调用方签名零破坏。

- [ ] **Step 1: 写失败测试**

`packages/domain/test/workspace-audit.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditSink } from '@openscience/observability';
import { changeMemberRole, transferOwnership } from '../src/workspace/members';
import { archiveWorkspace, createTeamWorkspace, updateWorkspace } from '../src/workspace/workspaces';
import { inviteMember } from '../src/workspace/invitations';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

function setup() {
  const { prisma, db } = createFakePrisma();
  const events: AuditEvent[] = [];
  const audit: AuditSink = { record: async (e) => { events.push(e); } };
  return { deps: { prisma, mailer: createFakeMailer(), audit }, db, events };
}

const CTX = { requestId: 'req-1', ip: '127.0.0.1' };

describe('workspace 写操作审计（Spec §17 全部写操作）', () => {
  it('workspace.create：审计行含 action/actor/ctx，且随业务产生', async () => {
    const { deps, events } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' }, CTX);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: 'u1', action: 'workspace.create', workspaceId: ws.id,
      targetType: 'workspace', targetId: ws.id, requestId: 'req-1', ip: '127.0.0.1',
    });
  });

  it('workspace.update / archive：targetId 为空间 id', async () => {
    const { deps, events } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    await updateWorkspace(deps, 'u1', ws.id, { name: 'Lab2' }, CTX);
    await archiveWorkspace(deps, 'u1', ws.id, CTX);
    expect(events.map((e) => e.action)).toEqual(['workspace.create', 'workspace.update', 'workspace.archive']);
  });

  it('workspace.member.changeRole：metadata 记 fromRole→toRole', async () => {
    const { deps, db, events } = setup();
    seedUser(db, { id: 'u2', email: 'b@x.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.memberships.push({ id: 'm2', workspaceId: ws.id, userId: 'u2', role: 'author', createdAt: new Date(), updatedAt: new Date() });
    await changeMemberRole(deps, 'u1', ws.id, 'u2', 'reviewer', CTX);
    const ev = events.find((e) => e.action === 'workspace.member.changeRole');
    expect(ev).toMatchObject({ actorId: 'u1', targetType: 'user', targetId: 'u2', metadata: { fromRole: 'author', toRole: 'reviewer' } });
  });

  it('workspace.transfer：metadata 记 newOwnerId', async () => {
    const { deps, db, events } = setup();
    seedUser(db, { id: 'u2', email: 'b@x.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.memberships.push({ id: 'm2', workspaceId: ws.id, userId: 'u2', role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    await transferOwnership(deps, 'u1', ws.id, 'u2', CTX);
    expect(events.find((e) => e.action === 'workspace.transfer')).toMatchObject({ metadata: { newOwnerId: 'u2' } });
  });

  it('workspace.invitation.create：metadata 不含邮箱明文', async () => {
    const { deps, events } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    await inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'new@x.com', role: 'author' }, CTX);
    const ev = events.find((e) => e.action === 'workspace.invitation.create');
    expect(ev).toMatchObject({ targetType: 'invitation' });
    expect(JSON.stringify(ev?.metadata)).not.toContain('new@x.com');
  });

  it('sink throw → 业务操作 reject（同事务语义）', async () => {
    const { prisma } = createFakePrisma();
    const audit: AuditSink = { record: async () => { throw new Error('audit down'); } };
    const deps = { prisma, mailer: createFakeMailer(), audit };
    await expect(createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' })).rejects.toThrow('audit down');
  });

  it('audit 缺省：行为与现状完全一致（零审计零报错）', async () => {
    const { prisma, db } = createFakePrisma();
    const deps = { prisma, mailer: createFakeMailer() };
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    expect(db.workspaces).toHaveLength(1);
    expect(ws.role).toBe('owner');
  });
});
```

（`seedUser` 签名以 `test/helpers/fakes.ts` 现有导出为准；invitation 其余动作 accept/decline/revoke 与 members.remove/leave 同模式补用例——每动作至少断言 action 名与 actorId。）

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: FAIL（deps.audit 未接线 / createTeamWorkspace 无第三参）

- [ ] **Step 2: types + recordAudit helper**

`packages/domain/src/workspace/types.ts`：

```ts
import type { PrismaClient } from '@prisma/client';
import type { Mailer } from '@openscience/auth';
import type { AuditSink } from '@openscience/observability';

export interface WorkspaceDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
  /** P1A-6 审计：缺省则不记录（现有测试/调用零影响）。 */
  audit?: AuditSink;
}

export function now(deps: WorkspaceDeps): Date {
  return deps.now ? deps.now() : new Date();
}
```

`packages/domain/src/workspace/audit.ts`：

```ts
import type { Prisma } from '@prisma/client';
import type { AuditContext, AuditEvent } from '@openscience/observability';
import type { WorkspaceDeps } from './types';

/** 在业务事务内写审计行；ctx 由 API 层组装（requestId/ip）。audit 缺省为 no-op。 */
export async function recordAudit(
  deps: WorkspaceDeps,
  tx: Prisma.TransactionClient,
  event: Omit<AuditEvent, 'requestId' | 'ip'>,
  ctx: AuditContext,
): Promise<void> {
  await deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip }, tx);
}
```

`packages/domain/package.json` dependencies 加 `"@openscience/observability": "workspace:^"`。

- [ ] **Step 3: workspaces.ts 三处接线**

每个写函数签名加尾参 `ctx: AuditContext = {}`（`AuditContext` 从 `@openscience/observability` import type），删 `// audit(2.6)` 注释，改为：

`createTeamWorkspace`（包一层事务）：

```ts
const ws = await deps.prisma.$transaction(async (tx) => {
  const created = await tx.workspace.create({
    data: { type: 'team', name, ownerId: input.userId, members: { create: { userId: input.userId, role: 'owner' } } },
  });
  await recordAudit(deps, tx, {
    actorId: input.userId, action: 'workspace.create', workspaceId: created.id,
    targetType: 'workspace', targetId: created.id, metadata: { name },
  }, ctx);
  return created;
});
```

`updateWorkspace`（现有一次 `prisma.workspace.update`，包事务）：

```ts
const updated = await deps.prisma.$transaction(async (tx) => {
  const u = await tx.workspace.update({ where: { id: workspaceId }, data: { name } });
  await recordAudit(deps, tx, {
    actorId: userId, action: 'workspace.update', workspaceId,
    targetType: 'workspace', targetId: workspaceId, metadata: { name },
  }, ctx);
  return u;
});
```

（返回值按现函数原有组装逻辑沿用，仅数据源从 `deps.prisma` 换 `tx`。）

`archiveWorkspace` 同模式：metadata 省略（无关键字段），`metadata: { status: 'archived' }`。

- [ ] **Step 4: members.ts 四处接线**

- `changeMemberRole`：`update` 包事务；event `{ actorId: userId, action: 'workspace.member.changeRole', workspaceId, targetType: 'user', targetId: targetUserId, metadata: { fromRole: target.role, toRole: newRole } }`。
- `removeMember`：`delete` 包事务；`metadata: { role: target.role }`，targetId targetUserId。
- `leaveWorkspace`：`delete` 包事务；`metadata: { role: membership.role }`，actorId/targetId 均 userId。
- `transferOwnership`：现有 `$transaction` 内三步后追加 `recordAudit(deps, tx, { actorId: userId, action: 'workspace.transfer', workspaceId, targetType: 'user', targetId: newOwnerId, metadata: { newOwnerId } }, ctx)`。

- [ ] **Step 5: invitations.ts 四处接线**

- `inviteMember`：`workspaceInvitation.create` 包事务（mailer.send 留事务外，与现状一致）；event `{ actorId: userId, action: 'workspace.invitation.create', workspaceId: input.workspaceId, targetType: 'invitation', targetId: inv.id, metadata: { role: input.role } }`（不含邮箱明文）。
- `acceptInvitation`：现有 `$transaction` 内 upsert 成功后 `recordAudit(..., { actorId: user.userId, action: 'workspace.invitation.accept', workspaceId: inv.workspaceId, targetType: 'invitation', targetId: inv.id, metadata: { role: inv.role } }, ctx)`。
- `declineInvitation` / `revokeInvitation`：`updateMany` 包事务，count===1 后记录；action 分别为 `workspace.invitation.decline` / `workspace.invitation.revoke`；revoke 的 actorId 为操作者 userId、decline 为受邀者 user.userId。

- [ ] **Step 6: 验证**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 build && npx pnpm@9.15.0 --filter @openscience/domain test && npx pnpm@9.15.0 test`
Expected: domain 新审计用例全绿；既有 116 单测零回归（audit 缺省路径）

- [ ] **Step 7: Commit（需用户批准）**

```bash
git add packages/domain pnpm-lock.yaml
git commit -m "feat(domain): workspace 写操作审计接线 11 处（P1A-6 Task 5）"
```

---

### Task 6: auth 审计接线（register/verify/resend/login/logout）

**Files:**
- Create: `packages/auth/test/auth-audit.test.ts`
- Modify: `packages/auth/src/auth-service.ts`（AuthDeps + 5 函数）
- Modify: `packages/auth/package.json`（+observability 依赖）

**Interfaces:**
- Consumes: Task 4 的 `AuditSink`/`AuditContext`。
- Produces: `AuthDeps` 加可选 `audit?: AuditSink`；`register/verifyEmail/resendCode/login/logout` 加可选尾参 `ctx: AuditContext = {}`。

- [ ] **Step 1: 写失败测试**

`packages/auth/test/auth-audit.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { AuditEvent, AuditSink } from '@openscience/observability';
import { login, register } from '../src/auth-service';
// fakes 以 packages/auth/test/helpers 现有导出为准（createFakePrisma/createFakeRedis/createFakeMailer/seedInvitation 等）
import { createFakeMailer, createFakePrisma, createFakeRedis, seedInvitation } from './helpers/fakes';

function setup() {
  const { prisma, db } = createFakePrisma();
  const events: AuditEvent[] = [];
  const audit: AuditSink = { record: async (e) => { events.push(e); } };
  const deps = { prisma, redis: createFakeRedis(), mailer: createFakeMailer(), audit };
  return { deps, db, events };
}

describe('auth 写操作审计', () => {
  it('auth.register：成功注册记录 actorId=userId', async () => {
    const { deps, db, events } = setup();
    seedInvitation(db, { code: 'INV-1' });
    const r = await register(deps, { invitationCode: 'INV-1', email: 'a@x.com', password: 'pw-123456', displayName: 'A' }, { requestId: 'req-1' });
    expect(events[0]).toMatchObject({ actorId: r.userId, action: 'auth.register', targetType: 'user', targetId: r.userId, requestId: 'req-1' });
  });

  it('auth.login 失败（密码错误）：actorId 已知、metadata 只记原因码', async () => {
    const { deps, db, events } = setup();
    seedInvitation(db, { code: 'INV-1' });
    await register(deps, { invitationCode: 'INV-1', email: 'a@x.com', password: 'pw-123456', displayName: 'A' });
    // 直接注入 email_verified 用户再登录失败（或用 verifyEmail 走通；按 fakes 能力取简）
    await expect(login(deps, { email: 'a@x.com', password: 'wrong-pw' })).rejects.toMatchObject({ code: 'CREDENTIALS_INVALID' });
    const ev = events.find((e) => e.action === 'auth.login');
    expect(ev?.metadata).toEqual({ reason: 'credentials_invalid' });
    expect(JSON.stringify(ev)).not.toContain('wrong-pw');
  });

  it('auth.login 失败（邮箱不存在）：actorId=null，不含邮箱明文', async () => {
    const { deps, events } = setup();
    await expect(login(deps, { email: 'ghost@x.com', password: 'x' })).rejects.toMatchObject({ code: 'CREDENTIALS_INVALID' });
    const ev = events.find((e) => e.action === 'auth.login');
    expect(ev?.actorId).toBeNull();
    expect(JSON.stringify(ev)).not.toContain('ghost@x.com');
  });

  it('auth.login 成功 / auth.logout：均留审计行', async () => {
    const { deps, events } = setup();
    // …走通 register+verify 后 login 成功（复用既有 auth-service.test.ts 的通路写法）
    // 断言 events 末尾依次出现 auth.login（无 metadata.reason）与 auth.logout
  });

  it('audit 缺省：现有行为零影响', async () => {
    const { prisma } = createFakePrisma();
    const deps = { prisma, redis: createFakeRedis(), mailer: createFakeMailer() };
    seedInvitation((createFakePrisma as never as { db: never }).db, { code: 'X' }); // 按 fakes 实际写法调整
    // 至少调用一次 login 失败路径不抛审计相关错误
    await expect(login(deps, { email: 'g@x.com', password: 'x' })).rejects.toMatchObject({ code: 'CREDENTIALS_INVALID' });
  });
});
```

（注：seed 辅助函数的确切名称/签名以实现时读 `packages/auth/test/helpers/fakes.ts` 为准；上面标注处允许微调，断言语义不变。）

Run: `npx pnpm@9.15.0 --filter @openscience/auth test`
Expected: FAIL（audit 未接线）

- [ ] **Step 2: AuthDeps + 接线**

`packages/auth/package.json` dependencies 加 `"@openscience/observability": "workspace:^"`。

`auth-service.ts`：`AuthDeps` 加 `audit?: AuditSink;`（import type from `@openscience/observability`）。模块内加 helper：

```ts
async function recordAuth(
  deps: AuthDeps,
  event: Omit<AuditEvent, 'requestId' | 'ip'>,
  ctx: AuditContext,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  await deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip }, tx);
}
```

各函数（尾参 `ctx: AuditContext = {}`）：

- `register`：`$transaction` 内 `redeemed.count === 1` 校验后、`return created` 前：`recordAuth(deps, { actorId: created.id, action: 'auth.register', targetType: 'user', targetId: created.id }, ctx, tx)`。
- `verifyEmail`：`$transaction` 内 `onEmailVerified` 之后：`recordAuth(deps, { actorId: u.id, action: 'auth.verify', targetType: 'user', targetId: u.id }, ctx, tx)`。
- `resendCode`：`issueVerificationCode` 之后：`recordAuth(deps, { actorId: user.id, action: 'auth.resend', targetType: 'user', targetId: user.id }, ctx)`（静默 return 路径不记）。
- `login`：
  - 用户不存在：`recordAuth(deps, { actorId: null, action: 'auth.login', metadata: { reason: 'credentials_invalid' } }, ctx)`（throw 前）。
  - 密码错误：`recordAuth(deps, { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, metadata: { reason: 'credentials_invalid' } }, ctx)`。
  - 状态不可用：`metadata: { reason: 'account_not_active' }`。
  - 成功：`recordAuth(deps, { actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id }, ctx)`。
- `logout`：先 `resolveSession(deps.redis, sessionToken)` 取 userId，`destroySession` 后 `recordAuth(deps, { actorId: session.userId, action: 'auth.logout', targetType: 'user', targetId: session.userId }, ctx)`。

- [ ] **Step 3: 验证**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 build && npx pnpm@9.15.0 --filter @openscience/auth test && npx pnpm@9.15.0 test`
Expected: auth 新用例全绿；既有用例零回归

- [ ] **Step 4: Commit（需用户批准）**

```bash
git add packages/auth pnpm-lock.yaml
git commit -m "feat(auth): register/verify/resend/login/logout 审计接线（P1A-6 Task 6）"
```

---

### Task 7: API 装配（logger / ctx 传递 / authz.deny 接线）

**Files:**
- Modify: `apps/api/src/app.ts`（BuildAppOptions + Fastify logger + admin 挂载点注释更新）
- Modify: `apps/api/src/index.ts`（createLogger + createPrismaAuditSink 装配）
- Modify: `apps/api/src/routes/auth.ts`（5 条写路由传 ctx）
- Modify: `apps/api/src/routes/workspaces.ts`（写路由传 ctx；读路由不传）
- Modify: `apps/api/src/routes/workspace-guard.ts`（authz.deny 两处接线）
- Modify: `apps/api/test/workspace-guard.test.ts`（+deny 审计断言）
- Modify: `apps/api/test/workspace-routes.test.ts`（+写路由审计冒烟）

**Interfaces:**
- Consumes: Task 5/6 的 deps.audit 与 ctx 尾参；Task 2 的 `createLogger`；Task 4 的 `createPrismaAuditSink`。
- Produces: `BuildAppOptions` 加可选 `logger?: Logger`（pino）与 `audit?: AuditSink`——测试不传则与现状一致。

- [ ] **Step 1: 写失败测试**

`apps/api/test/workspace-guard.test.ts` 追加（复用该文件既有 setup 模式）：

```ts
it('viewer PATCH → 403 且记录 authz.deny（role_insufficient）', async () => {
  // …沿用既有 viewer 会员 setup，deps 注入 recording audit
  // 断言 status 403，且 events[0] 匹配：
  // { actorId: viewerId, action: 'authz.deny', workspaceId, requestId: 非空,
  //   metadata: { reason: 'role_insufficient', requiredAction: 'workspace.update' } }
});

it('非成员 → 404 且记录 authz.deny（not_member）', async () => {
  // metadata: { reason: 'not_member', requiredAction: 'workspace.update' }
});
```

`apps/api/test/workspace-routes.test.ts` 追加：

```ts
it('POST /workspaces 成功 → domain 审计事件经 deps.audit 流出（含 requestId）', async () => {
  // recording audit + 已登录用户 POST /workspaces { name: 'Lab' }
  // 断言 events 含 { action: 'workspace.create', actorId: userId, requestId: 非空字符串 }
});
```

Run: `npx pnpm@9.15.0 --filter @openscience/api test`
Expected: FAIL（audit 未接线 / ctx 未传）

- [ ] **Step 2: app.ts 装配**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import type { Logger } from 'pino';
import { httpStatusForError } from './error-map';
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth';
import { registerWorkspaceRoutes } from './routes/workspaces';

export interface BuildAppOptions extends AuthRouteDeps {
  cookieSecret: string;
  /** P1A-6：注入结构化 logger；缺省关闭（测试现状）。 */
  logger?: Logger;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  // …其余不变（opts 已含 audit，经 AuthRouteDeps → AuthDeps 自动流入各路由）
}
```

（`pino` 需进 `apps/api/package.json` dependencies：`"pino": "9.14.0"`——仅 type import，但 fastify 类型对齐需要。）

- [ ] **Step 3: 路由传 ctx**

`apps/api/src/routes/auth.ts`：文件级加 helper 并改 5 条写路由：

```ts
import type { FastifyRequest } from 'fastify';
import type { AuditContext } from '@openscience/observability';

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}
```

- `register(deps, body)` → `register(deps, body, auditCtx(req))`
- `verifyEmail(deps, body)` → 同上；`resendCode` / `login` 同。
- `logout`：`if (token) await logout(deps, token, auditCtx(req));`

`apps/api/src/routes/workspaces.ts`：同款 `auditCtx` helper；写路由（POST `/`、PATCH `/:id`、DELETE/archive、members/invitations 全部写端点）调 domain 时加尾参 `auditCtx(req)`；读路由（GET）不传。

- [ ] **Step 4: workspace-guard authz.deny 接线**

`apps/api/src/routes/workspace-guard.ts` 两处（Task 3 已改为 buildErrorBody，此处在其前插审计）：

```ts
if (!workspace || !membership) {
  await deps.audit?.record({
    actorId: user.userId, action: 'authz.deny', workspaceId: workspace ? id : null,
    metadata: { reason: 'not_member', requiredAction: action },
    requestId: String(req.id), ip: req.ip,
  });
  return reply.status(404).send(buildErrorBody('WORKSPACE_NOT_FOUND', '空间不存在', String(req.id)));
}
if (!can(membership.role, action)) {
  await deps.audit?.record({
    actorId: user.userId, action: 'authz.deny', workspaceId: id,
    metadata: { reason: 'role_insufficient', requiredAction: action },
    requestId: String(req.id), ip: req.ip,
  });
  return reply.status(403).send(buildErrorBody('FORBIDDEN', '权限不足', String(req.id)));
}
```

- [ ] **Step 5: index.ts 生产装配**

```ts
import { createLogger } from '@openscience/observability';
import { createPrismaAuditSink, createPrismaClient, createRedisClient } from '@openscience/database';
// …
const logger = createLogger({ level: env.nodeEnv === 'production' ? 'info' : 'debug' });
const app = await buildApp({
  prisma, redis, mailer,
  audit: createPrismaAuditSink(prisma),
  onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
  cookieSecret: env.cookieSecret,
  secureCookies: env.secureCookies,
  logger,
});
await app.listen({ port: env.port, host: '127.0.0.1' });
app.log.info({ port: env.port, nodeEnv: env.nodeEnv }, 'API listening');
```

（删除原 `console.log`。）

- [ ] **Step 6: 验证**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 test`
Expected: 全绿（含新 deny/冒烟用例；既有用例零回归）

- [ ] **Step 7: Commit（需用户批准）**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): logger/audit 装配 + authz.deny 审计接线（P1A-6 Task 7）"
```

---

### Task 8: /admin/audit-logs 查询接口（platform_admin 守卫）

**Files:**
- Create: `packages/domain/src/audit-logs.ts`
- Create: `packages/domain/test/audit-logs.test.ts`
- Modify: `packages/domain/src/index.ts`（+导出）
- Create: `apps/api/src/routes/admin.ts`
- Create: `apps/api/test/admin-routes.test.ts`
- Modify: `apps/api/src/app.ts`（注册 /admin 前缀）
- Create: `apps/api/test/admin.integration.test.ts`（云上跑）

**Interfaces:**
- Consumes: Task 4 的 AuditLog 表；Task 3 的 buildErrorBody。
- Produces:
  - `interface AuditLogQuery { workspaceId?: string; action?: string; actorId?: string; from?: Date; to?: Date; cursor?: string; limit?: number }`
  - `listAuditLogs(deps: { prisma: PrismaClient }, query: AuditLogQuery): Promise<{ items: AuditLog[]; nextCursor: string | null }>`
  - `GET /admin/audit-logs`（query 同名字段 snake 不变；cursor 格式 `<createdAtISO>|<id>`）

- [ ] **Step 1: 写失败测试（domain 查询）**

`packages/domain/test/audit-logs.test.ts`（stub prisma，不扩展 shared fakes）：

```ts
import { describe, expect, it, vi } from 'vitest';
import { listAuditLogs } from '../src/audit-logs';

function stubWith(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { findMany, prisma: { auditLog: { findMany } } as never };
}

const ROWS = Array.from({ length: 3 }, (_, i) => ({
  id: `id-${i}`, createdAt: new Date(`2026-08-01T00:00:0${i}Z`), actorId: 'u1',
  action: 'workspace.create', workspaceId: 'w1', targetType: null, targetId: null,
  metadata: null, requestId: null, ip: null,
}));

describe('listAuditLogs', () => {
  it('默认 limit 50、上限 200，倒序取 limit+1 探测下一页', async () => {
    const { findMany, prisma } = stubWith(ROWS);
    await listAuditLogs({ prisma }, {});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
    }));
    await listAuditLogs({ prisma }, { limit: 500 });
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 201 }));
  });

  it('过滤条件映射 where：workspaceId/action/actorId/时间窗', async () => {
    const { findMany, prisma } = stubWith([]);
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-02T00:00:00Z');
    await listAuditLogs({ prisma }, { workspaceId: 'w1', action: 'auth.login', actorId: 'u1', from, to });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'w1', action: 'auth.login', actorId: 'u1',
      createdAt: { gte: from, lte: to },
    });
  });

  it('游标分页：满页给 nextCursor，按 (createdAt,id) 倒序续查', async () => {
    const full = Array.from({ length: 51 }, (_, i) => ({ ...ROWS[0], id: `id-${i}` }));
    const { findMany, prisma } = stubWith(full);
    const page1 = await listAuditLogs({ prisma }, { limit: 50 });
    expect(page1.items).toHaveLength(50);
    expect(page1.nextCursor).toBe(`${full[49].createdAt.toISOString()}|id-49`);
    await listAuditLogs({ prisma }, { cursor: page1.nextCursor! });
    const where = findMany.mock.calls[1][0].where;
    expect(where.OR).toEqual([
      { createdAt: { lt: full[49].createdAt } },
      { createdAt: full[49].createdAt, id: { lt: 'id-49' } },
    ]);
  });

  it('不足一页 nextCursor=null', async () => {
    const { prisma } = stubWith(ROWS);
    const r = await listAuditLogs({ prisma }, {});
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBeNull();
  });
});
```

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: FAIL（`../src/audit-logs` 不存在）

- [ ] **Step 2: 实装 listAuditLogs**

`packages/domain/src/audit-logs.ts`：

```ts
import type { AuditLog, Prisma, PrismaClient } from '@prisma/client';

export interface AuditLogQuery {
  workspaceId?: string;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  /** `<createdAtISO>|<id>`，上一页响应的 nextCursor 原样回传。 */
  cursor?: string;
  limit?: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** 平台级审计查询（/admin 用）：过滤 + (createdAt,id) 倒序游标分页。 */
export async function listAuditLogs(
  deps: { prisma: PrismaClient },
  query: AuditLogQuery,
): Promise<AuditLogPage> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const where: Prisma.AuditLogWhereInput = {};
  if (query.workspaceId) where.workspaceId = query.workspaceId;
  if (query.action) where.action = query.action;
  if (query.actorId) where.actorId = query.actorId;
  if (query.from || query.to) {
    where.createdAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
  }
  if (query.cursor) {
    const sep = query.cursor.indexOf('|');
    const at = new Date(query.cursor.slice(0, sep));
    const id = query.cursor.slice(sep + 1);
    where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
  }
  const rows = await deps.prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null;
  return { items, nextCursor };
}
```

`packages/domain/src/index.ts` 追加：

```ts
export { listAuditLogs, type AuditLogPage, type AuditLogQuery } from './audit-logs';
```

- [ ] **Step 3: admin 路由 + 失败测试**

`apps/api/test/admin-routes.test.ts`（复用 workspace-guard.test.ts 的 session/fake 模式）：

```ts
// 三用例骨架：
// 1) 无 session cookie → 401
// 2) 有 session 但 platformRole='user' → 403 { error.code: 'FORBIDDEN' }
// 3) platformRole='platform_admin' → 200，响应 { items, nextCursor }，
//    且 query 过滤参数（action=auth.login）透传到 prisma.auditLog.findMany 的 where
```

Run: `npx pnpm@9.15.0 --filter @openscience/api test`
Expected: FAIL（admin 路由未注册）

- [ ] **Step 4: 实装 admin 路由**

`apps/api/src/routes/admin.ts`：

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { listAuditLogs } from '@openscience/domain';
import { buildErrorBody } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** 平台管理接口（最小集）：审计查询仅 platform_admin 可见（P1A-5 platformRole 首个消费方）。 */
export function registerAdminRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get('/audit-logs', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const row = await deps.prisma.user.findUnique({ where: { id: user.userId } });
    if (row?.platformRole !== 'platform_admin') {
      return reply.status(403).send(buildErrorBody('FORBIDDEN', '权限不足', String(req.id)));
    }
    const q = querySchema.parse(req.query);
    return reply.send(
      await listAuditLogs(deps, {
        workspaceId: q.workspaceId,
        action: q.action,
        actorId: q.actorId,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        cursor: q.cursor,
        limit: q.limit,
      }),
    );
  });
}
```

`apps/api/src/app.ts` 注册（放在 workspaces 之后）：

```ts
await app.register(async (instance) => registerAdminRoutes(instance, opts), { prefix: '/admin' });
```

- [ ] **Step 5: 集成用例（本地写好，云上跑）**

`apps/api/test/admin.integration.test.ts`：

```ts
// 沿用 workspaces.integration.test.ts 的 boot 模式（真实 pg/redis/minio 栈）
// 用例 1：POST /workspaces 成功后，audit_logs 表出现 workspace.create 行
//        （用测试内 prisma.auditLog.findFirst 断言 action/actorId/workspaceId 三元组）
// 用例 2：POST /auth/login 成功后出现 auth.login 行（无 metadata.reason）
// 用例 3：GET /admin/audit-logs：无 session→401；普通用户→403；
//        将测试用户 platformRole 直改 'platform_admin' 后→200 且 ?action=workspace.create 过滤生效
// 用例 4：viewer PATCH /workspaces/:id → 403 且出现 authz.deny 行（metadata.reason='role_insufficient'）
```

`vitest list --config vitest.integration.config.ts` 确认收集，**本机不运行**。

- [ ] **Step 6: 本地验证**

Run: `npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 test`
Expected: 全绿（admin-routes 3 用例 + domain audit-logs 4 用例）

- [ ] **Step 7: Commit（需用户批准）**

```bash
git add packages/domain apps/api
git commit -m "feat(admin): /admin/audit-logs 查询接口 + platform_admin 守卫（P1A-6 Task 8）"
```

---

### Task 9: 全量门禁 + 云上收口 + task-master 2.6 done

**Files:**
- Modify: `docs/progress.md`（新条目置顶）
- Modify: `project_index.md`（spec/plan 状态更新）
- Modify: `AGENTS.md`（packages 占位描述更新：config/observability 已实装）
- Create: `docs/handoff/2026-08-01-p1a-6-local-done-handoff.md`（云上收口后回填）

- [ ] **Step 1: 本地全量门禁**

Run（逐项确认 exit 0）:

```bash
npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 lint && npx pnpm@9.15.0 test
npx pnpm@9.15.0 audit:knip; npx pnpm@9.15.0 audit:dep; npx pnpm@9.15.0 audit:dup; npx pnpm@9.15.0 audit:deps; npx pnpm@9.15.0 docs:lint
```

Expected: 全 exit 0；audit:dep 无新循环（新边 domain/auth→observability、database→observability/config 均向叶子）；knip 无新 unused。

- [ ] **Step 2: 终审（requesting-code-review skill）**

对 Task 1–8 全 diff 走 whole-branch review；Critical/Important 清零后才进云上。

- [ ] **Step 3: 云上收口（每步用户确认）**

```bash
# tar-over-ssh 同步（排除 .env/.git/node_modules/dist，同 P1A-5 流程）
infra/scripts/ssh-run.sh "cd /opt/openscience && npx pnpm@9.15.0 install && npx pnpm@9.15.0 build"
infra/scripts/ssh-run.sh "cd /opt/openscience && node packages/database/dist/migrate-cli.js deploy"
infra/scripts/ssh-run.sh "cd /opt/openscience && npx pnpm@9.15.0 test:integration"
```

Expected: 迁移 5 `20260801143000_audit_log` applied；集成测试全绿（既有 11 + 新增 admin/audit 用例）。

- [ ] **Step 4: task-master + 文档同步**

- `set_task_status 2.6 done`；`update_subtask` 记录两处 design gate 确认的偏离（/admin 真查询接口、authz.deny 入审计）。
- `docs/progress.md` 置顶新条目；`project_index.md` 更新 spec/plan 状态；`AGENTS.md` 把 config/observability 从"占位"改为已实装描述；写 handoff。

- [ ] **Step 5: Commit + push（需用户批准）**

```bash
git add docs AGENTS.md project_index.md
git commit -m "docs: P1A-6 收口（progress/index/AGENTS/handoff）"
git push origin main
```

---

## Self-Review 记录（写计划时已完成）

- Spec 覆盖：§1 架构 → Task 1/2/4；§2 表结构 → Task 4；§3 写入机制+覆盖清单 → Task 5/6/7；§4 日志/脱敏/错误 → Task 2/3/7；§5 config → Task 1；§6 admin 接口 → Task 8；§7 测试策略 → 各 Task TDD + Task 8 集成 + Task 9 门禁。
- 类型一致性：`AuditSink.record(event, tx?)`、`AuditContext`、`buildErrorBody`、`listAuditLogs` 签名在 Task 4/5/6/7/8 间一致。
- 已知留白（实现时以现场代码为准，不断言签名细节）：auth/domain fake helpers 的 seed 函数名（Task 5/6 测试内已注明）。
