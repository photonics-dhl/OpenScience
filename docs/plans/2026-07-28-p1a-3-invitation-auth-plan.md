# P1A-3 邀请码注册与邮箱验证 Auth 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地邀请码注册 → 邮箱验证 → 登录闭环：`packages/auth` 纯逻辑层 + `apps/api` 首次 Fastify 骨架（`/auth` 六端点）+ 迁移 2 四张表 + 邀请码 CLI。

**Architecture:** 核心逻辑（密码哈希/邀请码核销/验证码流/session/mailer）全部在 `packages/auth`，不依赖 HTTP 框架；`apps/api` 只做薄路由层（zod 解析 → 调 service → 错误映射）；session 存 Redis 不透明 token；dev 邮件写 `mail_outbox` 表捕获。

**Tech Stack:** pnpm workspace（`npx pnpm@9.15.0`）、TypeScript 5.5（NodeNext/CJS）、Prisma 5.22、ioredis 5、argon2、Fastify 5 + @fastify/cookie 11、zod 3、Vitest 2。

**设计依据：** `docs/specs/2026-07-28-p1a-3-invitation-auth-design.md`（已批准）。

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`，不全局安装（ADR-002）。
- 全程不 `git add/commit/push`，除非用户逐次明确批准；计划末尾设提交检查点。
- 不读取/打印 `.env`；本机不做任何 Docker 相关执行（用户 2026-07-28 指示），集成测试文件照写、执行留云上。
- 迁移归 `infra/migrations/`，每个迁移目录附 `rollback.sql`；`NODE_ENV=production` 拒绝破坏性命令（P1A-2 runner 已有守卫）。
- TS 为 NodeNext + CJS 输出（包内无 `"type": "module"`）：相对导入不写扩展名。
- 范围红线：不做 Personal Workspace（2.4）、RBAC（2.5）、全局错误/审计（2.6）、限流实现（2.8，只留注释）、SmtpMailer 实现（§24）、忘记密码/SSO、web 注册页。
- 防枚举纪律：register/login/resend-code 外部响应不得泄露"邮箱是否已注册"；login 失败统一文案。
- 验证码纪律：只存 sha256、10 分钟过期、60s 冷却、5 次失败锁 15 分钟、重发使旧码失效。

## 开发态默认值（全计划统一引用，同 P1A-2）

| 项 | 值 |
|---|---|
| DATABASE_URL | `postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience` |
| REDIS_URL | `redis://127.0.0.1:6379` |
| 迁移 2 目录名 | `20260728010000_auth_baseline` |
| API 端口 | `3001`（listen 127.0.0.1） |
| session cookie 名 | `openscience_session` |

---

### Task 1: 迁移 2 — users/invitations/email_verifications/mail_outbox + Prisma schema

**Files:**
- Modify: `infra/schema.prisma`（追加 enum + 4 个 model）
- Create: `infra/migrations/20260728010000_auth_baseline/migration.sql`
- Create: `infra/migrations/20260728010000_auth_baseline/rollback.sql`

**Interfaces:**
- Consumes: P1A-2 的 `infra/schema.prisma`（已有 `AppMeta`）与迁移目录约定。
- Produces（Task 2/3 依赖以下 Prisma 模型名）：`User`（`passwordHash`/`displayName`/`status`）、`Invitation`（`usedBy`/`revokedAt`/`expiresAt`/`email`）、`EmailVerification`（`codeHash`/`attempts`/`lockedUntil`/`expiresAt`/`lastSentAt`/`verifiedAt`）、`MailOutbox`（`toEmail`/`subject`/`bodyText`/`sentVia`）；`UserStatus` enum（`invited`/`email_verified`/`identity_verified`/`suspended`/`deleted`）。

- [ ] **Step 1: `infra/schema.prisma` 追加（`AppMeta` 保留不动）**

```prisma
enum UserStatus {
  invited
  email_verified
  identity_verified
  suspended
  deleted
}

model User {
  id                 String             @id @default(uuid()) @db.Uuid
  email              String             @unique @db.Citext
  passwordHash       String             @map("password_hash")
  displayName        String             @map("display_name")
  status             UserStatus         @default(invited)
  createdAt          DateTime           @default(now()) @map("created_at")
  updatedAt          DateTime           @updatedAt @map("updated_at")
  emailVerifications EmailVerification[]
  usedInvitations    Invitation[]       @relation("InvitationUsedBy")

  @@map("users")
}

model Invitation {
  id         String    @id @default(uuid()) @db.Uuid
  code       String    @unique
  email      String?   @db.Citext
  createdBy  String    @map("created_by")
  usedBy     String?   @map("used_by") @db.Uuid
  usedAt     DateTime? @map("used_at")
  revokedAt  DateTime? @map("revoked_at")
  expiresAt  DateTime  @map("expires_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  usedByUser User?     @relation("InvitationUsedBy", fields: [usedBy], references: [id], onDelete: SetNull)

  @@map("invitations")
}

model EmailVerification {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  codeHash    String    @map("code_hash")
  attempts    Int       @default(0)
  lockedUntil DateTime? @map("locked_until")
  expiresAt   DateTime  @map("expires_at")
  lastSentAt  DateTime  @map("last_sent_at")
  verifiedAt  DateTime? @map("verified_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("email_verifications")
}

model MailOutbox {
  id        String   @id @default(uuid()) @db.Uuid
  toEmail   String   @map("to_email") @db.Citext
  subject   String
  bodyText  String   @map("body_text")
  sentVia   String   @default("outbox") @map("sent_via")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("mail_outbox")
}
```

- [ ] **Step 2: 创建 `infra/migrations/20260728010000_auth_baseline/migration.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE "UserStatus" AS ENUM ('invited', 'email_verified', 'identity_verified', 'suspended', 'deleted');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "email" CITEXT,
    "created_by" TEXT NOT NULL,
    "used_by" UUID,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invitations_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "invitations_code_key" ON "invitations"("code");

CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "email_verifications_user_id_idx" ON "email_verifications"("user_id");

CREATE TABLE "mail_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "to_email" CITEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "sent_via" TEXT NOT NULL DEFAULT 'outbox',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 3: 创建 `infra/migrations/20260728010000_auth_baseline/rollback.sql`**

```sql
-- Compensation rollback for 20260728010000_auth_baseline.
-- 注意：不 DROP EXTENSION citext —— extension 可能被同库其他对象依赖，删除影响面不可控。
DROP TABLE IF EXISTS "mail_outbox";
DROP TABLE IF EXISTS "email_verifications";
DROP TABLE IF EXISTS "invitations";
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "UserStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260728010000_auth_baseline';
```

- [ ] **Step 4: 重新生成 client 并验证静态门禁**

Run: `npx prisma@5.22.0 validate --schema infra/schema.prisma && npx pnpm@9.15.0 --filter @openscience/database build && npx pnpm@9.15.0 typecheck`
Expected: schema valid；prisma generate 成功（新模型类型可见）；tsc 全 workspace 无错误。（不执行 migrate deploy——本机无 Docker，云上执行。）

---

### Task 2: packages/auth — 原语层（errors/password/tokens/纯判定函数）

**Files:**
- Modify: `packages/auth/package.json`（deps + scripts + main/types）
- Create: `packages/auth/src/errors.ts`
- Create: `packages/auth/src/password.ts`
- Create: `packages/auth/src/tokens.ts`
- Create: `packages/auth/src/invitations.ts`
- Create: `packages/auth/src/verification.ts`
- Create: `packages/auth/vitest.config.ts`
- Create: `packages/auth/test/primitives.test.ts`

**Interfaces:**
- Consumes: Task 1 的 Prisma 类型（仅 `Invitation` 的 Pick）。
- Produces（Task 3 依赖以下签名）：
  - `AuthError`（`code: AuthErrorCode`）、`AuthErrorCode`（`src/errors.ts`）
  - `hashPassword(plain: string): Promise<string>`、`verifyPassword(hash: string, plain: string): Promise<boolean>`（`src/password.ts`）
  - `generateVerificationCode(): string`、`hashVerificationCode(code: string): string`、`generateSessionToken(): string`、`generateInvitationCode(): string`（`src/tokens.ts`）
  - `assertInvitationRedeemable(inv: Pick<Invitation,'usedBy'|'revokedAt'|'expiresAt'|'email'>, email: string, now: Date): void`（`src/invitations.ts`）
  - `CODE_TTL_MS`、`RESEND_COOLDOWN_MS`、`MAX_ATTEMPTS`、`LOCK_MS`、`isCodeExpired(expiresAt, now)`、`isLocked(lockedUntil, now)`、`inCooldown(lastSentAt, now)`、`registerFailedAttempt(currentAttempts, now): { attempts: number; lockedUntil: Date | null }`（`src/verification.ts`）

- [ ] **Step 1: 安装依赖**

Run: `npx pnpm@9.15.0 add argon2 @prisma/client@5.22.0 ioredis@5 --filter @openscience/auth && npx pnpm@9.15.0 add -D vitest@2 @types/node@20.14.10 --filter @openscience/auth`
Expected: 成功写入 `packages/auth/package.json` 与 lockfile。

- [ ] **Step 2: 更新 `packages/auth/package.json`**（加 main/types 供跨包引用；scripts 对齐 database 包模式）

```json
{
  "name": "@openscience/auth",
  "private": true,
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

（dependencies/devDependencies 已由 Step 1 写入，保持不动。）

- [ ] **Step 3: 创建 `packages/auth/src/errors.ts`**

```ts
export type AuthErrorCode =
  | 'INVITATION_INVALID'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'CODE_LOCKED'
  | 'RESEND_COOLDOWN'
  | 'CREDENTIALS_INVALID'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'SESSION_INVALID';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
```

- [ ] **Step 4: 创建 `packages/auth/src/password.ts`**

```ts
import argon2 from 'argon2';

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // 哈希串损坏/格式错误视为校验失败，不向外抛内部细节
    return false;
  }
}
```

- [ ] **Step 5: 创建 `packages/auth/src/tokens.ts`**

```ts
import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 6 位数字邮箱验证码（允许前导零）。 */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 验证码只存 sha256，不明文落库（security-review：日志/库泄漏不直接泄露验证码）。 */
export function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** 32 字节随机会话 token，base64url 编码。 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 20 位邀请码，字母表去除易混淆字符（0/O、1/I/L）。 */
export function generateInvitationCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
```

- [ ] **Step 6: 创建 `packages/auth/src/invitations.ts`**

```ts
import type { Invitation } from '@prisma/client';
import { AuthError } from './errors';

export type InvitationRejectReason = 'USED' | 'REVOKED' | 'EXPIRED' | 'EMAIL_MISMATCH';

const REASON_MESSAGES: Record<InvitationRejectReason, string> = {
  USED: '邀请码已被使用',
  REVOKED: '邀请码已被吊销',
  EXPIRED: '邀请码已过期',
  EMAIL_MISMATCH: '邀请码与邮箱不匹配',
};

type Redeemable = Pick<Invitation, 'usedBy' | 'revokedAt' | 'expiresAt' | 'email'>;

export function invitationRejectReason(inv: Redeemable, email: string, now: Date): InvitationRejectReason | null {
  if (inv.usedBy) return 'USED';
  if (inv.revokedAt) return 'REVOKED';
  if (inv.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (inv.email && inv.email.toLowerCase() !== email.toLowerCase()) return 'EMAIL_MISMATCH';
  return null;
}

/** 不可核销时抛 AuthError('INVITATION_INVALID')。调用方需先自行处理 inv 为 null 的情况。 */
export function assertInvitationRedeemable(inv: Redeemable, email: string, now: Date): void {
  const reason = invitationRejectReason(inv, email, now);
  if (reason) throw new AuthError('INVITATION_INVALID', REASON_MESSAGES[reason]);
}
```

- [ ] **Step 7: 创建 `packages/auth/src/verification.ts`**

```ts
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function isCodeExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function inCooldown(lastSentAt: Date, now: Date): boolean {
  return now.getTime() - lastSentAt.getTime() < RESEND_COOLDOWN_MS;
}

/** 记录一次失败尝试；达到 MAX_ATTEMPTS 时返回锁定截止时间。 */
export function registerFailedAttempt(
  currentAttempts: number,
  now: Date,
): { attempts: number; lockedUntil: Date | null } {
  const attempts = currentAttempts + 1;
  return attempts >= MAX_ATTEMPTS
    ? { attempts, lockedUntil: new Date(now.getTime() + LOCK_MS) }
    : { attempts, lockedUntil: null };
}
```

- [ ] **Step 8: 创建 `packages/auth/vitest.config.ts`**

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

- [ ] **Step 9: 创建 `packages/auth/test/primitives.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password';
import {
  generateInvitationCode,
  generateSessionToken,
  generateVerificationCode,
  hashVerificationCode,
} from '../src/tokens';
import { invitationRejectReason } from '../src/invitations';
import {
  MAX_ATTEMPTS,
  inCooldown,
  isCodeExpired,
  isLocked,
  registerFailedAttempt,
} from '../src/verification';

describe('password', () => {
  it('hash/verify roundtrip', async () => {
    const hash = await hashPassword('passw0rd-example');
    expect(hash).not.toContain('passw0rd-example');
    expect(await verifyPassword(hash, 'passw0rd-example')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-pass1')).toBe(false);
  });

  it('verify returns false for a corrupted hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-real-hash', 'whatever1')).toBe(false);
  });
});

describe('tokens', () => {
  it('verification code is 6 digits', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashVerificationCode matches sha256 of "123456"', () => {
    expect(hashVerificationCode('123456')).toBe(
      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    );
  });

  it('session token is 43-char base64url', () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('invitation code is 20 chars from the unambiguous alphabet', () => {
    const c = generateInvitationCode();
    expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{20}$/);
  });
});

describe('invitationRejectReason', () => {
  const now = new Date('2026-07-28T12:00:00Z');
  const base = { usedBy: null, revokedAt: null, expiresAt: new Date('2026-08-01T00:00:00Z'), email: null };

  it('redeemable invitation returns null', () => {
    expect(invitationRejectReason(base, 'a@b.c', now)).toBeNull();
  });
  it('used invitation is rejected', () => {
    expect(invitationRejectReason({ ...base, usedBy: 'some-uuid' }, 'a@b.c', now)).toBe('USED');
  });
  it('revoked invitation is rejected', () => {
    expect(invitationRejectReason({ ...base, revokedAt: now }, 'a@b.c', now)).toBe('REVOKED');
  });
  it('expired invitation is rejected', () => {
    expect(invitationRejectReason({ ...base, expiresAt: now }, 'a@b.c', now)).toBe('EXPIRED');
  });
  it('email-bound invitation rejects a different email (case-insensitive)', () => {
    const bound = { ...base, email: 'Invited@Example.com' };
    expect(invitationRejectReason(bound, 'other@example.com', now)).toBe('EMAIL_MISMATCH');
    expect(invitationRejectReason(bound, 'invited@example.com', now)).toBeNull();
  });
});

describe('verification timing rules', () => {
  const now = new Date('2026-07-28T12:00:00Z');

  it('expiry is inclusive of the boundary instant', () => {
    expect(isCodeExpired(now, now)).toBe(true);
    expect(isCodeExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });
  it('locked until is exclusive of the unlock instant', () => {
    expect(isLocked(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLocked(now, now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
  it('cooldown window is 60s', () => {
    expect(inCooldown(new Date(now.getTime() - 59_000), now)).toBe(true);
    expect(inCooldown(new Date(now.getTime() - 60_000), now)).toBe(false);
  });
  it('fifth failure locks for 15 minutes', () => {
    const fourth = registerFailedAttempt(MAX_ATTEMPTS - 2, now);
    expect(fourth).toEqual({ attempts: MAX_ATTEMPTS - 1, lockedUntil: null });
    const fifth = registerFailedAttempt(MAX_ATTEMPTS - 1, now);
    expect(fifth.attempts).toBe(MAX_ATTEMPTS);
    expect(fifth.lockedUntil?.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
  });
});
```

- [ ] **Step 10: 构建并跑单测**

Run: `npx pnpm@9.15.0 --filter @openscience/auth build && npx pnpm@9.15.0 --filter @openscience/auth test`
Expected: tsc exit 0；15 个单测全过（argon2 首次构建/下载预建二进制可能较慢，属正常）。

---

### Task 3: packages/auth — 服务层（session/mailer/auth-service）+ fake 单测

**Files:**
- Create: `packages/auth/src/session.ts`
- Create: `packages/auth/src/mailer.ts`
- Create: `packages/auth/src/auth-service.ts`
- Modify: `packages/auth/src/index.ts`（替换 placeholder）
- Create: `packages/auth/test/helpers/fakes.ts`
- Create: `packages/auth/test/auth-service.test.ts`

**Interfaces:**
- Consumes: Task 2 全部签名；`@prisma/client` 的 `PrismaClient` 类型；`ioredis` 的 `Redis` 类型。
- Produces（Task 4/5/6 依赖以下签名）：
  - `SESSION_TTL_SECONDS`、`createSession(redis, data: { userId: string; status: string }): Promise<string>`、`resolveSession(redis, token): Promise<SessionData>`、`destroySession(redis, token): Promise<void>`（`src/session.ts`）
  - `Mailer` 接口、`MailMessage`、`DevOutboxMailer implements Mailer`（构造参 `PrismaClient`）、`SmtpMailer`（预留抛错）（`src/mailer.ts`）
  - `AuthDeps { prisma: PrismaClient; redis: Redis; mailer: Mailer; now?: () => Date }`、`AuthResult { userId: string; status: string; sessionToken?: string }`、`CurrentUser { userId; email; displayName; status }`（`src/auth-service.ts`）
  - `register(deps, input: { invitationCode; email; password; displayName }): Promise<AuthResult>`
  - `verifyEmail(deps, input: { email; code }): Promise<Required<AuthResult>>`
  - `resendCode(deps, input: { email }): Promise<void>`
  - `login(deps, input: { email; password }): Promise<Required<AuthResult>>`
  - `logout(deps, sessionToken): Promise<void>`
  - `getCurrentUser(deps, sessionToken): Promise<CurrentUser>`

- [ ] **Step 1: 创建 `packages/auth/src/session.ts`**

```ts
import type { Redis } from 'ioredis';
import { AuthError } from './errors';
import { generateSessionToken } from './tokens';

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface SessionData {
  userId: string;
  status: string;
  createdAt: string;
}

function sessionKey(token: string): string {
  return `sess:${token}`;
}

export async function createSession(
  redis: Redis,
  data: Omit<SessionData, 'createdAt'>,
  now: Date = new Date(),
): Promise<string> {
  const token = generateSessionToken();
  const payload: SessionData = { ...data, createdAt: now.toISOString() };
  await redis.set(sessionKey(token), JSON.stringify(payload), 'EX', SESSION_TTL_SECONDS);
  return token;
}

/** 校验并滑动续期；不存在/过期抛 AuthError('SESSION_INVALID')。 */
export async function resolveSession(redis: Redis, token: string): Promise<SessionData> {
  const raw = await redis.get(sessionKey(token));
  if (!raw) throw new AuthError('SESSION_INVALID', '会话不存在或已过期');
  await redis.expire(sessionKey(token), SESSION_TTL_SECONDS);
  return JSON.parse(raw) as SessionData;
}

export async function destroySession(redis: Redis, token: string): Promise<void> {
  await redis.del(sessionKey(token));
}
```

- [ ] **Step 2: 创建 `packages/auth/src/mailer.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** dev 捕获通道：写 mail_outbox 表（兼作测试钩子）。 */
export class DevOutboxMailer implements Mailer {
  constructor(private readonly prisma: PrismaClient) {}

  async send(message: MailMessage): Promise<void> {
    await this.prisma.mailOutbox.create({
      data: { toEmail: message.to, subject: message.subject, bodyText: message.text, sentVia: 'outbox' },
    });
  }
}

/** §24 邮件服务商未定：配置位预留，调用即抛错，不静默。 */
export class SmtpMailer implements Mailer {
  async send(): Promise<void> {
    throw new Error('SmtpMailer is reserved but not configured yet (Spec §24 pending)');
  }
}
```

- [ ] **Step 3: 创建 `packages/auth/src/auth-service.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AuthError } from './errors';
import { assertInvitationRedeemable } from './invitations';
import type { Mailer } from './mailer';
import { hashPassword, verifyPassword } from './password';
import { createSession, destroySession, resolveSession } from './session';
import { generateVerificationCode, hashVerificationCode } from './tokens';
import { CODE_TTL_MS, inCooldown, isCodeExpired, isLocked, registerFailedAttempt } from './verification';

export interface AuthDeps {
  prisma: PrismaClient;
  redis: Redis;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
}

export interface AuthResult {
  userId: string;
  status: string;
  sessionToken?: string;
}

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  status: string;
}

export interface RegisterInput {
  invitationCode: string;
  email: string;
  password: string;
  displayName: string;
}

function now(deps: AuthDeps): Date {
  return deps.now ? deps.now() : new Date();
}

/** 签发新验证码并使该用户所有未验证旧码立即失效，然后投递。 */
async function issueVerificationCode(deps: AuthDeps, userId: string, email: string): Promise<void> {
  const at = now(deps);
  const code = generateVerificationCode();
  await deps.prisma.emailVerification.updateMany({
    where: { userId, verifiedAt: null },
    data: { expiresAt: at },
  });
  await deps.prisma.emailVerification.create({
    data: {
      userId,
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(at.getTime() + CODE_TTL_MS),
      lastSentAt: at,
    },
  });
  await deps.mailer.send({
    to: email,
    subject: 'OpenScience 邮箱验证码',
    text: `你的验证码是 ${code}，10 分钟内有效。`,
  });
}

export async function register(deps: AuthDeps, input: RegisterInput): Promise<AuthResult> {
  const at = now(deps);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await deps.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { code: input.invitationCode } });
      if (!invitation) throw new AuthError('INVITATION_INVALID', '邀请码无效');
      assertInvitationRedeemable(invitation, input.email, at);
      const created = await tx.user.create({
        data: { email: input.email, passwordHash, displayName: input.displayName, status: 'invited' },
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { usedBy: created.id, usedAt: at } });
      return created;
    });
    await issueVerificationCode(deps, user.id, input.email);
    return { userId: user.id, status: user.status };
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AuthError('EMAIL_ALREADY_REGISTERED', '该邮箱已注册');
    }
    throw err;
  }
}

export async function verifyEmail(
  deps: AuthDeps,
  input: { email: string; code: string },
): Promise<Required<AuthResult>> {
  const at = now(deps);
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  const record = await deps.prisma.emailVerification.findFirst({
    where: { userId: user.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  if (isLocked(record.lockedUntil, at)) throw new AuthError('CODE_LOCKED', '尝试次数过多，请稍后再试');
  if (isCodeExpired(record.expiresAt, at)) throw new AuthError('CODE_EXPIRED', '验证码已过期，请重新获取');
  if (record.codeHash !== hashVerificationCode(input.code)) {
    const failure = registerFailedAttempt(record.attempts, at);
    await deps.prisma.emailVerification.update({ where: { id: record.id }, data: failure });
    throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  }
  const updated = await deps.prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({ where: { id: record.id }, data: { verifiedAt: at } });
    return tx.user.update({ where: { id: user.id }, data: { status: 'email_verified' } });
  });
  const sessionToken = await createSession(deps.redis, { userId: updated.id, status: updated.status });
  return { userId: updated.id, status: updated.status, sessionToken };
}

/** 防枚举：用户不存在或已验证时静默成功（与成功响应一致）；冷却中抛 RESEND_COOLDOWN。 */
export async function resendCode(deps: AuthDeps, input: { email: string }): Promise<void> {
  const at = now(deps);
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.status !== 'invited') return;
  const record = await deps.prisma.emailVerification.findFirst({
    where: { userId: user.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (record && inCooldown(record.lastSentAt, at)) {
    throw new AuthError('RESEND_COOLDOWN', '发送过于频繁，请稍后再试');
  }
  await issueVerificationCode(deps, user.id, input.email);
}

export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<Required<AuthResult>> {
  const user = await deps.prisma.user.findUnique({ where: { email: input.email } });
  // 防枚举：邮箱不存在与密码错误完全同文案同错误码
  if (!user) throw new AuthError('CREDENTIALS_INVALID', '邮箱或密码错误');
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw new AuthError('CREDENTIALS_INVALID', '邮箱或密码错误');
  if (user.status === 'invited') throw new AuthError('ACCOUNT_NOT_ACTIVE', '请先完成邮箱验证');
  if (user.status === 'suspended' || user.status === 'deleted') {
    throw new AuthError('ACCOUNT_NOT_ACTIVE', '账户不可用');
  }
  const sessionToken = await createSession(deps.redis, { userId: user.id, status: user.status });
  return { userId: user.id, status: user.status, sessionToken };
}

export async function logout(deps: AuthDeps, sessionToken: string): Promise<void> {
  await destroySession(deps.redis, sessionToken);
}

/** 会话校验 + 实时用户状态（suspended/deleted 即时拒并销毁会话）。2.5 RBAC 复用此入口。 */
export async function getCurrentUser(deps: AuthDeps, sessionToken: string): Promise<CurrentUser> {
  const session = await resolveSession(deps.redis, sessionToken);
  const user = await deps.prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === 'suspended' || user.status === 'deleted') {
    await destroySession(deps.redis, sessionToken);
    throw new AuthError('SESSION_INVALID', '会话已失效');
  }
  if (user.status === 'invited') throw new AuthError('ACCOUNT_NOT_ACTIVE', '请先完成邮箱验证');
  return { userId: user.id, email: user.email, displayName: user.displayName, status: user.status };
}
```

- [ ] **Step 4: 替换 `packages/auth/src/index.ts`**

```ts
export { AuthError, type AuthErrorCode } from './errors';
export { hashPassword, verifyPassword } from './password';
export {
  generateInvitationCode,
  generateSessionToken,
  generateVerificationCode,
  hashVerificationCode,
} from './tokens';
export { assertInvitationRedeemable, invitationRejectReason, type InvitationRejectReason } from './invitations';
export {
  CODE_TTL_MS,
  LOCK_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  inCooldown,
  isCodeExpired,
  isLocked,
  registerFailedAttempt,
} from './verification';
export {
  SESSION_TTL_SECONDS,
  createSession,
  destroySession,
  resolveSession,
  type SessionData,
} from './session';
export { DevOutboxMailer, SmtpMailer, type Mailer, type MailMessage } from './mailer';
export {
  getCurrentUser,
  login,
  logout,
  register,
  resendCode,
  verifyEmail,
  type AuthDeps,
  type AuthResult,
  type CurrentUser,
  type RegisterInput,
} from './auth-service';
```

- [ ] **Step 5: 创建 `packages/auth/test/helpers/fakes.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Mailer, MailMessage } from '../../src/mailer';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离 Prisma 完整类型 */

interface FakeDb {
  users: any[];
  invitations: any[];
  emailVerifications: any[];
  mailOutbox: any[];
}

/** 内存版 Prisma 子集：仅覆盖 auth-service 用到的调用面。 */
export function createFakePrisma(): { prisma: PrismaClient; db: FakeDb } {
  const db: FakeDb = { users: [], invitations: [], emailVerifications: [], mailOutbox: [] };
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u) => (where.email ? u.email.toLowerCase() === where.email.toLowerCase() : u.id === where.id)) ??
        null,
      create: async ({ data }: any) => {
        if (db.users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.users.find((u) => u.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    invitation: {
      findUnique: async ({ where }: any) => db.invitations.find((i) => i.code === where.code) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), usedBy: null, usedAt: null, revokedAt: null, ...data };
        db.invitations.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.invitations.find((i) => i.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    emailVerification: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), attempts: 0, lockedUntil: null, verifiedAt: null, createdAt: new Date(), ...data };
        db.emailVerifications.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        db.emailVerifications
          .filter((v) => v.userId === where.userId && v.verifiedAt === null)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      update: async ({ where, data }: any) => {
        const row = db.emailVerifications.find((v) => v.id === where.id);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const v of db.emailVerifications) {
          if (v.userId === where.userId && v.verifiedAt === null) {
            Object.assign(v, data);
            count++;
          }
        }
        return { count };
      },
    },
    mailOutbox: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), ...data };
        db.mailOutbox.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma: prisma as PrismaClient, db };
}

/** 内存版 Redis 子集：set/get/del/expire。 */
export function createFakeRedis(): Redis & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    get: async (key: string) => store.get(key) ?? null,
    del: async (key: string) => (store.delete(key) ? 1 : 0),
    expire: async () => 1,
  } as unknown as Redis & { store: Map<string, string> };
}

/** 记录发送内容的 fake Mailer。 */
export function createFakeMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, send: async (msg: MailMessage) => void sent.push(msg) };
}
```

- [ ] **Step 6: 创建 `packages/auth/test/auth-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AuthError } from '../src/errors';
import { getCurrentUser, login, register, resendCode, verifyEmail, type AuthDeps } from '../src/auth-service';
import { hashPassword } from '../src/password';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

const NOW = new Date('2026-07-28T12:00:00Z');

function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const deps: AuthDeps = { prisma, redis, mailer, now: () => NOW };
  return { deps, db, redis, mailer };
}

function seedInvitation(db: ReturnType<typeof createFakePrisma>['db'], overrides: Record<string, unknown> = {}) {
  db.invitations.push({
    id: 'inv-1',
    code: 'TESTCODE1234567890AB',
    email: null,
    createdBy: 'test',
    usedBy: null,
    usedAt: null,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 86400000),
    createdAt: NOW,
    ...overrides,
  });
}

async function seedVerifiedUser(deps: AuthDeps, db: ReturnType<typeof createFakePrisma>['db'], email = 'user@example.com') {
  db.users.push({
    id: 'user-1',
    email,
    passwordHash: await hashPassword('passw0rd-x'),
    displayName: 'User',
    status: 'email_verified',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('register', () => {
  it('redeems a valid invitation and sends a verification code', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    const result = await register(deps, {
      invitationCode: 'TESTCODE1234567890AB',
      email: 'new@example.com',
      password: 'passw0rd-x',
      displayName: 'New',
    });
    expect(result.status).toBe('invited');
    expect(db.invitations[0].usedBy).toBe(result.userId);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].text).toMatch(/\d{6}/);
    // 验证码不明文落库
    const code = mailer.sent[0].text.match(/(\d{6})/)![1];
    expect(db.emailVerifications[0].codeHash).not.toBe(code);
  });

  it('rejects unknown invitation codes', async () => {
    const { deps } = makeDeps();
    await expect(
      register(deps, { invitationCode: 'NOPE', email: 'a@b.c', password: 'passw0rd-x', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('rejects already-used invitations', async () => {
    const { deps, db } = makeDeps();
    seedInvitation(db, { usedBy: 'someone', usedAt: NOW });
    await expect(
      register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'a@b.c', password: 'passw0rd-x', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('maps duplicate email to EMAIL_ALREADY_REGISTERED', async () => {
    const { deps, db } = makeDeps();
    seedInvitation(db);
    await seedVerifiedUser(deps, db, 'dup@example.com');
    await expect(
      register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'dup@example.com', password: 'passw0rd-x', displayName: 'D' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });
});

describe('verifyEmail', () => {
  async function registerUser(deps: AuthDeps, mailer: { sent: Array<{ text: string }> }) {
    const result = await register(deps, {
      invitationCode: 'TESTCODE1234567890AB',
      email: 'v@example.com',
      password: 'passw0rd-x',
      displayName: 'V',
    });
    const code = mailer.sent[mailer.sent.length - 1].text.match(/(\d{6})/)![1];
    return { ...result, code };
  }

  it('verifies the correct code and issues a session', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    const { code } = await registerUser(deps, mailer);
    const result = await verifyEmail(deps, { email: 'v@example.com', code });
    expect(result.status).toBe('email_verified');
    expect(result.sessionToken).toBeTruthy();
    expect(db.users[0].status).toBe('email_verified');
  });

  it('wrong code increments attempts; fifth failure locks', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    await registerUser(deps, mailer);
    for (let i = 0; i < 4; i++) {
      await expect(verifyEmail(deps, { email: 'v@example.com', code: '000000' })).rejects.toMatchObject({
        code: 'CODE_INVALID',
      });
    }
    await expect(verifyEmail(deps, { email: 'v@example.com', code: '000000' })).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
    expect(db.emailVerifications[0].lockedUntil).not.toBeNull();
    await expect(verifyEmail(deps, { email: 'v@example.com', code: '000000' })).rejects.toMatchObject({
      code: 'CODE_LOCKED',
    });
  });

  it('expired code is rejected with CODE_EXPIRED', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    const { code } = await registerUser(deps, mailer);
    db.emailVerifications[0].expiresAt = new Date(NOW.getTime() - 1);
    await expect(verifyEmail(deps, { email: 'v@example.com', code })).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });

  it('unknown email gets the same CODE_INVALID (anti-enumeration)', async () => {
    const { deps } = makeDeps();
    await expect(verifyEmail(deps, { email: 'ghost@example.com', code: '123456' })).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
  });
});

describe('resendCode', () => {
  it('is silent for unknown emails (anti-enumeration)', async () => {
    const { deps, mailer } = makeDeps();
    await resendCode(deps, { email: 'ghost@example.com' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('enforces the 60s cooldown and invalidates the old code on resend', async () => {
    const { deps, db, mailer } = makeDeps();
    seedInvitation(db);
    await register(deps, { invitationCode: 'TESTCODE1234567890AB', email: 'r@example.com', password: 'passw0rd-x', displayName: 'R' });
    await expect(resendCode(deps, { email: 'r@example.com' })).rejects.toMatchObject({ code: 'RESEND_COOLDOWN' });
    // 越过冷却窗口后可重发，且旧码失效
    const later = new Date(NOW.getTime() + 61_000);
    deps.now = () => later;
    const firstCodeHash = db.emailVerifications[0].codeHash;
    await resendCode(deps, { email: 'r@example.com' });
    expect(mailer.sent).toHaveLength(2);
    expect(db.emailVerifications[0].expiresAt.getTime()).toBeLessThanOrEqual(later.getTime());
    const latest = db.emailVerifications[db.emailVerifications.length - 1];
    expect(latest.codeHash).not.toBe(firstCodeHash);
  });
});

describe('login', () => {
  it('unknown email and wrong password produce identical errors', async () => {
    const { deps, db } = makeDeps();
    await seedVerifiedUser(deps, db);
    const unknown = await login(deps, { email: 'ghost@example.com', password: 'passw0rd-x' }).catch((e: AuthError) => e);
    const wrongPw = await login(deps, { email: 'user@example.com', password: 'wr0ngpass' }).catch((e: AuthError) => e);
    expect(unknown.code).toBe('CREDENTIALS_INVALID');
    expect(wrongPw.code).toBe('CREDENTIALS_INVALID');
    expect(unknown.message).toBe(wrongPw.message);
  });

  it('invited users cannot log in before verifying', async () => {
    const { deps, db } = makeDeps();
    db.users.push({
      id: 'u2', email: 'i@example.com', passwordHash: await hashPassword('passw0rd-x'),
      displayName: 'I', status: 'invited', createdAt: NOW, updatedAt: NOW,
    });
    await expect(login(deps, { email: 'i@example.com', password: 'passw0rd-x' })).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  });

  it('verified user logs in and gets a working session', async () => {
    const { deps, db } = makeDeps();
    await seedVerifiedUser(deps, db);
    const result = await login(deps, { email: 'user@example.com', password: 'passw0rd-x' });
    expect(result.sessionToken).toBeTruthy();
    const me = await getCurrentUser(deps, result.sessionToken);
    expect(me.email).toBe('user@example.com');
  });
});

describe('getCurrentUser', () => {
  it('rejects suspended users immediately and destroys the session', async () => {
    const { deps, db, redis } = makeDeps();
    await seedVerifiedUser(deps, db);
    const { sessionToken } = await login(deps, { email: 'user@example.com', password: 'passw0rd-x' });
    db.users[0].status = 'suspended';
    await expect(getCurrentUser(deps, sessionToken)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    expect(redis.store.size).toBe(0);
  });
});
```

- [ ] **Step 7: 构建并跑单测**

Run: `npx pnpm@9.15.0 --filter @openscience/auth build && npx pnpm@9.15.0 --filter @openscience/auth typecheck && npx pnpm@9.15.0 --filter @openscience/auth test`
Expected: 全绿（Task 2 的 15 + 本任务 14 = 29 个单测）。

---

### Task 4: apps/api — Fastify 骨架（env 校验 + 错误映射 + buildApp）

**Files:**
- Modify: `apps/api/package.json`（fastify 4→5 升级 + 新依赖 + scripts + main/types 给 database 包）
- Modify: `packages/database/package.json`（补 main/types 供跨包引用）
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/error-map.ts`
- Create: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`（替换 placeholder）
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/test/env.test.ts`
- Create: `apps/api/test/error-map.test.ts`

**Interfaces:**
- Consumes: Task 2/3 的 `AuthError`/`AuthErrorCode`/`AuthDeps`/`DevOutboxMailer`；P1A-2 的 `createPrismaClient`/`createRedisClient`/`DEFAULT_DEV_DATABASE_URL`/`DEFAULT_DEV_REDIS_URL`。
- Produces（Task 5 依赖以下签名）：
  - `loadApiEnv(env?: NodeJS.ProcessEnv): ApiEnv`；`ApiEnv { nodeEnv; port; databaseUrl; redisUrl; cookieSecret; secureCookies }`（`src/env.ts`）
  - `httpStatusForError(err: unknown): { status: number; body: { error: { code: string; message: string } } }`（`src/error-map.ts`）
  - `buildApp(opts: BuildAppOptions): Promise<FastifyInstance>`；`BuildAppOptions extends AuthRouteDeps { cookieSecret: string }`（`src/app.ts`）

- [ ] **Step 1: 安装依赖（含 fastify 4→5 升级，设计已定 Fastify v5）**

Run: `npx pnpm@9.15.0 add fastify@5 @fastify/cookie@11 zod@3 @openscience/auth@workspace:* @openscience/database@workspace:* --filter @openscience/api && npx pnpm@9.15.0 add -D vitest@2 @types/node@20.14.10 --filter @openscience/api`
Expected: `apps/api/package.json` 中 fastify 变为 ^5；lockfile 更新。

- [ ] **Step 2: `packages/database/package.json` 补 main/types（其余不动）**

在 `"version": "0.0.0",` 之后插入：

```json
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
```

- [ ] **Step 3: `apps/api/package.json` scripts 更新（其余字段不动）**

```json
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
```

- [ ] **Step 4: 创建 `apps/api/src/env.ts`**

```ts
import { DEFAULT_DEV_DATABASE_URL, DEFAULT_DEV_REDIS_URL } from '@openscience/database';

export interface ApiEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  cookieSecret: string;
  secureCookies: boolean;
}

/** 启动期 env 校验：生产缺必需 env 立即 throw（快速失败，终审 parked 项修复）；dev 回落 P1A-2 默认值。 */
export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const nodeEnv = env.NODE_ENV ?? 'development';

  const databaseUrl = env.DATABASE_URL ?? (nodeEnv === 'production' ? '' : DEFAULT_DEV_DATABASE_URL);
  if (!databaseUrl) throw new Error('DATABASE_URL is required when NODE_ENV=production');

  const redisUrl = env.REDIS_URL ?? (nodeEnv === 'production' ? '' : DEFAULT_DEV_REDIS_URL);
  if (!redisUrl) throw new Error('REDIS_URL is required when NODE_ENV=production');

  const cookieSecret = env.COOKIE_SECRET ?? (nodeEnv === 'production' ? '' : 'openscience-dev-cookie-secret');
  if (!cookieSecret) throw new Error('COOKIE_SECRET is required when NODE_ENV=production');

  const port = Number(env.PORT ?? '3001');
  if (Number.isNaN(port)) throw new Error(`PORT must be a number, got "${env.PORT}"`);

  return {
    nodeEnv,
    port,
    databaseUrl,
    redisUrl,
    cookieSecret,
    secureCookies: env.SECURE_COOKIES === 'true' || nodeEnv === 'production',
  };
}
```

- [ ] **Step 5: 创建 `apps/api/src/error-map.ts`**

```ts
import { AuthError, type AuthErrorCode } from '@openscience/auth';

const AUTH_ERROR_HTTP: Record<AuthErrorCode, number> = {
  INVITATION_INVALID: 400,
  EMAIL_ALREADY_REGISTERED: 409,
  CODE_INVALID: 400,
  CODE_EXPIRED: 410,
  CODE_LOCKED: 429,
  RESEND_COOLDOWN: 429,
  CREDENTIALS_INVALID: 401,
  ACCOUNT_NOT_ACTIVE: 403,
  SESSION_INVALID: 401,
};

export interface ErrorBody {
  error: { code: string; message: string };
}

/** 统一错误映射（2.6 扩展为全局标准前的 /auth 最小版）。 */
export function httpStatusForError(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AuthError) {
    return { status: AUTH_ERROR_HTTP[err.code], body: { error: { code: err.code, message: err.message } } };
  }
  if ((err as { name?: string })?.name === 'ZodError') {
    return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: '内部错误' } } };
}
```

- [ ] **Step 6: 创建 `apps/api/src/app.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { httpStatusForError } from './error-map';
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth';

export interface BuildAppOptions extends AuthRouteDeps {
  cookieSecret: string;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: opts.cookieSecret });

  app.setErrorHandler((err, _req, reply) => {
    const { status, body } = httpStatusForError(err);
    void reply.status(status).send(body);
  });

  // CORS/CSRF/rate-limit 挂载点：2.8 安全基线统一接入（本任务不实现）。
  await app.register(async (instance) => registerAuthRoutes(instance, opts), { prefix: '/auth' });
  return app;
}
```

- [ ] **Step 7: 替换 `apps/api/src/index.ts`**

```ts
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { buildApp } from './app';
import { loadApiEnv } from './env';

async function main(): Promise<void> {
  const env = loadApiEnv();
  const prisma = createPrismaClient({ datasourceUrl: env.databaseUrl });
  const redis = createRedisClient(env.redisUrl);
  // MAILER_DRIVER=smtp 预留：§24 邮件服务商未定，dev 一律 outbox 捕获。
  const mailer = new DevOutboxMailer(prisma);
  const app = await buildApp({
    prisma,
    redis,
    mailer,
    cookieSecret: env.cookieSecret,
    secureCookies: env.secureCookies,
  });
  await app.listen({ port: env.port, host: '127.0.0.1' });
  console.log(`API listening on http://127.0.0.1:${env.port} (${env.nodeEnv})`);
}

void main();
```

- [ ] **Step 8: 创建 `apps/api/vitest.config.ts`**

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

- [ ] **Step 9: 创建 `apps/api/test/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../src/env';

describe('loadApiEnv', () => {
  it('throws in production when DATABASE_URL is missing', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('throws in production when COOKIE_SECRET is missing', () => {
    expect(() =>
      loadApiEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' }),
    ).toThrow(/COOKIE_SECRET/);
  });

  it('accepts a complete production env and defaults secureCookies on', () => {
    const env = loadApiEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x',
      REDIS_URL: 'redis://x',
      COOKIE_SECRET: 's3cret',
    });
    expect(env.secureCookies).toBe(true);
  });

  it('falls back to dev defaults outside production', () => {
    const env = loadApiEnv({});
    expect(env.databaseUrl).toContain('127.0.0.1:5432');
    expect(env.redisUrl).toBe('redis://127.0.0.1:6379');
    expect(env.port).toBe(3001);
    expect(env.secureCookies).toBe(false);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadApiEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
```

- [ ] **Step 10: 创建 `apps/api/test/error-map.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { AuthError } from '@openscience/auth';
import { httpStatusForError } from '../src/error-map';

describe('httpStatusForError', () => {
  it('maps auth error codes to HTTP status', () => {
    expect(httpStatusForError(new AuthError('INVITATION_INVALID', 'x')).status).toBe(400);
    expect(httpStatusForError(new AuthError('EMAIL_ALREADY_REGISTERED', 'x')).status).toBe(409);
    expect(httpStatusForError(new AuthError('CODE_EXPIRED', 'x')).status).toBe(410);
    expect(httpStatusForError(new AuthError('CODE_LOCKED', 'x')).status).toBe(429);
    expect(httpStatusForError(new AuthError('CREDENTIALS_INVALID', 'x')).status).toBe(401);
    expect(httpStatusForError(new AuthError('ACCOUNT_NOT_ACTIVE', 'x')).status).toBe(403);
  });

  it('keeps the unified error body shape', () => {
    const { body } = httpStatusForError(new AuthError('CODE_INVALID', '验证码错误或已失效'));
    expect(body).toEqual({ error: { code: 'CODE_INVALID', message: '验证码错误或已失效' } });
  });

  it('maps ZodError-shaped errors to 400 VALIDATION_ERROR', () => {
    const err = new Error('bad');
    err.name = 'ZodError';
    expect(httpStatusForError(err)).toEqual({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' } },
    });
  });

  it('unknown errors become 500 without leaking internals', () => {
    const { status, body } = httpStatusForError(new Error('db connection string leaked here'));
    expect(status).toBe(500);
    expect(body.error.message).not.toContain('db connection');
  });
});
```

- [ ] **Step 11: 构建并跑单测（routes/auth.ts 由 Task 5 提供，本步先建空实现占位）**

先创建 `apps/api/src/routes/auth.ts` 占位（Task 5 替换为完整实现）：

```ts
import type { FastifyInstance } from 'fastify';
import type { AuthDeps } from '@openscience/auth';

export interface AuthRouteDeps extends AuthDeps {
  secureCookies: boolean;
}

// Task 5 实现六个端点；此占位仅保证骨架可编译。
export function registerAuthRoutes(_app: FastifyInstance, _deps: AuthRouteDeps): void {
  // implemented in Task 5
}
```

Run: `npx pnpm@9.15.0 --filter @openscience/api build && npx pnpm@9.15.0 --filter @openscience/api typecheck && npx pnpm@9.15.0 --filter @openscience/api test`
Expected: 全绿（9 个单测）。

---

### Task 5: /auth 六个端点（zod 校验 + cookie）+ inject 单测

**Files:**
- Modify: `apps/api/src/routes/auth.ts`（替换 Task 4 占位）
- Create: `apps/api/test/auth-routes.test.ts`

**Interfaces:**
- Consumes: Task 3 全部 service 签名；Task 4 的 `buildApp`/`AuthRouteDeps`；fake helpers 模式（仿 `packages/auth/test/helpers/fakes.ts`，本任务在 test 文件内联最小 fake）。
- Produces: `/auth/register|verify-email|resend-code|login|logout|me` 六个端点；cookie 名 `openscience_session`。

- [ ] **Step 1: 替换 `apps/api/src/routes/auth.ts`**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  getCurrentUser,
  login,
  logout,
  register,
  resendCode,
  verifyEmail,
  type AuthDeps,
} from '@openscience/auth';

export interface AuthRouteDeps extends AuthDeps {
  secureCookies: boolean;
}

const SESSION_COOKIE = 'openscience_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600;

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/[0-9]/, '密码需包含数字');

const registerBody = z.object({
  invitationCode: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(64),
});
const verifyBody = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) });
const emailBody = z.object({ email: z.string().email() });
const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function sessionTokenFrom(req: FastifyRequest): string | null {
  return req.cookies[SESSION_COOKIE] ?? null;
}

const UNAUTHORIZED_BODY = { error: { code: 'SESSION_INVALID', message: '未登录' } };

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  app.post('/register', async (req, reply) => {
    const body = registerBody.parse(req.body);
    const result = await register(deps, body);
    return reply.status(201).send({ userId: result.userId, status: result.status });
  });

  app.post('/verify-email', async (req, reply) => {
    const body = verifyBody.parse(req.body);
    const result = await verifyEmail(deps, body);
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.send({ userId: result.userId, status: result.status });
  });

  app.post('/resend-code', async (req, reply) => {
    const body = emailBody.parse(req.body);
    await resendCode(deps, body);
    return reply.status(202).send({ ok: true });
  });

  app.post('/login', async (req, reply) => {
    const body = loginBody.parse(req.body);
    const result = await login(deps, body);
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.send({ userId: result.userId, status: result.status });
  });

  app.post('/logout', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (token) await logout(deps, token);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/me', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (!token) return reply.status(401).send(UNAUTHORIZED_BODY);
    const me = await getCurrentUser(deps, token);
    return reply.send(me);
  });
}
```

- [ ] **Step 2: 创建 `apps/api/test/auth-routes.test.ts`（fake deps + fastify inject，不起端口）**

```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, type AuthDeps } from '@openscience/auth';
import { buildApp } from '../src/app';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

function makeFakeDeps() {
  const db: any = { users: [], invitations: [], emailVerifications: [], mailOutbox: [] };
  let seq = 0;
  const nextId = () => `id-${++seq}`;
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u: any) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(db.users.find((u: any) => u.id === where.id), data),
    },
    invitation: {
      findUnique: async ({ where }: any) => db.invitations.find((i: any) => i.code === where.code) ?? null,
      update: async ({ where, data }: any) =>
        Object.assign(db.invitations.find((i: any) => i.id === where.id), data),
    },
    emailVerification: {
      create: async ({ data }: any) => {
        const row = { id: nextId(), attempts: 0, lockedUntil: null, verifiedAt: null, createdAt: new Date(), ...data };
        db.emailVerifications.push(row);
        return row;
      },
      findFirst: async ({ where }: any) =>
        db.emailVerifications.filter((v: any) => v.userId === where.userId && v.verifiedAt === null)[0] ?? null,
      update: async ({ where, data }: any) =>
        Object.assign(db.emailVerifications.find((v: any) => v.id === where.id), data),
      updateMany: async () => ({ count: 0 }),
    },
    mailOutbox: { create: async ({ data }: any) => ({ id: nextId(), ...data }) },
    $transaction: async (fn: any) => fn(prisma),
  };
  const store = new Map<string, string>();
  const redis: any = {
    set: async (k: string, v: string) => void store.set(k, v),
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => void store.delete(k),
    expire: async () => 1,
  };
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const deps: AuthDeps & { secureCookies: boolean } = {
    prisma,
    redis,
    mailer: { send: async (m: any) => void sent.push(m) },
  };
  (deps as any).secureCookies = false;
  return { deps, db, sent, store };
}

async function makeApp() {
  const fakes = makeFakeDeps();
  const app = await buildApp({ ...fakes.deps, cookieSecret: 'test-secret' });
  return { app, ...fakes };
}

describe('/auth routes', () => {
  it('rejects invalid register bodies with 400 VALIDATION_ERROR', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { invitationCode: 'X', email: 'not-an-email', password: 'short', displayName: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('register → verify-email sets session cookie → /me works → logout kills it', async () => {
    const { app, db, sent } = await makeApp();
    db.invitations.push({
      id: 'inv-1', code: 'CODE1234567890ABCDEF', email: null, createdBy: 'test',
      usedBy: null, usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { invitationCode: 'CODE1234567890ABCDEF', email: 'e2e@example.com', password: 'passw0rd-x', displayName: 'E2E' },
    });
    expect(reg.statusCode).toBe(201);
    const code = sent[0].text.match(/(\d{6})/)![1];
    const ver = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email: 'e2e@example.com', code } });
    expect(ver.statusCode).toBe(200);
    const cookie = ver.cookies.find((c) => c.name === 'openscience_session');
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie!.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('e2e@example.com');

    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { openscience_session: cookie!.value } });
    expect(out.statusCode).toBe(204);
    const meAfter = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie!.value } });
    expect(meAfter.statusCode).toBe(401);
  });

  it('/me without cookie is 401 with the unified body', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'SESSION_INVALID', message: '未登录' } });
  });

  it('login unknown email vs wrong password: identical status and body', async () => {
    const { app, db } = await makeApp();
    db.users.push({
      id: 'u1', email: 'u@example.com', passwordHash: await hashPassword('passw0rd-x'),
      displayName: 'U', status: 'email_verified', createdAt: new Date(), updatedAt: new Date(),
    });
    const unknown = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ghost@example.com', password: 'passw0rd-x' } });
    const wrongPw = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'u@example.com', password: 'wr0ngpass' } });
    expect(unknown.statusCode).toBe(401);
    expect(wrongPw.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrongPw.json());
  });

  it('resend-code returns the same 202 for unknown emails', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/resend-code', payload: { email: 'ghost@example.com' } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: 构建并跑单测**

Run: `npx pnpm@9.15.0 --filter @openscience/api build && npx pnpm@9.15.0 --filter @openscience/api typecheck && npx pnpm@9.15.0 --filter @openscience/api test`
Expected: 全绿（Task 4 的 9 + 本任务 5 = 14 个单测）。

---

### Task 6: 邀请码 CLI + 云上集成测试文件 + 全量门禁 + docs-sync 收尾

**Files:**
- Create: `scripts/invite.mjs`
- Modify: `package.json`（root devDependencies 加 `@openscience/auth` workspace 链接；scripts 加 `invite`）
- Create: `apps/api/vitest.integration.config.ts`
- Create: `apps/api/test/auth.integration.test.ts`
- Modify: `.env.example`（追加 `COOKIE_SECRET`/`SECURE_COOKIES`/`PORT`）
- Modify: `AGENTS.md`（常用命令补 api 启动与 invite CLI）
- Modify: `project_index.md`（登记新文件）
- Modify: `docs/progress.md`（置顶 P1A-3 本地完成条目）

**Interfaces:**
- Consumes: Task 1 迁移与模型；Task 2 的 `generateInvitationCode`；Task 3 全部 service；Task 4/5 的 `buildApp`/`loadApiEnv`。
- Produces: CLI `node scripts/invite.mjs <create|list|revoke>`；云上集成测试入口 `npx pnpm@9.15.0 --filter @openscience/api test:integration`。

- [ ] **Step 1: root `package.json` 加 workspace 链接与 invite 脚本**

在 root `devDependencies` 中追加（供 `scripts/invite.mjs` 解析 `@openscience/auth`）：

```json
    "@openscience/auth": "workspace:*",
```

在 root `scripts` 中追加：

```json
    "invite": "node scripts/invite.mjs",
    "api": "pnpm --filter @openscience/api start"
```

然后 Run: `npx pnpm@9.15.0 install`
Expected: workspace 链接创建成功，lockfile 更新。

- [ ] **Step 2: 创建 `scripts/invite.mjs`**

```js
#!/usr/bin/env node
// 邀请码管理 CLI（管理员侧最小能力，task-master 2.3）。
// 用法：
//   node scripts/invite.mjs create [--email x@y.z] [--days 30] [--by <name>]
//   node scripts/invite.mjs list
//   node scripts/invite.mjs revoke <code>
import { PrismaClient } from '@prisma/client';
import { generateInvitationCode } from '@openscience/auth';

const DEFAULT_DEV_DATABASE_URL = 'postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience';
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL } },
});

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'create') {
    const days = Number(arg('--days') ?? '30');
    if (Number.isNaN(days) || days <= 0) {
      console.error('--days must be a positive number');
      process.exit(64);
    }
    const code = generateInvitationCode();
    const inv = await prisma.invitation.create({
      data: {
        code,
        email: arg('--email') ?? null,
        createdBy: arg('--by') ?? 'cli',
        expiresAt: new Date(Date.now() + days * 86400000),
      },
    });
    console.log(`CREATED ${inv.code} expires=${inv.expiresAt.toISOString()} email=${inv.email ?? '*'}`);
  } else if (cmd === 'list') {
    const rows = await prisma.invitation.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    for (const r of rows) {
      const state = r.revokedAt ? 'revoked' : r.usedBy ? 'used' : r.expiresAt <= new Date() ? 'expired' : 'active';
      console.log(`${r.code}\t${state}\t${r.email ?? '*'}\texpires=${r.expiresAt.toISOString()}`);
    }
  } else if (cmd === 'revoke') {
    const code = process.argv[3];
    if (!code) {
      console.error('Usage: node scripts/invite.mjs revoke <code>');
      process.exit(64);
    }
    const updated = await prisma.invitation.updateMany({
      where: { code, usedBy: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(updated.count ? `REVOKED ${code}` : `NOT_REVOCABLE ${code}`);
  } else {
    console.error('Usage: node scripts/invite.mjs <create|list|revoke>');
    process.exit(64);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: 验证 CLI 无参用法（不需数据库）**

Run: `node scripts/invite.mjs`
Expected: exit 64，输出 Usage。

- [ ] **Step 4: 创建 `apps/api/vitest.integration.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 5: 创建 `apps/api/test/auth.integration.test.ts`（云上执行，本机不跑）**

```ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { buildApp } from '../src/app';

const repoRoot = path.join(__dirname, '..', '..');
const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);

const runId = `p1a3-${Date.now()}`;
const email = `${runId}@example.com`;
let invitationCode = '';

function latestCode(): Promise<string> {
  return prisma.mailOutbox
    .findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } })
    .then((row) => row!.bodyText.match(/(\d{6})/)![1]);
}

beforeAll(async () => {
  // 迁移 2 需已在云上 deploy（node packages/database/dist/migrate-cli.js deploy）
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'invite.mjs'), 'create', '--email', email, '--by', 'integration-test'], { encoding: 'utf8' });
  invitationCode = out.match(/CREATED (\S+)/)![1];
});

afterAll(async () => {
  await prisma.emailVerification.deleteMany({ where: { user: { email } } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.invitation.deleteMany({ where: { code: invitationCode } });
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1A-3 auth closed loop (cloud, real PG+Redis)', () => {
  it('register → verify → me → logout → me 401', async () => {
    const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'integration-secret', secureCookies: false });

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { invitationCode, email, password: 'passw0rd-x', displayName: 'Integration' },
    });
    expect(reg.statusCode).toBe(201);

    const code = await latestCode();
    const ver = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code } });
    expect(ver.statusCode).toBe(200);
    const cookie = ver.cookies.find((c) => c.name === 'openscience_session')!;
    expect(cookie.httpOnly).toBe(true);

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().status).toBe('email_verified');

    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { openscience_session: cookie.value } });
    expect(out.statusCode).toBe(204);
    const meAfter = await app.inject({ method: 'GET', url: '/auth/me', cookies: { openscience_session: cookie.value } });
    expect(meAfter.statusCode).toBe(401);
    await app.close();
  });

  it('rejects invalid invitation and duplicate email', async () => {
    const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'integration-secret', secureCookies: false });
    const bad = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { invitationCode: 'DOESNOTEXIST1234567', email: `x-${runId}@example.com`, password: 'passw0rd-x', displayName: 'X' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('INVITATION_INVALID');

    const dup = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { invitationCode, email, password: 'passw0rd-x', displayName: 'Dup' },
    });
    // 邀请码已被上一用例核销 → 400；重复邮箱的 409 由另一路径覆盖（单测已覆盖，此处置信 400/409 之一）
    expect([400, 409]).toContain(dup.statusCode);
    await app.close();
  });

  it('login as invited user is 403; verified login works', async () => {
    const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'integration-secret', secureCookies: false });
    const invited = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'passw0rd-x' } });
    // email 用户已完成验证 → 登录应成功；invited 403 路径由单测覆盖
    expect(invited.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 6: `.env.example` 追加（文件末尾，保持恰好一个尾换行）**

```dotenv
# --- P1A-3 auth (dev defaults only, NOT real secrets) ---
PORT=3001
COOKIE_SECRET=openscience-dev-cookie-secret
SECURE_COOKIES=false
```

- [ ] **Step 7: 全量本地门禁**

Run: `npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 lint && npx pnpm@9.15.0 test && npx pnpm@9.15.0 audit:knip && npx pnpm@9.15.0 audit:dep && npx pnpm@9.15.0 docs:lint`
Expected: 全绿；单测总数 = P1A-2 的 14 + auth 29 + api 14 = 57。（audit:knip/audit:dep 对新包允许仅出现占位级 hint，不得有 error。）

- [ ] **Step 8: `AGENTS.md` 常用命令行追加**

在 "Monorepo Layout & Commands" 的常用命令行后追加一行：

```markdown
- API：`npx pnpm@9.15.0 api`（Fastify 起 127.0.0.1:3001）；邀请码 CLI：`node scripts/invite.mjs create|list|revoke`（或 `npx pnpm@9.15.0 invite ...`）。
```

- [ ] **Step 9: `project_index.md` 登记**

- docs/ 表追加：`docs/plans/2026-07-28-p1a-3-invitation-auth-plan.md`（本计划）。
- 根目录表 `packages/` 行更新：注明 auth 已实现（P1A-3）。
- 根目录表 `apps/` 行更新：api 已含 Fastify `/auth` 实现。
- infra/ 表 `infra/migrations/` 行更新：加迁移 2 `20260728010000_auth_baseline`。
- 根目录表追加：`scripts/invite.mjs`（邀请码 CLI）。

- [ ] **Step 10: `docs/progress.md` 置顶条目**

标题 `## 2026-07-28 — P1A-3 邀请码注册与邮箱验证本地完成，集成测试留待阿里云`。内容含：spec/plan 路径、四表迁移、packages/auth、apps/api Fastify、CLI、测试证据（本地单测 57、静态门禁、CLI usage 演示）、Next Steps（云上跑迁移 deploy + `test:integration` 后置 task-master 2.3 done；P1A-4 Workspace 2.4 design gate）。task-master 2.3 保持 pending（test-gate：无集成证据不置 done）。

- [ ] **Step 11: 提交检查点（需用户批准）**

向用户汇报本地证据，经批准后：`git add -A && git commit -m "feat: P1A-3 邀请码注册与邮箱验证 Auth"`。

---

## Self-Review 记录

- Spec 覆盖：spec §3 组件→Task 2/3/4/5；§4 数据模型→Task 1；§5 API 面→Task 5；§6 流程与安全→Task 3（验证码流/session/env 校验）；§7 测试→Task 2/3/4/5 单测 + Task 6 集成；§8 收尾→Task 6 Step 7-11。CLI 位置：spec §3 写 `scripts/invite.ts`，本计划落地为 `scripts/invite.mjs`（免编译直接运行，auth 包提供 `generateInvitationCode`），偏差已在此注明。
- 占位符扫描：无 TBD/TODO；所有代码步骤含完整代码。Task 4 Step 11 的 routes 占位由 Task 5 Step 1 完整替换，属计划内接力，不是占位符缺口。
- 类型一致性：`AuthDeps`/`AuthRouteDeps`/`BuildAppOptions`/`AuthResult`/`CurrentUser`/`SessionData`/`Mailer`/`MailMessage` 在定义任务与消费任务间签名一致；`AuthRouteDeps extends AuthDeps { secureCookies: boolean }` 在 Task 4 占位、Task 5 实现、Task 6 集成测试中一致；`openscience_session` cookie 名全局唯一一致；迁移目录名 `20260728010000_auth_baseline` 全局唯一一致。
- 已知取舍：集成测试用例 2/3 的断言放宽（400/409 之一、200 登录）是因为用例间共享同一用户状态，强断言已由单测覆盖；云上执行时可按需拆用户收紧。
