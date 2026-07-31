# P1A-4 Workspace 模型与成员管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地统一 Workspace 模型：邮箱验证通过自动创建 Personal Workspace；team workspace 创建/邀请/成员管理/转让/归档闭环：`packages/domain` 首个领域模块 + `apps/api` `/workspaces` 15 端点 + 迁移 3 三张表。

**Architecture:** 领域逻辑全部在 `packages/domain`（纯 TS，依赖注入 PrismaClient/Mailer，不依赖 HTTP 框架）；`apps/api` 只做薄路由层（zod 解析 → `requireCurrentUser` → 调 domain → 错误映射）；`packages/auth` 的 `verifyEmail` 增加可选 `onEmailVerified` 回调，由 `apps/api` 组装时注入 domain 的 `createPersonalWorkspace`（同事务，避免 auth→domain 反向依赖）；权限检查为最小内联（非成员 404 / 角色不足 403），完整 RBAC 归 2.5。

**Tech Stack:** pnpm workspace（`npx pnpm@9.15.0`）、TypeScript 5.5（NodeNext/CJS）、Prisma 5.22、Fastify 5 + @fastify/cookie 11、zod 3、Vitest 2。

**设计依据：** `docs/specs/2026-07-29-p1a-4-workspace-design.md`（已批准，2026-07-29 用户逐节确认）。

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`，不全局安装。
- 全程不 `git add/commit/push`，仅 Task 7 最后一步提交检查点（需用户批准）。
- 不读取/打印 `.env`；密钥只来自 env，新代码不得引入新必需 env。
- 本机不执行任何 Docker 命令（用户 2026-07-28 指示）；迁移不 deploy、集成测试不运行，留待阿里云。
- 迁移纪律：手写 `migration.sql` + `rollback.sql`（补偿式，逆序 DROP + 删 `_prisma_migrations` 行）；生产禁自动破坏性迁移。
- TS 约定：`strict`、NodeNext、相对导入不写扩展名；测试 fake 允许文件头 `/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离 Prisma 完整类型 */`。
- 错误码命名沿用 P1A-3 SCREAMING_SNAKE 约定（`AuthError` 的先例），机器可读 code 不用 snake_case。
- 范围红线：不实现 RBAC 守卫抽象（2.5）、不建 AuditLog 表（2.6，写路径只留 `// audit(2.6): ...` 注释）、不加 QuotaPolicy 字段（2.7）、不加 slug、不写 web UI。
- 安全纪律：跨 workspace 访问与邀请 accept/decline 一律 404（不泄露存在性）；受保护端点统一走 `requireCurrentUser`。
- 版本钉法照抄既有包：`@prisma/client`/`prisma` 精确 `5.22.0`、`vitest` 钉 `2`、`@types/node` `20.14.10`、ioredis `5`、跨包依赖 `workspace:^`。

## 开发态默认值（全计划统一引用，同 P1A-2/P1A-3）

| 项 | 值 |
|---|---|
| DATABASE_URL | `postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience`（`packages/database/src/dev-defaults.ts`，不手抄，走 `createPrismaClient()` 默认） |
| REDIS_URL | `redis://127.0.0.1:6379`（同上） |
| session cookie | `openscience_session`（HttpOnly，P1A-3） |
| 邀请有效期 | 7 天（`expiresAt = now + 7*24*3600*1000`） |

---

### Task 1: 迁移 3（三表 + 枚举 + 部分唯一索引）与 schema.prisma 更新

**Files:**
- Create: `infra/migrations/20260729010000_workspace_baseline/migration.sql`
- Create: `infra/migrations/20260729010000_workspace_baseline/rollback.sql`
- Modify: `infra/schema.prisma`（末尾追加枚举与三表；`User` 模型加 3 行反向 relation）

**Interfaces:**
- Consumes: 既有 `users` 表（迁移 2）；`infra/migrations/20260728010000_auth_baseline/` 的文件格式。
- Produces: Prisma 生成物中的 `Workspace` / `Membership` / `WorkspaceInvitation` 模型与 `WorkspaceType` / `WorkspaceStatus` / `WorkspaceRole` / `WorkspaceInvitationStatus` 枚举（Task 2-6 全部依赖）；`memberships` 复合唯一 `@@unique([workspaceId, userId])`（Prisma 查询键 `workspaceId_userId`）。

- [ ] **Step 1: 更新 `infra/schema.prisma`**

`User` 模型的 relation 区追加 3 行（其余不动）：

```prisma
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

  ownedWorkspaces          Workspace[]           @relation("WorkspaceOwner")
  memberships              Membership[]
  sentWorkspaceInvitations WorkspaceInvitation[] @relation("WorkspaceInvitationInviter")

  @@map("users")
}
```

文件末尾追加：

```prisma
enum WorkspaceType {
  personal
  team
}

enum WorkspaceStatus {
  active
  archived
}

enum WorkspaceRole {
  owner
  maintainer
  author
  contributor
  reviewer
  viewer
}

enum WorkspaceInvitationStatus {
  pending
  accepted
  declined
  revoked
  expired
}

model Workspace {
  id          String               @id @default(uuid()) @db.Uuid
  type        WorkspaceType
  name        String
  ownerId     String               @map("owner_id") @db.Uuid
  status      WorkspaceStatus      @default(active)
  createdAt   DateTime             @default(now()) @map("created_at")
  updatedAt   DateTime             @updatedAt @map("updated_at")
  owner       User                 @relation("WorkspaceOwner", fields: [ownerId], references: [id], onDelete: Restrict)
  members     Membership[]
  invitations WorkspaceInvitation[]

  @@map("workspaces")
}

model Membership {
  id          String        @id @default(uuid()) @db.Uuid
  workspaceId String        @map("workspace_id") @db.Uuid
  userId      String        @map("user_id") @db.Uuid
  role        WorkspaceRole
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([userId])
  @@map("memberships")
}

model WorkspaceInvitation {
  id            String                    @id @default(uuid()) @db.Uuid
  workspaceId   String                    @map("workspace_id") @db.Uuid
  email         String                    @db.Citext
  role          WorkspaceRole
  status        WorkspaceInvitationStatus @default(pending)
  invitedBy     String                    @map("invited_by") @db.Uuid
  expiresAt     DateTime                  @map("expires_at")
  respondedAt   DateTime?                 @map("responded_at")
  createdAt     DateTime                  @default(now()) @map("created_at")
  updatedAt     DateTime                  @updatedAt @map("updated_at")
  workspace     Workspace                 @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedByUser User                      @relation("WorkspaceInvitationInviter", fields: [invitedBy], references: [id], onDelete: Restrict)

  @@index([workspaceId])
  @@index([email])
  @@map("workspace_invitations")
}
```

- [ ] **Step 2: 写 `infra/migrations/20260729010000_workspace_baseline/migration.sql`**

注意：`workspaces_personal_owner_key` 部分唯一索引 Prisma schema 不支持表达，只能手写 SQL；`prisma migrate deploy` 只执行 SQL 不校验 schema 漂移，云上 `migrate dev` 类命令禁用（走 migrate-cli 白名单），无冲突。

```sql
CREATE TYPE "WorkspaceType" AS ENUM ('personal', 'team');
CREATE TYPE "WorkspaceStatus" AS ENUM ('active', 'archived');
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'maintainer', 'author', 'contributor', 'reviewer', 'viewer');
CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "WorkspaceType" NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 一个用户最多一个 personal 空间（Prisma schema 不支持部分唯一索引，此处手写）
CREATE UNIQUE INDEX "workspaces_personal_owner_key" ON "workspaces"("owner_id") WHERE "type" = 'personal';

CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

CREATE TABLE "workspace_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "workspace_invitations_workspace_id_idx" ON "workspace_invitations"("workspace_id");
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations"("email");
```

- [ ] **Step 3: 写 `infra/migrations/20260729010000_workspace_baseline/rollback.sql`**

```sql
-- Compensation rollback for 20260729010000_workspace_baseline.
DROP TABLE IF EXISTS "workspace_invitations";
DROP TABLE IF EXISTS "memberships";
DROP TABLE IF EXISTS "workspaces";
DROP TYPE IF EXISTS "WorkspaceInvitationStatus";
DROP TYPE IF EXISTS "WorkspaceRole";
DROP TYPE IF EXISTS "WorkspaceStatus";
DROP TYPE IF EXISTS "WorkspaceType";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260729010000_workspace_baseline';
```

- [ ] **Step 4: 验证 generate + typecheck**

Run: `npx pnpm@9.15.0 --filter @openscience/database build`
Expected: exit 0（`prisma generate` 重新生成含三模型的 client + tsc 通过）。

补充验证生成物含新模型：

Run: `node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); console.log(typeof p.workspace.findUnique, typeof p.membership.findUnique, typeof p.workspaceInvitation.findUnique)"`
Expected: 输出 `function function function`（不连数据库，仅实例化）。

---

### Task 2: `packages/domain` 包基建 + errors/types + Personal Workspace 创建（TDD）

**Files:**
- Modify: `packages/domain/package.json`（补 main/types/test/scripts/依赖）
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/workspace/errors.ts`
- Create: `packages/domain/src/workspace/types.ts`
- Create: `packages/domain/src/workspace/personal.ts`
- Modify: `packages/domain/src/index.ts`（替换占位）
- Test: `packages/domain/test/helpers/fakes.ts`
- Test: `packages/domain/test/workspace-personal.test.ts`

**Interfaces:**
- Consumes: `Mailer` 类型（`@openscience/auth`，type-only import）；Prisma 生成物（Task 1）。
- Produces:
  - `WorkspaceError` / `WorkspaceErrorCode`（`packages/domain/src/workspace/errors.ts`）
  - `WorkspaceDeps { prisma: PrismaClient; mailer: Mailer; now?: () => Date }`（types.ts）
  - `createPersonalWorkspace(tx: Prisma.TransactionClient, user: { id: string; email: string; displayName: string }): Promise<void>`（personal.ts）——Task 5/6 注入 `verifyEmail`

- [ ] **Step 1: 改 `packages/domain/package.json`（全量替换）**

```json
{
  "name": "@openscience/domain",
  "private": true,
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@openscience/auth": "workspace:^",
    "@prisma/client": "5.22.0"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "vitest": "2"
  }
}
```

说明：`@openscience/auth` 仅用于 `import type { Mailer }`（type-only），不产生运行时循环；auth 不依赖 domain。

- [ ] **Step 2: 写 `packages/domain/vitest.config.ts`（照抄 auth 包同款）**

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

- [ ] **Step 3: 写 `packages/domain/src/workspace/errors.ts`**

```ts
export type WorkspaceErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_MEMBER'
  | 'INVITATION_PENDING_EXISTS'
  | 'LAST_OWNER'
  | 'PERSONAL_WORKSPACE'
  | 'WORKSPACE_ARCHIVED'
  | 'VALIDATION_ERROR';

export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
```

- [ ] **Step 4: 写 `packages/domain/src/workspace/types.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { Mailer } from '@openscience/auth';

export interface WorkspaceDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
}

export function now(deps: WorkspaceDeps): Date {
  return deps.now ? deps.now() : new Date();
}
```

- [ ] **Step 5: 写失败测试 `packages/domain/test/helpers/fakes.ts` + `test/workspace-personal.test.ts`**

`test/helpers/fakes.ts`（domain 全部单测共用，Task 3/4 直接复用）：

```ts
import type { PrismaClient } from '@prisma/client';
import type { Mailer, MailMessage } from '@openscience/auth';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离 Prisma 完整类型 */

interface FakeDb {
  users: any[];
  workspaces: any[];
  memberships: any[];
  workspaceInvitations: any[];
  mailOutbox: any[];
}

/** 内存版 Prisma 子集：覆盖 workspace 领域用到的调用面。 */
export function createFakePrisma(): { prisma: PrismaClient; db: FakeDb } {
  const db: FakeDb = { users: [], workspaces: [], memberships: [], workspaceInvitations: [], mailOutbox: [] };
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const p2002 = () => {
    const err = new Error('Unique constraint failed') as Error & { code: string };
    err.code = 'P2002';
    return err;
  };

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u) =>
          where.email ? u.email.toLowerCase() === where.email.toLowerCase() : u.id === where.id,
        ) ?? null,
    },
    workspace: {
      findUnique: async ({ where }: any) => db.workspaces.find((w) => w.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        db.workspaces.find(
          (w) =>
            (where.type === undefined || w.type === where.type) &&
            (where.ownerId === undefined || w.ownerId === where.ownerId),
        ) ?? null,
      create: async ({ data }: any) => {
        if (data.type === 'personal' && db.workspaces.some((w) => w.type === 'personal' && w.ownerId === data.ownerId)) {
          throw p2002(); // 部分唯一索引 workspaces_personal_owner_key
        }
        const row = {
          id: nextId(),
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        delete row.members;
        db.workspaces.push(row);
        if (data.members?.create) {
          db.memberships.push({
            id: nextId(),
            workspaceId: row.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data.members.create,
          });
        }
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.workspaces.find((w) => w.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    membership: {
      findUnique: async ({ where }: any) =>
        db.memberships.find(
          (m) => m.workspaceId === where.workspaceId_userId.workspaceId && m.userId === where.workspaceId_userId.userId,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.memberships.filter(
          (m) =>
            (where.userId === undefined || m.userId === where.userId) &&
            (where.workspaceId === undefined || m.workspaceId === where.workspaceId),
        ),
      count: async ({ where }: any) =>
        db.memberships.filter((m) => m.workspaceId === where.workspaceId && (where.role === undefined || m.role === where.role)).length,
      create: async ({ data }: any) => {
        if (db.memberships.some((m) => m.workspaceId === data.workspaceId && m.userId === data.userId)) throw p2002();
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.memberships.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.memberships.find((m) => m.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = db.memberships.findIndex((m) => m.id === where.id);
        return db.memberships.splice(idx, 1)[0];
      },
      upsert: async ({ where, create }: any) => {
        const existing = db.memberships.find(
          (m) => m.workspaceId === where.workspaceId_userId.workspaceId && m.userId === where.workspaceId_userId.userId,
        );
        if (existing) return existing;
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...create };
        db.memberships.push(row);
        return row;
      },
    },
    workspaceInvitation: {
      findUnique: async ({ where }: any) => db.workspaceInvitations.find((i) => i.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        db.workspaceInvitations.find(
          (i) =>
            i.workspaceId === where.workspaceId &&
            i.email.toLowerCase() === where.email.toLowerCase() &&
            i.status === where.status,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.workspaceInvitations.filter(
          (i) => i.email.toLowerCase() === where.email.toLowerCase() && i.status === where.status,
        ),
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'pending', respondedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.workspaceInvitations.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of db.workspaceInvitations) {
          if (i.id === where.id && (where.status === undefined || i.status === where.status)) {
            Object.assign(i, data);
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

/** 记录发送内容的 fake Mailer。 */
export function createFakeMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return { sent, send: async (msg: MailMessage) => void sent.push(msg) };
}

/** 造一个 email_verified 用户行。 */
export function seedUser(db: { users: any[] }, overrides: Record<string, unknown> = {}): any {
  const n = db.users.length + 1;
  const user = {
    id: `user-${n}`,
    email: `user${n}@example.com`,
    displayName: `User ${n}`,
    status: 'email_verified',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  db.users.push(user);
  return user;
}
```

`test/workspace-personal.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createPersonalWorkspace } from '../src/workspace/personal';
import { createFakePrisma } from './helpers/fakes';

describe('createPersonalWorkspace', () => {
  it('创建 personal workspace + owner membership', async () => {
    const { prisma, db } = createFakePrisma();
    await createPersonalWorkspace(prisma, { id: 'u1', email: 'a@example.com', displayName: 'Alice' });
    expect(db.workspaces).toHaveLength(1);
    expect(db.workspaces[0]).toMatchObject({ type: 'personal', ownerId: 'u1', name: 'Alice 的个人空间' });
    expect(db.memberships).toHaveLength(1);
    expect(db.memberships[0]).toMatchObject({ userId: 'u1', role: 'owner', workspaceId: db.workspaces[0].id });
  });

  it('重复调用幂等：返回既有空间，不重复建行', async () => {
    const { prisma, db } = createFakePrisma();
    const user = { id: 'u1', email: 'a@example.com', displayName: 'Alice' };
    await createPersonalWorkspace(prisma, user);
    await createPersonalWorkspace(prisma, user);
    expect(db.workspaces).toHaveLength(1);
    expect(db.memberships).toHaveLength(1);
  });

  it('并发撞部分唯一索引（P2002）时静默成功', async () => {
    const { prisma, db } = createFakePrisma();
    const user = { id: 'u1', email: 'a@example.com', displayName: 'Alice' };
    await Promise.all([
      createPersonalWorkspace(prisma, user),
      createPersonalWorkspace(prisma, user),
    ]);
    expect(db.workspaces).toHaveLength(1);
  });

  it('displayName 空白时回退邮箱前缀命名', async () => {
    const { prisma, db } = createFakePrisma();
    await createPersonalWorkspace(prisma, { id: 'u1', email: 'bob@example.com', displayName: '  ' });
    expect(db.workspaces[0].name).toBe('bob 的个人空间');
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: FAIL（`../src/workspace/personal` 不存在）。

- [ ] **Step 7: 写 `packages/domain/src/workspace/personal.ts`**

```ts
import type { Prisma } from '@prisma/client';

export interface PersonalWorkspaceUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * 邮箱验证通过回调：在同一事务内创建 Personal Workspace + owner Membership。
 * 幂等：已存在则直接返回；并发撞部分唯一索引（P2002）视为成功。
 */
export async function createPersonalWorkspace(
  tx: Prisma.TransactionClient,
  user: PersonalWorkspaceUser,
): Promise<void> {
  const existing = await tx.workspace.findFirst({ where: { type: 'personal', ownerId: user.id } });
  if (existing) return;
  const displayName = user.displayName.trim() || user.email.split('@')[0];
  try {
    await tx.workspace.create({
      data: {
        type: 'personal',
        name: `${displayName} 的个人空间`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'owner' } },
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return;
    throw err;
  }
}
```

- [ ] **Step 8: 替换 `packages/domain/src/index.ts`**

```ts
export { WorkspaceError, type WorkspaceErrorCode } from './workspace/errors';
export { now, type WorkspaceDeps } from './workspace/types';
export { createPersonalWorkspace, type PersonalWorkspaceUser } from './workspace/personal';
```

- [ ] **Step 9: 跑测试确认通过**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: PASS 4/4。

- [ ] **Step 10: install + 全仓 typecheck 防回归**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 typecheck`
Expected: exit 0（domain 新依赖解析正常，auth/api 未受影响）。

---

### Task 3: 空间 CRUD + 成员管理（`workspaces.ts` / `members.ts` / `helpers.ts`，TDD）

**Files:**
- Create: `packages/domain/src/workspace/helpers.ts`
- Create: `packages/domain/src/workspace/workspaces.ts`
- Create: `packages/domain/src/workspace/members.ts`
- Modify: `packages/domain/src/index.ts`（追加导出）
- Test: `packages/domain/test/workspace-crud.test.ts`
- Test: `packages/domain/test/workspace-members.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `WorkspaceDeps` / `WorkspaceError` / `now` / fakes。
- Produces（Task 6 路由层逐签名依赖）：
  - `WorkspaceSummary { id: string; type: string; name: string; status: string; role: string; createdAt: Date }`
  - `WorkspaceDetail extends WorkspaceSummary { memberCount: number }`
  - `MemberInfo { userId: string; email: string; displayName: string; role: string; joinedAt: Date }`
  - `listMyWorkspaces(deps: WorkspaceDeps, userId: string): Promise<WorkspaceSummary[]>`
  - `createTeamWorkspace(deps: WorkspaceDeps, input: { userId: string; name: string }): Promise<WorkspaceSummary>`
  - `getWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<WorkspaceDetail>`
  - `updateWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string, input: { name: string }): Promise<WorkspaceSummary>`
  - `archiveWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<void>`
  - `listMembers(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<MemberInfo[]>`
  - `changeMemberRole(deps: WorkspaceDeps, userId: string, workspaceId: string, targetUserId: string, newRole: string): Promise<void>`
  - `removeMember(deps: WorkspaceDeps, userId: string, workspaceId: string, targetUserId: string): Promise<void>`
  - `leaveWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<void>`
  - `transferOwnership(deps: WorkspaceDeps, userId: string, workspaceId: string, newOwnerId: string): Promise<void>`

- [ ] **Step 1: 写失败测试 `test/workspace-crud.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { WorkspaceError } from '../src/workspace/errors';
import { archiveWorkspace, createTeamWorkspace, getWorkspace, listMyWorkspaces, updateWorkspace } from '../src/workspace/workspaces';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

function setup() {
  const { prisma, db } = createFakePrisma();
  const mailer = createFakeMailer();
  return { deps: { prisma, mailer }, db };
}

describe('createTeamWorkspace', () => {
  it('创建 team 空间，创建者自动成为 owner', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'NLP Lab' });
    expect(ws).toMatchObject({ type: 'team', name: 'NLP Lab', status: 'active', role: 'owner' });
    expect(db.memberships[0]).toMatchObject({ workspaceId: ws.id, userId: 'u1', role: 'owner' });
  });

  it('名称为空白 → VALIDATION_ERROR', async () => {
    const { deps } = setup();
    await expect(createTeamWorkspace(deps, { userId: 'u1', name: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('名称超过 64 字符 → VALIDATION_ERROR', async () => {
    const { deps } = setup();
    await expect(createTeamWorkspace(deps, { userId: 'u1', name: 'x'.repeat(65) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('listMyWorkspaces / getWorkspace', () => {
  it('返回我加入的全部空间（含 personal 与 team）及我的角色', async () => {
    const { deps, db } = setup();
    const team = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.workspaces.push({ id: 'w-personal', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm-p', workspaceId: 'w-personal', userId: 'u1', role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    const list = await listMyWorkspaces(deps, 'u1');
    expect(list.map((w) => w.id).sort()).toEqual([team.id, 'w-personal'].sort());
    expect(list.find((w) => w.id === 'w-personal')?.type).toBe('personal');
  });

  it('成员可读详情；非成员与非存在 id 均 WORKSPACE_NOT_FOUND', async () => {
    const { deps } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    const detail = await getWorkspace(deps, 'u1', ws.id);
    expect(detail).toMatchObject({ id: ws.id, memberCount: 1, role: 'owner' });
    await expect(getWorkspace(deps, 'u2', ws.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(getWorkspace(deps, 'u1', 'no-such')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('updateWorkspace', () => {
  it('owner/maintainer 可改名；viewer → FORBIDDEN', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.memberships.push({ id: 'm2', workspaceId: ws.id, userId: 'u2', role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm3', workspaceId: ws.id, userId: 'u3', role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    const renamed = await updateWorkspace(deps, 'u2', ws.id, { name: 'New Name' });
    expect(renamed.name).toBe('New Name');
    await expect(updateWorkspace(deps, 'u3', ws.id, { name: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('已归档空间拒绝修改 → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.workspaces.find((w) => w.id === ws.id).status = 'archived';
    await expect(updateWorkspace(deps, 'u1', ws.id, { name: 'X' })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});

describe('archiveWorkspace', () => {
  it('owner 可归档 team；非 owner → FORBIDDEN；personal → PERSONAL_WORKSPACE；重复归档 → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    db.memberships.push({ id: 'm2', workspaceId: ws.id, userId: 'u2', role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    db.workspaces.push({ id: 'w-personal', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm-p', workspaceId: 'w-personal', userId: 'u1', role: 'owner', createdAt: new Date(), updatedAt: new Date() });

    await expect(archiveWorkspace(deps, 'u2', ws.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(archiveWorkspace(deps, 'u1', 'w-personal')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    await archiveWorkspace(deps, 'u1', ws.id);
    expect(db.workspaces.find((w) => w.id === ws.id).status).toBe('archived');
    await expect(archiveWorkspace(deps, 'u1', ws.id)).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});

describe('WorkspaceError 形态', () => {
  it('是 Error 子类且带 code', () => {
    expect(new WorkspaceError('FORBIDDEN', 'x')).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: 写失败测试 `test/workspace-members.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { changeMemberRole, leaveWorkspace, listMembers, removeMember, transferOwnership } from '../src/workspace/members';
import { createTeamWorkspace } from '../src/workspace/workspaces';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

function setup() {
  const { prisma, db } = createFakePrisma();
  const mailer = createFakeMailer();
  return { deps: { prisma, mailer }, db };
}

function addMember(db: any, workspaceId: string, userId: string, role: string) {
  db.memberships.push({ id: `m-${userId}`, workspaceId, userId, role, createdAt: new Date(), updatedAt: new Date() });
}

describe('listMembers', () => {
  it('成员可见成员列表；非成员 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    seedUser(db, { id: 'u2', email: 'b@example.com', displayName: 'Bob' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    const members = await listMembers(deps, 'u2', ws.id);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.userId === 'u2')).toMatchObject({ email: 'b@example.com', role: 'author' });
    await expect(listMembers(deps, 'u3', ws.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('changeMemberRole', () => {
  it('owner 可变更角色；maintainer → FORBIDDEN；改成 owner → VALIDATION_ERROR；目标非成员 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    addMember(db, ws.id, 'u3', 'maintainer');

    await changeMemberRole(deps, 'u1', ws.id, 'u2', 'reviewer');
    expect(db.memberships.find((m) => m.userId === 'u2').role).toBe('reviewer');
    await expect(changeMemberRole(deps, 'u3', ws.id, 'u2', 'viewer')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(changeMemberRole(deps, 'u1', ws.id, 'u2', 'owner')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(changeMemberRole(deps, 'u1', ws.id, 'u9', 'viewer')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });

  it('降级最后一个 owner → LAST_OWNER；存在第二 owner 时允许降级', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    await expect(changeMemberRole(deps, 'u1', ws.id, 'u1', 'maintainer')).rejects.toMatchObject({ code: 'LAST_OWNER' });
    addMember(db, ws.id, 'u2', 'owner');
    await changeMemberRole(deps, 'u1', ws.id, 'u2', 'maintainer');
    expect(db.memberships.find((m) => m.userId === 'u2').role).toBe('maintainer');
  });

  it('personal 空间拒绝角色变更 → PERSONAL_WORKSPACE', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');
    await expect(changeMemberRole(deps, 'u1', 'w-p', 'u1', 'viewer')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
  });
});

describe('removeMember', () => {
  it('owner 可移除任意非 owner；maintainer 只能移除普通成员；移除 owner → FORBIDDEN；目标非成员 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'maintainer');
    addMember(db, ws.id, 'u3', 'author');
    addMember(db, ws.id, 'u4', 'owner');

    await expect(removeMember(deps, 'u2', ws.id, 'u2')).rejects.toMatchObject({ code: 'FORBIDDEN' }); // maintainer 移除 maintainer
    await expect(removeMember(deps, 'u1', ws.id, 'u4')).rejects.toMatchObject({ code: 'FORBIDDEN' }); // owner 不可被移除
    await expect(removeMember(deps, 'u1', ws.id, 'u9')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await removeMember(deps, 'u2', ws.id, 'u3'); // maintainer 移除 author：允许
    expect(db.memberships.find((m) => m.userId === 'u3')).toBeUndefined();
  });

  it('personal 空间拒绝移除成员 → PERSONAL_WORKSPACE', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');
    await expect(removeMember(deps, 'u1', 'w-p', 'u1')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
  });
});

describe('leaveWorkspace', () => {
  it('普通成员可退出；最后一个 owner 退出 → LAST_OWNER；personal → PERSONAL_WORKSPACE', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');

    await leaveWorkspace(deps, 'u2', ws.id);
    expect(db.memberships.find((m) => m.userId === 'u2')).toBeUndefined();
    await expect(leaveWorkspace(deps, 'u1', ws.id)).rejects.toMatchObject({ code: 'LAST_OWNER' });
    await expect(leaveWorkspace(deps, 'u1', 'w-p')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
  });
});

describe('transferOwnership', () => {
  it('转让成功：原 owner 降 maintainer、新 owner 升任、ownerId 更新', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await transferOwnership(deps, 'u1', ws.id, 'u2');
    expect(db.memberships.find((m) => m.userId === 'u1').role).toBe('maintainer');
    expect(db.memberships.find((m) => m.userId === 'u2').role).toBe('owner');
    expect(db.workspaces.find((w) => w.id === ws.id).ownerId).toBe('u2');
  });

  it('非 owner 发起 → FORBIDDEN；转给非成员 → VALIDATION_ERROR；personal → PERSONAL_WORKSPACE；已归档 → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'maintainer');
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');

    await expect(transferOwnership(deps, 'u2', ws.id, 'u2')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(transferOwnership(deps, 'u1', ws.id, 'u9')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(transferOwnership(deps, 'u1', 'w-p', 'u1')).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    db.workspaces.find((w) => w.id === ws.id).status = 'archived';
    await expect(transferOwnership(deps, 'u1', ws.id, 'u2')).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: FAIL（`../src/workspace/workspaces` 等不存在）。

- [ ] **Step 4: 写 `packages/domain/src/workspace/helpers.ts`**

```ts
import type { Workspace, Membership, WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';
import type { WorkspaceDeps } from './types';

/** 成员身份前置：空间不存在或当前用户非成员，统一 404（不泄露空间存在性）。 */
export async function requireMembership(
  deps: WorkspaceDeps,
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const workspace = await deps.prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '空间不存在');
  return { workspace, membership };
}

export function requireRole(membership: Membership, roles: WorkspaceRole[]): void {
  if (!roles.includes(membership.role)) throw new WorkspaceError('FORBIDDEN', '权限不足');
}

export function requireActive(workspace: Workspace): void {
  if (workspace.status === 'archived') throw new WorkspaceError('WORKSPACE_ARCHIVED', '空间已归档，仅支持只读');
}

export function requireTeam(workspace: Workspace): void {
  if (workspace.type === 'personal') throw new WorkspaceError('PERSONAL_WORKSPACE', '个人空间不支持此操作');
}

export function validateWorkspaceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64) throw new WorkspaceError('VALIDATION_ERROR', '名称长度需为 1-64 字符');
  return trimmed;
}
```

- [ ] **Step 5: 写 `packages/domain/src/workspace/workspaces.ts`**

```ts
import { requireActive, requireMembership, requireRole, requireTeam, validateWorkspaceName } from './helpers';
import type { WorkspaceDeps } from './types';

export interface WorkspaceSummary {
  id: string;
  type: string;
  name: string;
  status: string;
  role: string;
  createdAt: Date;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  memberCount: number;
}

export async function listMyWorkspaces(deps: WorkspaceDeps, userId: string): Promise<WorkspaceSummary[]> {
  const rows = await deps.prisma.membership.findMany({ where: { userId } });
  const out: WorkspaceSummary[] = [];
  for (const m of rows) {
    const ws = await deps.prisma.workspace.findUnique({ where: { id: m.workspaceId } });
    if (ws) out.push({ id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: m.role, createdAt: ws.createdAt });
  }
  return out;
}

export async function createTeamWorkspace(
  deps: WorkspaceDeps,
  input: { userId: string; name: string },
): Promise<WorkspaceSummary> {
  const name = validateWorkspaceName(input.name);
  // audit(2.6): workspace.create
  const ws = await deps.prisma.workspace.create({
    data: { type: 'team', name, ownerId: input.userId, members: { create: { userId: input.userId, role: 'owner' } } },
  });
  return { id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: 'owner', createdAt: ws.createdAt };
}

export async function getWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<WorkspaceDetail> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  const memberCount = await deps.prisma.membership.count({ where: { workspaceId } });
  return {
    id: workspace.id,
    type: workspace.type,
    name: workspace.name,
    status: workspace.status,
    role: membership.role,
    createdAt: workspace.createdAt,
    memberCount,
  };
}

export async function updateWorkspace(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  input: { name: string },
): Promise<WorkspaceSummary> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner', 'maintainer']);
  requireActive(workspace);
  const name = validateWorkspaceName(input.name);
  // audit(2.6): workspace.update
  const ws = await deps.prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
  return { id: ws.id, type: ws.type, name: ws.name, status: ws.status, role: membership.role, createdAt: ws.createdAt };
}

export async function archiveWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner']);
  requireTeam(workspace);
  requireActive(workspace);
  // audit(2.6): workspace.archive
  await deps.prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'archived' } });
}
```

说明：`listMyWorkspaces` 逐 membership 查 workspace（MVP 成员数小，避免 fake 实现 `include`；1B 规模上来后可改 `include: { workspace: true }`）。

- [ ] **Step 6: 写 `packages/domain/src/workspace/members.ts`**

```ts
import type { WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';
import { requireActive, requireMembership, requireRole, requireTeam } from './helpers';
import type { WorkspaceDeps } from './types';

export interface MemberInfo {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: Date;
}

export async function listMembers(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<MemberInfo[]> {
  await requireMembership(deps, workspaceId, userId);
  const rows = await deps.prisma.membership.findMany({ where: { workspaceId } });
  const out: MemberInfo[] = [];
  for (const m of rows) {
    const user = await deps.prisma.user.findUnique({ where: { id: m.userId } });
    if (user) out.push({ userId: user.id, email: user.email, displayName: user.displayName, role: m.role, joinedAt: m.createdAt });
  }
  return out;
}

/** 变更角色（仅 owner）。改 owner 请走 transferOwnership。 */
export async function changeMemberRole(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  targetUserId: string,
  newRole: string,
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner']);
  requireTeam(workspace);
  requireActive(workspace);
  if (newRole === 'owner') throw new WorkspaceError('VALIDATION_ERROR', '变更所有权请使用转让接口');
  const target = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '该用户不是成员');
  if (target.role === 'owner') {
    const owners = await deps.prisma.membership.count({ where: { workspaceId, role: 'owner' } });
    if (owners <= 1) throw new WorkspaceError('LAST_OWNER', '空间至少保留一名 Owner');
  }
  // audit(2.6): workspace.member.changeRole
  await deps.prisma.membership.update({ where: { id: target.id }, data: { role: newRole as WorkspaceRole } });
}

/** 移除成员：owner 可移除任意非 owner；maintainer 只能移除普通成员；owner 不可被移除（先转让）。 */
export async function removeMember(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner', 'maintainer']);
  requireTeam(workspace);
  requireActive(workspace);
  const target = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) throw new WorkspaceError('WORKSPACE_NOT_FOUND', '该用户不是成员');
  if (target.role === 'owner') throw new WorkspaceError('FORBIDDEN', 'Owner 不可被移除，请先转让所有权');
  if (membership.role === 'maintainer' && target.role === 'maintainer') {
    throw new WorkspaceError('FORBIDDEN', 'Maintainer 不能移除同级成员');
  }
  // audit(2.6): workspace.member.remove
  await deps.prisma.membership.delete({ where: { id: target.id } });
}

/** 主动退出：owner 退出后剩余 owner 必须 ≥1（否则须先转让）。 */
export async function leaveWorkspace(deps: WorkspaceDeps, userId: string, workspaceId: string): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireTeam(workspace);
  if (membership.role === 'owner') {
    const owners = await deps.prisma.membership.count({ where: { workspaceId, role: 'owner' } });
    if (owners <= 1) throw new WorkspaceError('LAST_OWNER', 'Owner 退出前须先转让所有权');
  }
  // audit(2.6): workspace.member.leave
  await deps.prisma.membership.delete({ where: { id: membership.id } });
}

/** 转让所有权（仅 owner，team）：原 owner 降 maintainer、新 owner 升任、ownerId 更新，三步同事务。 */
export async function transferOwnership(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  newOwnerId: string,
): Promise<void> {
  const { workspace, membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner']);
  requireTeam(workspace);
  requireActive(workspace);
  const target = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
  });
  if (!target) throw new WorkspaceError('VALIDATION_ERROR', '新 Owner 必须是空间成员');
  // audit(2.6): workspace.transfer
  await deps.prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: { role: 'maintainer' } });
    await tx.membership.update({ where: { id: target.id }, data: { role: 'owner' } });
    await tx.workspace.update({ where: { id: workspaceId }, data: { ownerId: newOwnerId } });
  });
}
```

- [ ] **Step 7: `packages/domain/src/index.ts` 追加导出**

在 Task 2 内容后追加：

```ts
export {
  createTeamWorkspace,
  getWorkspace,
  listMyWorkspaces,
  updateWorkspace,
  archiveWorkspace,
  type WorkspaceDetail,
  type WorkspaceSummary,
} from './workspace/workspaces';
export {
  changeMemberRole,
  leaveWorkspace,
  listMembers,
  removeMember,
  transferOwnership,
  type MemberInfo,
} from './workspace/members';
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: PASS 22/22（Task 2 的 4 + 本任务 18）。

---

### Task 4: 邀请状态机（`invitations.ts`，TDD）

**Files:**
- Create: `packages/domain/src/workspace/invitations.ts`
- Modify: `packages/domain/src/index.ts`（追加导出）
- Test: `packages/domain/test/workspace-invitations.test.ts`

**Interfaces:**
- Consumes: Task 2/3 的 `WorkspaceDeps` / `WorkspaceError` / `now` / helpers / fakes；fake `workspaceInvitation.updateMany` 的 where 支持 `id` + `status` + `workspaceId` 条件。
- Produces（Task 6 路由层依赖）：
  - `INVITATION_TTL_MS = 7 * 24 * 3600 * 1000`
  - `InvitationInfo { id: string; workspaceId: string; workspaceName: string; role: string; invitedBy: string; expiresAt: Date; createdAt: Date }`
  - `AcceptResult { id: string; workspaceId: string; userId: string; role: string }`
  - `inviteMember(deps: WorkspaceDeps, userId: string, input: { workspaceId: string; email: string; role: WorkspaceRole }): Promise<{ invitationId: string }>`
  - `listMyInvitations(deps: WorkspaceDeps, email: string): Promise<InvitationInfo[]>`
  - `acceptInvitation(deps: WorkspaceDeps, user: { userId: string; email: string }, invitationId: string): Promise<AcceptResult>`
  - `declineInvitation(deps: WorkspaceDeps, user: { userId: string; email: string }, invitationId: string): Promise<void>`
  - `revokeInvitation(deps: WorkspaceDeps, userId: string, workspaceId: string, invitationId: string): Promise<void>`

- [ ] **Step 1: 先修 fake：`workspaceInvitation.updateMany` 支持 `workspaceId` 条件**

`packages/domain/test/helpers/fakes.ts` 中 `updateMany` 改为：

```ts
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of db.workspaceInvitations) {
          if (
            i.id === where.id &&
            (where.status === undefined || i.status === where.status) &&
            (where.workspaceId === undefined || i.workspaceId === where.workspaceId)
          ) {
            Object.assign(i, data);
            count++;
          }
        }
        return { count };
      },
```

- [ ] **Step 2: 写失败测试 `test/workspace-invitations.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { acceptInvitation, declineInvitation, inviteMember, listMyInvitations, revokeInvitation } from '../src/workspace/invitations';
import { createTeamWorkspace } from '../src/workspace/workspaces';
import { createFakeMailer, createFakePrisma, seedUser } from './helpers/fakes';

const AT = new Date('2026-07-29T00:00:00.000Z');

function setup() {
  const { prisma, db } = createFakePrisma();
  const mailer = createFakeMailer();
  const deps = { prisma, mailer, now: () => AT };
  return { deps, db, mailer };
}

function addMember(db: any, workspaceId: string, userId: string, role: string) {
  db.memberships.push({ id: `m-${userId}`, workspaceId, userId, role, createdAt: new Date(), updatedAt: new Date() });
}

async function seedInvitation(db: any, overrides: Record<string, unknown> = {}) {
  const inv = {
    id: `inv-${db.workspaceInvitations.length + 1}`,
    workspaceId: 'w1',
    email: 'invitee@example.com',
    role: 'author',
    status: 'pending',
    invitedBy: 'u1',
    expiresAt: new Date(AT.getTime() + 7 * 24 * 3600 * 1000),
    respondedAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
  db.workspaceInvitations.push(inv);
  return inv;
}

describe('inviteMember', () => {
  it('创建 pending 邀请（7 天过期 + 预指派角色）并发出通知邮件', async () => {
    const { deps, db, mailer } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    const { invitationId } = await inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'x@example.com', role: 'author' });
    const inv = db.workspaceInvitations.find((i) => i.id === invitationId);
    expect(inv).toMatchObject({ status: 'pending', role: 'author', invitedBy: 'u1' });
    expect(inv.expiresAt.getTime() - AT.getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('x@example.com');
  });

  it('受邀邮箱已是成员 → ALREADY_MEMBER；同邮箱已有待邀 → INVITATION_PENDING_EXISTS', async () => {
    const { deps, db } = setup();
    seedUser(db, { id: 'u2', email: 'b@example.com' });
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    await expect(inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'b@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    await inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'c@example.com', role: 'viewer' });
    await expect(inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'c@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'INVITATION_PENDING_EXISTS' });
  });

  it('author 邀请 → FORBIDDEN；personal → PERSONAL_WORKSPACE；archived → WORKSPACE_ARCHIVED', async () => {
    const { deps, db } = setup();
    const ws = await createTeamWorkspace(deps, { userId: 'u1', name: 'Lab' });
    addMember(db, ws.id, 'u2', 'author');
    db.workspaces.push({ id: 'w-p', type: 'personal', name: '我的空间', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w-p', 'u1', 'owner');

    await expect(inviteMember(deps, 'u2', { workspaceId: ws.id, email: 'x@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(inviteMember(deps, 'u1', { workspaceId: 'w-p', email: 'x@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    db.workspaces.find((w) => w.id === ws.id).status = 'archived';
    await expect(inviteMember(deps, 'u1', { workspaceId: ws.id, email: 'x@example.com', role: 'viewer' })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
  });
});

describe('listMyInvitations', () => {
  it('只返回我的 pending 且未过期邀请，含空间名', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w1', type: 'team', name: 'Lab', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await seedInvitation(db, { id: 'ok' });
    await seedInvitation(db, { id: 'expired', expiresAt: new Date(AT.getTime() - 1000) });
    await seedInvitation(db, { id: 'other', email: 'someone@example.com' });
    await seedInvitation(db, { id: 'done', status: 'accepted' });
    const list = await listMyInvitations(deps, 'invitee@example.com');
    expect(list.map((i) => i.id)).toEqual(['ok']);
    expect(list[0].workspaceName).toBe('Lab');
  });
});

describe('acceptInvitation', () => {
  it('接受成功：创建 membership（预指派角色）+ 邀请转 accepted', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    const result = await acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id);
    expect(result).toMatchObject({ workspaceId: 'w1', userId: 'u9', role: 'author' });
    expect(db.workspaceInvitations[0]).toMatchObject({ status: 'accepted', respondedAt: AT });
  });

  it('重复 accept 幂等：返回同一 membership，不报错', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    const user = { userId: 'u9', email: 'invitee@example.com' };
    const first = await acceptInvitation(deps, user, inv.id);
    const second = await acceptInvitation(deps, user, inv.id);
    expect(second.id).toBe(first.id);
    expect(db.memberships.filter((m) => m.userId === 'u9')).toHaveLength(1);
  });

  it('accept 前已是成员（并发兜底路径）：upsert 返回既有 membership，不重复建行', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    addMember(db, 'w1', 'u9', 'viewer');
    const result = await acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id);
    expect(result.id).toBe('m-u9');
    expect(db.memberships.filter((m) => m.userId === 'u9')).toHaveLength(1);
  });

  it('邮箱不匹配 / 已过期 / 已 decline → 统一 WORKSPACE_NOT_FOUND（枚举面控制）', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    await expect(acceptInvitation(deps, { userId: 'u8', email: 'other@example.com' }, inv.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, 'no-such')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    const expired = await seedInvitation(db, { id: 'exp', expiresAt: new Date(AT.getTime() - 1000) });
    await expect(acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, expired.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    const declined = await seedInvitation(db, { id: 'dec', status: 'declined' });
    await expect(acceptInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, declined.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('declineInvitation', () => {
  it('受邀者本人可 decline；重复 decline 或他人操作 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    const inv = await seedInvitation(db);
    await declineInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id);
    expect(db.workspaceInvitations[0]).toMatchObject({ status: 'declined', respondedAt: AT });
    await expect(declineInvitation(deps, { userId: 'u9', email: 'invitee@example.com' }, inv.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    const inv2 = await seedInvitation(db, { id: 'i2' });
    await expect(declineInvitation(deps, { userId: 'u8', email: 'other@example.com' }, inv2.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});

describe('revokeInvitation', () => {
  it('owner/maintainer 可撤销 pending 邀请；author → FORBIDDEN；不存在/已处理 → WORKSPACE_NOT_FOUND', async () => {
    const { deps, db } = setup();
    db.workspaces.push({ id: 'w1', type: 'team', name: 'Lab', ownerId: 'u1', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    addMember(db, 'w1', 'u1', 'owner');
    addMember(db, 'w1', 'u2', 'author');
    const inv = await seedInvitation(db);

    await expect(revokeInvitation(deps, 'u2', 'w1', inv.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await revokeInvitation(deps, 'u1', 'w1', inv.id);
    expect(db.workspaceInvitations[0]).toMatchObject({ status: 'revoked' });
    await expect(revokeInvitation(deps, 'u1', 'w1', inv.id)).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    await expect(revokeInvitation(deps, 'u1', 'w1', 'no-such')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: FAIL（`../src/workspace/invitations` 不存在）。

- [ ] **Step 4: 写 `packages/domain/src/workspace/invitations.ts`**

```ts
import type { WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from './errors';
import { requireActive, requireMembership, requireRole, requireTeam } from './helpers';
import { now, type WorkspaceDeps } from './types';

export const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

export interface InvitationInfo {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AcceptResult {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
}

const NOT_FOUND = () => new WorkspaceError('WORKSPACE_NOT_FOUND', '邀请不存在或已失效');

/** 邀请成员（owner/maintainer，team，active）：写 pending 邀请 + 通知邮件（MailOutbox 捕获通道）。 */
export async function inviteMember(
  deps: WorkspaceDeps,
  userId: string,
  input: { workspaceId: string; email: string; role: WorkspaceRole },
): Promise<{ invitationId: string }> {
  const { workspace, membership } = await requireMembership(deps, input.workspaceId, userId);
  requireRole(membership, ['owner', 'maintainer']);
  requireTeam(workspace);
  requireActive(workspace);

  const targetUser = await deps.prisma.user.findUnique({ where: { email: input.email } });
  if (targetUser) {
    const existingMembership = await deps.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: targetUser.id } },
    });
    if (existingMembership) throw new WorkspaceError('ALREADY_MEMBER', '该用户已是空间成员');
  }
  const pending = await deps.prisma.workspaceInvitation.findFirst({
    where: { workspaceId: input.workspaceId, email: input.email, status: 'pending' },
  });
  if (pending) throw new WorkspaceError('INVITATION_PENDING_EXISTS', '该邮箱已有待处理邀请，可先撤销后重发');

  // audit(2.6): workspace.invitation.create
  const inv = await deps.prisma.workspaceInvitation.create({
    data: {
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      invitedBy: userId,
      expiresAt: new Date(now(deps).getTime() + INVITATION_TTL_MS),
    },
  });
  await deps.mailer.send({
    to: input.email,
    subject: `「${workspace.name}」邀请你加入工作区`,
    text: `你被邀请以 ${input.role} 角色加入工作区「${workspace.name}」。登录后在“我的工作区邀请”中接受或拒绝。邀请 7 天内有效。`,
  });
  return { invitationId: inv.id };
}

/** 我收到的待邀列表：pending 且未过期（过期惰性判定，不写库）。 */
export async function listMyInvitations(deps: WorkspaceDeps, email: string): Promise<InvitationInfo[]> {
  const at = now(deps);
  const rows = await deps.prisma.workspaceInvitation.findMany({ where: { email, status: 'pending' } });
  const out: InvitationInfo[] = [];
  for (const inv of rows) {
    if (inv.expiresAt <= at) continue;
    const ws = await deps.prisma.workspace.findUnique({ where: { id: inv.workspaceId } });
    out.push({
      id: inv.id,
      workspaceId: inv.workspaceId,
      workspaceName: ws?.name ?? '',
      role: inv.role,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    });
  }
  return out;
}

/**
 * 接受邀请（幂等）：guarded updateMany 转 accepted + membership upsert。
 * 并发/重试：已 accepted 且本人已是成员 → 返回既有 membership；其余一律 404。
 */
export async function acceptInvitation(
  deps: WorkspaceDeps,
  user: { userId: string; email: string },
  invitationId: string,
): Promise<AcceptResult> {
  const at = now(deps);
  const inv = await deps.prisma.workspaceInvitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.email.toLowerCase() !== user.email.toLowerCase() || inv.expiresAt <= at) throw NOT_FOUND();
  return deps.prisma.$transaction(async (tx) => {
    const { count } = await tx.workspaceInvitation.updateMany({
      where: { id: inv.id, status: 'pending' },
      data: { status: 'accepted', respondedAt: at },
    });
    if (count !== 1) {
      const existing = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.userId } },
      });
      if (existing) return { id: existing.id, workspaceId: existing.workspaceId, userId: existing.userId, role: existing.role };
      throw NOT_FOUND();
    }
    // audit(2.6): workspace.invitation.accept
    const m = await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.userId } },
      create: { workspaceId: inv.workspaceId, userId: user.userId, role: inv.role },
      update: {},
    });
    return { id: m.id, workspaceId: m.workspaceId, userId: m.userId, role: m.role };
  });
}

/** 拒绝邀请：仅受邀者本人；非 pending 一律 404。 */
export async function declineInvitation(
  deps: WorkspaceDeps,
  user: { userId: string; email: string },
  invitationId: string,
): Promise<void> {
  const inv = await deps.prisma.workspaceInvitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.email.toLowerCase() !== user.email.toLowerCase()) throw NOT_FOUND();
  // audit(2.6): workspace.invitation.decline
  const { count } = await deps.prisma.workspaceInvitation.updateMany({
    where: { id: inv.id, status: 'pending' },
    data: { status: 'declined', respondedAt: now(deps) },
  });
  if (count !== 1) throw NOT_FOUND();
}

/** 撤销邀请（owner/maintainer）：仅 pending 可撤。 */
export async function revokeInvitation(
  deps: WorkspaceDeps,
  userId: string,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  const { membership } = await requireMembership(deps, workspaceId, userId);
  requireRole(membership, ['owner', 'maintainer']);
  // audit(2.6): workspace.invitation.revoke
  const { count } = await deps.prisma.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: 'pending' },
    data: { status: 'revoked', respondedAt: now(deps) },
  });
  if (count !== 1) throw NOT_FOUND();
}
```

- [ ] **Step 5: `packages/domain/src/index.ts` 追加导出**

```ts
export {
  acceptInvitation,
  declineInvitation,
  inviteMember,
  listMyInvitations,
  revokeInvitation,
  INVITATION_TTL_MS,
  type AcceptResult,
  type InvitationInfo,
} from './workspace/invitations';
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`
Expected: PASS 32/32（既有 22 + 本任务 10）。

---

### Task 5: `packages/auth` 增加 `onEmailVerified` 回调（最小改动，TDD）

**Files:**
- Modify: `packages/auth/src/auth-service.ts`（AuthDeps 加可选回调 + verifyEmail 事务内调用）
- Modify: `packages/auth/src/index.ts`（如未导出 `createSession`，补导出——Task 6 路由测试需要）
- Test: `packages/auth/test/auth-service.test.ts`（追加 2 用例）

**Interfaces:**
- Consumes: 既有 `verifyEmail(deps, input)`（auth-service.ts:115-118 的状态迁移事务）。
- Produces: `AuthDeps.onEmailVerified?: (tx: Prisma.TransactionClient, user: { id: string; email: string; displayName: string }) => Promise<void>`——Task 6 `apps/api/src/index.ts` 组装时注入 domain 的 `createPersonalWorkspace`（签名恰好匹配）。

- [ ] **Step 1: 追加失败测试（`packages/auth/test/auth-service.test.ts` 末尾新 describe）**

```ts
describe('verifyEmail onEmailVerified 回调（P1A-4）', () => {
  it('验证通过时在同事务内调用回调（tx + 用户信息）', async () => {
    const { prisma, db } = createFakePrisma();
    const redis = createFakeRedis();
    const mailer = createFakeMailer();
    const calls: Array<{ tx: unknown; user: { id: string; email: string; displayName: string } }> = [];
    const deps = {
      prisma,
      redis,
      mailer,
      onEmailVerified: async (tx: unknown, user: { id: string; email: string; displayName: string }) => {
        calls.push({ tx, user });
      },
    };
    // 复用文件内既有辅助造用户+验证码（与既有 verifyEmail 用例相同的 seed 方式）
    const user = await seedVerifiedFlowUser(deps, 'cb@example.com');
    await verifyEmail(deps, { email: 'cb@example.com', code: user.plainCode });
    expect(calls).toHaveLength(1);
    expect(calls[0].user).toMatchObject({ email: 'cb@example.com' });
    expect(calls[0].tx).toBe(prisma); // fake $transaction 的 tx 即 prisma 自身
  });

  it('回调抛错时 verifyEmail 整体失败（真实 PG 由事务回滚，云上集成测试覆盖）', async () => {
    const { prisma, db } = createFakePrisma();
    const redis = createFakeRedis();
    const mailer = createFakeMailer();
    const deps = {
      prisma,
      redis,
      mailer,
      onEmailVerified: async () => {
        throw new Error('boom');
      },
    };
    const user = await seedVerifiedFlowUser(deps, 'cb2@example.com');
    await expect(verifyEmail(deps, { email: 'cb2@example.com', code: user.plainCode })).rejects.toThrow('boom');
  });
});
```

说明：`seedVerifiedFlowUser` 是本计划对"既有 verifyEmail 用例的种子写法"的命名约定——执行时照抄该文件既有用例的种子代码（注册用户 + 生成验证码记录，保留明文 code），抽成局部 helper 或内联均可，**不得改变既有 30 用例**。若文件既有写法是内联 seed，本两例同样内联。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx pnpm@9.15.0 --filter @openscience/auth test`
Expected: FAIL（`onEmailVerified` 未被调用，calls 为空 / 不抛错）。

- [ ] **Step 3: 改 `packages/auth/src/auth-service.ts`**

文件头部 import 区加：

```ts
import type { Prisma } from '@prisma/client';
```

`AuthDeps` 接口加字段（注释照写）：

```ts
export interface AuthDeps {
  prisma: PrismaClient;
  redis: Redis;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
  /** 邮箱验证通过回调（同事务执行）：P1A-4 挂 Personal Workspace 创建；失败整体回滚。 */
  onEmailVerified?: (
    tx: Prisma.TransactionClient,
    user: { id: string; email: string; displayName: string },
  ) => Promise<void>;
}
```

`verifyEmail` 的事务块改为：

```ts
  const updated = await deps.prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({ where: { id: record.id }, data: { verifiedAt: at } });
    const u = await tx.user.update({ where: { id: user.id }, data: { status: 'email_verified' } });
    if (deps.onEmailVerified) {
      await deps.onEmailVerified(tx, { id: u.id, email: u.email, displayName: u.displayName });
    }
    return u;
  });
```

- [ ] **Step 4: 确认 `createSession` 已从 `packages/auth/src/index.ts` 导出**

Run: `npx pnpm@9.15.0 --filter @openscience/auth build && node -e "const a=require('@openscience/auth'); console.log(typeof a.createSession)"`
Expected: exit 0 且输出 `function`。若输出 `undefined`：在 `packages/auth/src/index.ts` 追加 `export { createSession } from './session';` 后重跑本步。

- [ ] **Step 5: 跑 auth 全量测试确认通过且无回归**

Run: `npx pnpm@9.15.0 --filter @openscience/auth test`
Expected: PASS 32/32（既有 30 + 新增 2）。

---

### Task 6: `apps/api` `/workspaces` 15 端点 + session-guard 抽取 + error-map 扩展（TDD）

**Files:**
- Create: `apps/api/src/routes/session-guard.ts`
- Modify: `apps/api/src/routes/auth.ts`（私有常量改从 session-guard 导入）
- Modify: `apps/api/src/error-map.ts`（加 WorkspaceError 分支）
- Create: `apps/api/src/routes/workspaces.ts`
- Modify: `apps/api/src/app.ts`（注册 /workspaces）
- Modify: `apps/api/src/index.ts`（注入 onEmailVerified）
- Modify: `apps/api/package.json`（加 `@openscience/domain` 依赖）
- Test: `apps/api/test/helpers/fakes.ts`
- Test: `apps/api/test/workspace-routes.test.ts`

**Interfaces:**
- Consumes: Task 2-5 全部 domain/auth 签名；`buildApp` / `AuthRouteDeps`（app.ts）；`createSession`（auth 包，Task 5 Step 4 已确保导出）。
- Produces: `/workspaces` 15 端点（见 spec §6）；`requireCurrentUser(deps, req, reply): Promise<CurrentUser | null>`（2.5 RBAC 守卫的直接前身）；`WorkspaceError` HTTP 映射表。

- [ ] **Step 1: 写 `apps/api/src/routes/session-guard.ts`**

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getCurrentUser, type AuthDeps, type CurrentUser } from '@openscience/auth';

export const SESSION_COOKIE = 'openscience_session';
export const UNAUTHORIZED_BODY = { error: { code: 'SESSION_INVALID', message: '未登录' } } as const;

export function sessionTokenFrom(req: FastifyRequest): string | null {
  return req.cookies[SESSION_COOKIE] ?? null;
}

/**
 * 受保护端点统一入口：无 token → 就地回 401 并返回 null；
 * token 无效/账户未激活 → AuthError 上抛，由全局 error handler 映射（401/403）。
 * 2.5 RBAC 将在此基础上扩展 workspace 角色守卫。
 */
export async function requireCurrentUser(
  deps: AuthDeps,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<CurrentUser | null> {
  const token = sessionTokenFrom(req);
  if (!token) {
    void reply.status(401).send(UNAUTHORIZED_BODY);
    return null;
  }
  return getCurrentUser(deps, token);
}
```

- [ ] **Step 2: 改 `apps/api/src/routes/auth.ts` 复用 session-guard（消除私有重复）**

删除文件内的 `const SESSION_COOKIE = ...`、`const UNAUTHORIZED_BODY = ...`、`function sessionTokenFrom(...)` 三处定义，改为：

```ts
import { SESSION_COOKIE, UNAUTHORIZED_BODY, sessionTokenFrom } from './session-guard';
```

`setSessionCookie` 保持原样（继续使用 `SESSION_COOKIE`）。其余端点逻辑不动。

- [ ] **Step 3: 改 `apps/api/src/error-map.ts`（全量替换）**

```ts
import { AuthError, type AuthErrorCode } from '@openscience/auth';
import { WorkspaceError, type WorkspaceErrorCode } from '@openscience/domain';

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

const WORKSPACE_ERROR_HTTP: Record<WorkspaceErrorCode, number> = {
  WORKSPACE_NOT_FOUND: 404,
  FORBIDDEN: 403,
  ALREADY_MEMBER: 409,
  INVITATION_PENDING_EXISTS: 409,
  LAST_OWNER: 409,
  PERSONAL_WORKSPACE: 409,
  WORKSPACE_ARCHIVED: 409,
  VALIDATION_ERROR: 400,
};

export interface ErrorBody {
  error: { code: string; message: string };
}

/** 统一错误映射（2.6 扩展为全局标准前的最小版：/auth + /workspaces）。 */
export function httpStatusForError(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AuthError) {
    return { status: AUTH_ERROR_HTTP[err.code], body: { error: { code: err.code, message: err.message } } };
  }
  if (err instanceof WorkspaceError) {
    return { status: WORKSPACE_ERROR_HTTP[err.code], body: { error: { code: err.code, message: err.message } } };
  }
  if ((err as { name?: string })?.name === 'ZodError') {
    return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: '内部错误' } } };
}
```

- [ ] **Step 4: 写 `apps/api/src/routes/workspaces.ts`（15 端点全量）**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import {
  acceptInvitation,
  archiveWorkspace,
  changeMemberRole,
  createTeamWorkspace,
  declineInvitation,
  getWorkspace,
  inviteMember,
  leaveWorkspace,
  listMembers,
  listMyInvitations,
  listMyWorkspaces,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateWorkspace,
} from '@openscience/domain';
import { requireCurrentUser } from './session-guard';

export type WorkspaceRouteDeps = AuthDeps;

const nonOwnerRoleSchema = z.enum(['maintainer', 'author', 'contributor', 'reviewer', 'viewer']);
const idParams = z.object({ id: z.string().uuid() });
const invIdParams = z.object({ id: z.string().uuid(), invId: z.string().uuid() });
const memberParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const nameBody = z.object({ name: z.string().min(1).max(64) });
const inviteBody = z.object({ email: z.string().email(), role: nonOwnerRoleSchema });
const changeRoleBody = z.object({ role: nonOwnerRoleSchema });
const transferBody = z.object({ newOwnerId: z.string().uuid() });

export function registerWorkspaceRoutes(app: FastifyInstance, deps: WorkspaceRouteDeps): void {
  app.get('/', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ workspaces: await listMyWorkspaces(deps, user.userId) });
  });

  app.post('/', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = nameBody.parse(req.body);
    const ws = await createTeamWorkspace(deps, { userId: user.userId, name: body.name });
    return reply.status(201).send(ws);
  });

  app.get('/invitations', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ invitations: await listMyInvitations(deps, user.email) });
  });

  app.post('/invitations/:id/accept', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const membership = await acceptInvitation(deps, { userId: user.userId, email: user.email }, id);
    return reply.status(201).send(membership);
  });

  app.post('/invitations/:id/decline', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    await declineInvitation(deps, { userId: user.userId, email: user.email }, id);
    return reply.status(204).send();
  });

  app.get('/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    return reply.send(await getWorkspace(deps, user.userId, id));
  });

  app.patch('/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = nameBody.parse(req.body);
    return reply.send(await updateWorkspace(deps, user.userId, id, body));
  });

  app.post('/:id/archive', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    await archiveWorkspace(deps, user.userId, id);
    return reply.status(204).send();
  });

  app.get('/:id/members', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    return reply.send({ members: await listMembers(deps, user.userId, id) });
  });

  app.post('/:id/invitations', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = inviteBody.parse(req.body);
    const result = await inviteMember(deps, user.userId, { workspaceId: id, email: body.email, role: body.role });
    return reply.status(202).send(result);
  });

  app.delete('/:id/invitations/:invId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, invId } = invIdParams.parse(req.params);
    await revokeInvitation(deps, user.userId, id, invId);
    return reply.status(204).send();
  });

  app.patch('/:id/members/:userId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, userId } = memberParams.parse(req.params);
    const body = changeRoleBody.parse(req.body);
    await changeMemberRole(deps, user.userId, id, userId, body.role);
    return reply.status(204).send();
  });

  app.delete('/:id/members/:userId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id, userId } = memberParams.parse(req.params);
    await removeMember(deps, user.userId, id, userId);
    return reply.status(204).send();
  });

  app.post('/:id/leave', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    await leaveWorkspace(deps, user.userId, id);
    return reply.status(204).send();
  });

  app.post('/:id/transfer', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = transferBody.parse(req.body);
    await transferOwnership(deps, user.userId, id, body.newOwnerId);
    return reply.status(204).send();
  });
}
```

注意：Fastify 路由树中静态段优先于参数段，`/invitations` 不会被 `/:id` 吞掉，注册顺序无关。

- [ ] **Step 5: 改 `apps/api/src/app.ts`**

import 区加 `import { registerWorkspaceRoutes } from './routes/workspaces';`，`/auth` 注册行后加：

```ts
  await app.register(async (instance) => registerWorkspaceRoutes(instance, opts), { prefix: '/workspaces' });
```

- [ ] **Step 6: 改 `apps/api/src/index.ts`**

import 区加 `import { createPersonalWorkspace } from '@openscience/domain';`，`buildApp` 调用改为：

```ts
  const app = await buildApp({
    prisma,
    redis,
    mailer,
    // P1A-4：邮箱验证通过同事务创建 Personal Workspace（回调注入，避免 auth→domain 反向依赖）
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: env.cookieSecret,
    secureCookies: env.secureCookies,
  });
```

- [ ] **Step 7: 改 `apps/api/package.json`**

`dependencies` 中 `"@openscience/database": "workspace:^"` 后加一行（保持字母序）：

```json
    "@openscience/domain": "workspace:^",
```

- [ ] **Step 8: install + typecheck 验证编译面**

Run: `npx pnpm@9.15.0 install && npx pnpm@9.15.0 typecheck`
Expected: exit 0。

- [ ] **Step 9: 写 `apps/api/test/helpers/fakes.ts`**

与 domain fake 同构（跨包不能引测试目录，故复制；加 redis/user.create 以满足 session 与路由面）。全量：

```ts
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Mailer, MailMessage } from '@openscience/auth';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离 Prisma 完整类型 */

interface FakeDb {
  users: any[];
  workspaces: any[];
  memberships: any[];
  workspaceInvitations: any[];
  mailOutbox: any[];
}

/** 内存版 Prisma 子集：覆盖 /workspaces 路由 + getCurrentUser 用到的调用面。 */
export function createFakePrisma(): { prisma: PrismaClient; db: FakeDb } {
  const db: FakeDb = { users: [], workspaces: [], memberships: [], workspaceInvitations: [], mailOutbox: [] };
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const p2002 = () => {
    const err = new Error('Unique constraint failed') as Error & { code: string };
    err.code = 'P2002';
    return err;
  };

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        db.users.find((u) =>
          where.email ? u.email.toLowerCase() === where.email.toLowerCase() : u.id === where.id,
        ) ?? null,
    },
    workspace: {
      findUnique: async ({ where }: any) => db.workspaces.find((w) => w.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        db.workspaces.find(
          (w) =>
            (where.type === undefined || w.type === where.type) &&
            (where.ownerId === undefined || w.ownerId === where.ownerId),
        ) ?? null,
      create: async ({ data }: any) => {
        if (data.type === 'personal' && db.workspaces.some((w) => w.type === 'personal' && w.ownerId === data.ownerId)) {
          throw p2002();
        }
        const row = { id: nextId(), status: 'active', createdAt: new Date(), updatedAt: new Date(), ...data };
        delete row.members;
        db.workspaces.push(row);
        if (data.members?.create) {
          db.memberships.push({ id: nextId(), workspaceId: row.id, createdAt: new Date(), updatedAt: new Date(), ...data.members.create });
        }
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.workspaces.find((w) => w.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    membership: {
      findUnique: async ({ where }: any) =>
        db.memberships.find(
          (m) => m.workspaceId === where.workspaceId_userId.workspaceId && m.userId === where.workspaceId_userId.userId,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.memberships.filter(
          (m) =>
            (where.userId === undefined || m.userId === where.userId) &&
            (where.workspaceId === undefined || m.workspaceId === where.workspaceId),
        ),
      count: async ({ where }: any) =>
        db.memberships.filter((m) => m.workspaceId === where.workspaceId && (where.role === undefined || m.role === where.role)).length,
      create: async ({ data }: any) => {
        if (db.memberships.some((m) => m.workspaceId === data.workspaceId && m.userId === data.userId)) throw p2002();
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
        db.memberships.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = db.memberships.find((m) => m.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = db.memberships.findIndex((m) => m.id === where.id);
        return db.memberships.splice(idx, 1)[0];
      },
      upsert: async ({ where, create }: any) => {
        const existing = db.memberships.find(
          (m) => m.workspaceId === where.workspaceId_userId.workspaceId && m.userId === where.workspaceId_userId.userId,
        );
        if (existing) return existing;
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...create };
        db.memberships.push(row);
        return row;
      },
    },
    workspaceInvitation: {
      findUnique: async ({ where }: any) => db.workspaceInvitations.find((i) => i.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        db.workspaceInvitations.find(
          (i) =>
            i.workspaceId === where.workspaceId &&
            i.email.toLowerCase() === where.email.toLowerCase() &&
            i.status === where.status,
        ) ?? null,
      findMany: async ({ where }: any) =>
        db.workspaceInvitations.filter(
          (i) => i.email.toLowerCase() === where.email.toLowerCase() && i.status === where.status,
        ),
      create: async ({ data }: any) => {
        const row = { id: nextId(), status: 'pending', respondedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        db.workspaceInvitations.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of db.workspaceInvitations) {
          if (
            i.id === where.id &&
            (where.status === undefined || i.status === where.status) &&
            (where.workspaceId === undefined || i.workspaceId === where.workspaceId)
          ) {
            Object.assign(i, data);
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

/** 内存版 Redis 子集：set/get/del/expire（session 用）。 */
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

- [ ] **Step 10: 写失败测试 `apps/api/test/workspace-routes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createSession } from '@openscience/auth';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakePrisma, createFakeRedis } from './helpers/fakes';

/* eslint-disable @typescript-eslint/no-explicit-any -- 测试 fake 刻意脱离完整类型 */

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

async function setup() {
  const { prisma, db } = createFakePrisma();
  const redis = createFakeRedis();
  const mailer = createFakeMailer();
  const app = await buildApp({ prisma, redis, mailer, cookieSecret: 'test-secret', secureCookies: false });
  const loginAs = async (userId: string, email: string, displayName = 'User'): Promise<string> => {
    db.users.push({ id: userId, email, displayName, passwordHash: 'x', status: 'email_verified', createdAt: new Date(), updatedAt: new Date() });
    return createSession(redis, { userId, status: 'email_verified' });
  };
  const authed = (token: string) => ({ cookies: { openscience_session: token } });
  return { app, db, mailer, loginAs, authed };
}

async function createTeam(app: any, token: string, name = 'Lab'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/workspaces', ...({ cookies: { openscience_session: token } }), payload: { name } });
  return res.json().id;
}

describe('/workspaces 认证与创建', () => {
  it('无 cookie → 401 SESSION_INVALID', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/workspaces' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('SESSION_INVALID');
  });

  it('创建 team → 201 且出现在我的空间列表', async () => {
    const { app, authed, loginAs } = await setup();
    const token = await loginAs(U1, 'a@example.com');
    const created = await app.inject({ method: 'POST', url: '/workspaces', ...authed(token), payload: { name: 'NLP Lab' } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ type: 'team', name: 'NLP Lab', role: 'owner' });
    const list = await app.inject({ method: 'GET', url: '/workspaces', ...authed(token) });
    expect(list.json().workspaces.map((w: any) => w.id)).toContain(created.json().id);
  });
});

describe('越权与角色检查', () => {
  it('非成员访问详情 → 404 WORKSPACE_NOT_FOUND（不泄露存在性）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'GET', url: `/workspaces/${id}`, ...authed(t2) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('viewer 改资料 → 403 FORBIDDEN', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-v', workspaceId: id, userId: U2, role: 'viewer', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}`, ...authed(t2), payload: { name: 'X' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('非法请求体（邮箱格式错误）→ 400 VALIDATION_ERROR', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'not-an-email', role: 'author' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('邀请闭环', () => {
  it('author 邀请 → 403；owner 邀请 → 202 且发出通知邮件', async () => {
    const { app, db, mailer, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-a', workspaceId: id, userId: U2, role: 'author', createdAt: new Date(), updatedAt: new Date() });
    const forbidden = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t2), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(forbidden.statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(ok.statusCode).toBe(202);
    expect(mailer.sent.some((m) => m.to === 'c@example.com')).toBe(true);
  });

  it('邀请预指派 owner → 400 VALIDATION_ERROR（所有权只能经 transfer 产生，2026-07-29 评审裁决）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'owner' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('受邀者可见待邀 → accept 201 → 出现在成员列表', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t3 = await loginAs(U3, 'c@example.com');
    const id = await createTeam(app, t1);
    await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'author' } });

    const inbox = await app.inject({ method: 'GET', url: '/workspaces/invitations', ...authed(t3) });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().invitations).toHaveLength(1);
    expect(inbox.json().invitations[0]).toMatchObject({ workspaceId: id, workspaceName: 'Lab', role: 'author' });

    const accepted = await app.inject({ method: 'POST', url: `/workspaces/invitations/${inbox.json().invitations[0].id}/accept`, ...authed(t3) });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ workspaceId: id, userId: U3, role: 'author' });

    const members = await app.inject({ method: 'GET', url: `/workspaces/${id}/members`, ...authed(t1) });
    expect(members.json().members.map((m: any) => m.userId)).toContain(U3);
  });

  it('accept 他人邀请 → 404（枚举面控制）', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    const invited = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'author' } });
    const res = await app.inject({ method: 'POST', url: `/workspaces/invitations/${invited.json().invitationId}/accept`, ...authed(t2) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('personal 空间拒绝邀请 → 409 PERSONAL_WORKSPACE', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    db.workspaces.push({ id: '44444444-4444-4444-8444-444444444444', type: 'personal', name: '我的空间', ownerId: U1, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'm-p', workspaceId: '44444444-4444-4444-8444-444444444444', userId: U1, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'POST', url: '/workspaces/44444444-4444-4444-8444-444444444444/invitations', ...authed(t1), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PERSONAL_WORKSPACE');
  });
});

describe('成员管理与不变量', () => {
  it('降级唯一 owner → 409 LAST_OWNER', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const res = await app.inject({ method: 'PATCH', url: `/workspaces/${id}/members/${U1}`, ...authed(t1), payload: { role: 'maintainer' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LAST_OWNER');
  });

  it('唯一 owner 退出 → 409 LAST_OWNER；普通成员退出 → 204', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const t2 = await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-a', workspaceId: id, userId: U2, role: 'author', createdAt: new Date(), updatedAt: new Date() });
    const ownerLeave = await app.inject({ method: 'POST', url: `/workspaces/${id}/leave`, ...authed(t1) });
    expect(ownerLeave.statusCode).toBe(409);
    const memberLeave = await app.inject({ method: 'POST', url: `/workspaces/${id}/leave`, ...authed(t2) });
    expect(memberLeave.statusCode).toBe(204);
  });

  it('归档后拒绝邀请 → 409 WORKSPACE_ARCHIVED', async () => {
    const { app, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    const id = await createTeam(app, t1);
    const archived = await app.inject({ method: 'POST', url: `/workspaces/${id}/archive`, ...authed(t1) });
    expect(archived.statusCode).toBe(204);
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/invitations`, ...authed(t1), payload: { email: 'c@example.com', role: 'viewer' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('WORKSPACE_ARCHIVED');
  });

  it('转让所有权 → 204，原 owner 变 maintainer', async () => {
    const { app, db, authed, loginAs } = await setup();
    const t1 = await loginAs(U1, 'a@example.com');
    await loginAs(U2, 'b@example.com');
    const id = await createTeam(app, t1);
    db.memberships.push({ id: 'm-m', workspaceId: id, userId: U2, role: 'maintainer', createdAt: new Date(), updatedAt: new Date() });
    const res = await app.inject({ method: 'POST', url: `/workspaces/${id}/transfer`, ...authed(t1), payload: { newOwnerId: U2 } });
    expect(res.statusCode).toBe(204);
    expect(db.memberships.find((m: any) => m.userId === U1).role).toBe('maintainer');
    expect(db.workspaces.find((w: any) => w.id === id).ownerId).toBe(U2);
  });
});
```

- [ ] **Step 11: 跑测试确认通过（先失败确认生效也可，路由已就绪则直接全绿）**

Run: `npx pnpm@9.15.0 --filter @openscience/api test`
Expected: PASS（既有基线 + 新增 14；执行时先记录 api 基线数再核对 +14）。

- [ ] **Step 12: 全仓回归**

Run: `npx pnpm@9.15.0 build && npx pnpm@9.15.0 test`
Expected: exit 0；auth 32 + domain 32 + api（基线+14）+ database 4 + storage 10，其余包无回归。

---

### Task 7: 云上集成测试文件 + 全量门禁 + docs-sync + 提交检查点

**Files:**
- Create: `apps/api/test/workspaces.integration.test.ts`（本机只验证收集与类型，云上运行）
- Modify: `project_index.md`、`docs/progress.md`、`AGENTS.md`（docs-sync）

**Interfaces:**
- Consumes: Task 1-6 全部产物；`apps/api/test/auth.integration.test.ts` 的既有结构（module 级 prisma/redis/mailer、invite.mjs 造码、afterAll 逆序清理）。
- Produces: 云上 `test:integration` 的第三份集成测试；task-master 2.4 置 done 的前置证据（云上全绿后）。

- [ ] **Step 1: 写 `apps/api/test/workspaces.integration.test.ts`**

结构对齐 `auth.integration.test.ts`：真实 PG/Redis（`createPrismaClient()` 默认值），**迁移 3 需已在云上 deploy**。注意 `buildApp` 必须带 `onEmailVerified` 接线（与生产 `index.ts` 一致），否则 Personal Workspace 自动创建断言无从谈起。

```ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DevOutboxMailer } from '@openscience/auth';
import { createPrismaClient, createRedisClient } from '@openscience/database';
import { createPersonalWorkspace } from '@openscience/domain';
import { buildApp } from '../src/app';

/**
 * P1A-4 集成测试（云上执行）：真实 PG/Redis。
 * 前置：dev 栈已起（stack:up）且迁移 1-3 已 deploy（node packages/database/dist/migrate-cli.js deploy）。
 */

const prisma = createPrismaClient();
const redis = createRedisClient();
const mailer = new DevOutboxMailer(prisma);
const repoRoot = path.resolve(__dirname, '../../..');

async function makeApp() {
  return buildApp({
    prisma,
    redis,
    mailer,
    onEmailVerified: (tx, user) => createPersonalWorkspace(tx, user),
    cookieSecret: 'integration-secret',
    secureCookies: false,
  });
}

function createInviteCode(email: string): string {
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts/invite.mjs'), 'create', '--email', email], {
    encoding: 'utf8',
  });
  const match = out.match(/[A-Z2-9]{20}/);
  if (!match) throw new Error(`invite.mjs 输出未含邀请码: ${out}`);
  return match[0];
}

async function latestOutboxCode(email: string): Promise<string> {
  const mail = await prisma.mailOutbox.findFirst({ where: { toEmail: email }, orderBy: { createdAt: 'desc' } });
  const match = mail?.bodyText.match(/\d{6}/);
  if (!match) throw new Error(`outbox 中未找到 ${email} 的验证码`);
  return match[0];
}

/** 注册 + 邮箱验证，返回 session cookie 值。 */
async function registerAndVerify(app: Awaited<ReturnType<typeof makeApp>>, email: string): Promise<string> {
  const code = createInviteCode(email);
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { invitationCode: code, email, password: 'Passw0rd123', displayName: email.split('@')[0] },
  });
  const verifyCode = await latestOutboxCode(email);
  const verified = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { email, code: verifyCode } });
  expect(verified.statusCode).toBe(200);
  const cookie = verified.cookies.find((c) => c.name === 'openscience_session');
  expect(cookie).toBeDefined();
  return cookie!.value;
}

afterAll(async () => {
  await prisma.workspaceInvitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.mailOutbox.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('P1A-4 Workspace 集成（云上）', () => {
  it('全流程：验证邮箱自动建 personal → 建 team → 邀请 → accept → 转让 → 退出', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'owner@example.com');
    const authedOwner = { cookies: { openscience_session: ownerCookie } };

    // 邮箱验证通过 → 自动拥有 personal workspace
    const list = await app.inject({ method: 'GET', url: '/workspaces', ...authedOwner });
    expect(list.statusCode).toBe(200);
    const personal = list.json().workspaces.find((w: { type: string }) => w.type === 'personal');
    expect(personal).toBeDefined();
    expect(personal.role).toBe('owner');

    // 建 team 并邀请第二用户
    const team = await app.inject({ method: 'POST', url: '/workspaces', ...authedOwner, payload: { name: 'Cloud Lab' } });
    expect(team.statusCode).toBe(201);
    const teamId = team.json().id;
    const invited = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/invitations`,
      ...authedOwner,
      payload: { email: 'member@example.com', role: 'author' },
    });
    expect(invited.statusCode).toBe(202);

    const memberCookie = await registerAndVerify(app, 'member@example.com');
    const authedMember = { cookies: { openscience_session: memberCookie } };
    const accepted = await app.inject({
      method: 'POST',
      url: `/workspaces/invitations/${invited.json().invitationId}/accept`,
      ...authedMember,
    });
    expect(accepted.statusCode).toBe(201);

    // 转让所有权 → 原 owner 退出
    const memberId = accepted.json().userId;
    const transferred = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/transfer`,
      ...authedOwner,
      payload: { newOwnerId: memberId },
    });
    expect(transferred.statusCode).toBe(204);
    const left = await app.inject({ method: 'POST', url: `/workspaces/${teamId}/leave`, ...authedOwner });
    expect(left.statusCode).toBe(204);
    const members = await app.inject({ method: 'GET', url: `/workspaces/${teamId}/members`, ...authedMember });
    expect(members.json().members).toHaveLength(1);
    expect(members.json().members[0]).toMatchObject({ userId: memberId, role: 'owner' });
    await app.close();
  });

  it('越权负向：非成员访问他人空间 → 404；无 session → 401', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'owner2@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'Private Lab' },
    });
    const outsiderCookie = await registerAndVerify(app, 'outsider@example.com');
    const detail = await app.inject({
      method: 'GET',
      url: `/workspaces/${team.json().id}`,
      cookies: { openscience_session: outsiderCookie },
    });
    expect(detail.statusCode).toBe(404);
    expect(detail.json().error.code).toBe('WORKSPACE_NOT_FOUND');
    const anon = await app.inject({ method: 'GET', url: `/workspaces/${team.json().id}` });
    expect(anon.statusCode).toBe(401);
    await app.close();
  });

  it('并发双 accept：恰好产生一条 membership（真实 PG 竞态路径）', async () => {
    const app = await makeApp();
    const ownerCookie = await registerAndVerify(app, 'owner3@example.com');
    const team = await app.inject({
      method: 'POST',
      url: '/workspaces',
      cookies: { openscience_session: ownerCookie },
      payload: { name: 'Race Lab' },
    });
    const teamId = team.json().id;
    const invited = await app.inject({
      method: 'POST',
      url: `/workspaces/${teamId}/invitations`,
      cookies: { openscience_session: ownerCookie },
      payload: { email: 'race@example.com', role: 'viewer' },
    });
    const raceCookie = await registerAndVerify(app, 'race@example.com');
    const invitationId = invited.json().invitationId;
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/workspaces/invitations/${invitationId}/accept`, cookies: { openscience_session: raceCookie } }),
      app.inject({ method: 'POST', url: `/workspaces/invitations/${invitationId}/accept`, cookies: { openscience_session: raceCookie } }),
    ]);
    for (const r of [r1, r2]) expect([201, 404]).toContain(r.statusCode);
    const raceUser = await prisma.user.findUnique({ where: { email: 'race@example.com' } });
    const rows = await prisma.membership.findMany({ where: { workspaceId: teamId, userId: raceUser!.id } });
    expect(rows).toHaveLength(1);
    await app.close();
  });
});
```

- [ ] **Step 2: 本机仅验证收集与类型（不运行，需 Docker/真实栈）**

Run: `npx pnpm@9.15.0 --filter @openscience/api exec vitest list --config vitest.integration.config.ts`
Expected: 列出 `workspaces.integration.test.ts` 的 3 个用例 + 既有 `auth.integration.test.ts` 用例，exit 0。

Run: `npx pnpm@9.15.0 typecheck`
Expected: exit 0。

- [ ] **Step 3: 全量门禁**

Run: `npx pnpm@9.15.0 build`
Expected: exit 0。

Run: `npx pnpm@9.15.0 lint`
Expected: exit 0（ESLint + `WORKSPACE_STRUCTURE_OK`）。

Run: `npx pnpm@9.15.0 test`
Expected: exit 0；总数 = P1A-3 基线（59）+ 本计划新增（domain 32 + auth 2 + api 14 = 48）= 107；若基线数有出入，以"实际基线 + 48"核对。

Run: `npx pnpm@9.15.0 audit:knip`
Expected: exit 0。若新增 unused-export hint（如 `INVITATION_TTL_MS`、type-only 导出未被跨包消费）：从 `packages/domain/src/index.ts` barrel 中移除未跨包使用的导出项后重跑，保持零新增 hint。

Run: `npx pnpm@9.15.0 audit:dep`
Expected: exit 0，0 errors；orphan warnings 不新增非预期项（domain 包已接线不再是 orphan）。

Run: `npx pnpm@9.15.0 audit:deps`
Expected: exit 0（domain 新依赖版本与其他包一致：`@prisma/client` 5.22.0、`vitest` 2、`@types/node` 20.14.10）。

Run: `npx pnpm@9.15.0 audit:dup`
Expected: exit 0。两份 fake（domain/api 测试目录）系刻意复制（跨包不能引测试目录），若 jscpd 报告 clone：确认仅落在两处 `test/helpers/fakes.ts`，属既有 P1A-3 同款模式，记录接受，不抽共享测试包（YAGNI）。

Run: `npx pnpm@9.15.0 docs:lint`
Expected: 0 issues。

- [ ] **Step 4: docs-sync（索引/进度/AGENTS）**

1. `project_index.md`：
   - `packages/` 行改为「database/storage（P1A-2）+ auth（P1A-3）+ domain（P1A-4 workspace 领域模块）已实现，其余占位」。
   - `apps/` 行改为「`api` 已含 Fastify `/auth`（P1A-3）+ `/workspaces`（P1A-4）实现」。
   - `infra/migrations/` 行追加 `20260729010000_workspace_baseline`（P1A-4 三表）。
   - `docs/plans/` 表追加本计划行：`docs/plans/2026-07-29-p1a-4-workspace-plan.md` | P1A-4 Workspace 实施计划（本地执行，集成测试待阿里云） | 活文档。
2. `AGENTS.md` 概览段：`apps/` 与 `packages/` 两行同步上述内容。
3. `docs/progress.md` 置顶新条目：完成项（迁移 3 / domain 32 单测 / auth 回调 2 用例 / api 14 用例 / 全门禁证据命令）、Key Decisions（回调注入、平行 WorkspaceError + SCREAMING 码、fake 复制接受、邀请角色收窄为非 owner）、Next Steps（阿里云 migrate deploy + 三包 test:integration 全绿后置 2.2/2.3/2.4 done；P1A-5 RBAC 先 design gate）。

- [ ] **Step 5: 提交检查点（需用户批准）**

向用户汇报本地证据（门禁输出、单测计数、未执行项：迁移未 deploy / 集成测试未跑），经批准后：

```bash
git add -A && git commit -m "feat: P1A-4 Workspace 模型与成员管理"
```

- [ ] **Step 6: task-master 状态纪律**

task-master 2.4 保持 `pending`（test-gate：云上集成测试全绿后才置 done）。仅当用户明确指示且云上证据齐备时更新。

---

## Self-Review 记录

**Spec 章节 → Task 覆盖映射**（`docs/specs/2026-07-29-p1a-4-workspace-design.md`）：

| Spec 章节 | 覆盖 Task |
|---|---|
| §1 范围（domain 模块/api 路由/迁移 3/内联权限/审计挂接点） | Task 1/2/3/4/6（挂接点注释在各写路径） |
| §2 决策表（验证通过时建 personal/回调注入/邮箱邀请/独立邀请表/6 角色/personal 单人/内联检查/无乐观锁/domain 落点） | Task 2/4/5/6；无乐观锁体现在无 etag 代码 |
| §3 组件与职责 | Task 2-6 |
| §4 数据模型（三表/枚举/部分唯一索引/无 owner→membership FK） | Task 1 |
| §5.1 personal 创建（同事务/幂等/命名回退） | Task 2 + Task 5 |
| §5.2 三条不变量 | Task 3（personal 拒绝/last_owner/归档只读，均有单测） |
| §5.3 邀请状态机（含枚举面 404/7 天/惰性过期/幂等 accept） | Task 4 |
| §5.4 转让（事务三步/拒绝非成员/personal） | Task 3 |
| §6 API 15 端点与合同要点 | Task 6 |
| §7 错误码（8 + 401） | Task 2 errors.ts + Task 6 error-map |
| §8 测试策略（单测双层/云上集成/迁移 rollback/task 状态纪律） | Task 2-6 单测、Task 7 集成 + 门禁 + Step 6 |
| §9 风险（审计缺口/auth 回归/迁移顺序） | Task 5 Step 5（auth 回归）、Task 7 Step 3（全门禁）、spec 已声明审计缺口 |

**占位符扫描**：无 TBD/TODO/"适当处理"类表述；所有代码步骤给出完整文件内容。唯一执行时适配点：Task 5 测试的 `seedVerifiedFlowUser`（计划已声明照抄既有用例种子写法，因 auth 测试文件既有 seed 风格需在执行时对齐，非逻辑占位）。

**类型一致性核对**：

- `createPersonalWorkspace(tx: Prisma.TransactionClient, user: { id, email, displayName })`（Task 2）↔ `AuthDeps.onEmailVerified`（Task 5）↔ `index.ts` 接线（Task 6 Step 6）↔ 集成测试 makeApp（Task 7）——签名逐字一致。
- `requireCurrentUser(deps, req, reply): Promise<CurrentUser | null>`（Task 6 Step 1）↔ 15 个端点用法一致（null 即 return）。
- `WorkspaceErrorCode` 8 个码（Task 2）↔ `WORKSPACE_ERROR_HTTP: Record<WorkspaceErrorCode, number>`（Task 6 Step 3）全覆盖（TS 编译期强制）。
- `membership` 复合唯一查询键 `workspaceId_userId`（Task 1 schema `@@unique([workspaceId, userId])`）↔ Task 3/4 全部 findUnique/upsert 用法一致。
- `AcceptResult`（Task 4）↔ accept 路由 201 响应（Task 6）↔ 集成测试 `accepted.json().userId`（Task 7）一致。

**已知取舍（执行时不得擅自变更）**：

- 错误码用 SCREAMING_SNAKE（对齐 AuthError 既有约定）；design spec §7 及各节引用已同步为 SCREAMING_SNAKE（文档对齐代码，2026-07-29 计划自审时修正）。
- `listMyWorkspaces`/`listMembers`/`listMyInvitations` 逐行查关联（N+1），避免 fake 实现 `include`；1B 规模上来后再改 include，届时同步更新 fake。
- maintainer 不能移除同级 maintainer（最小内联检查的明确规则，2.5 RBAC 矩阵可能细化）。
- `packages/domain` 对 `@openscience/auth` 仅 type-only 依赖（Mailer），无运行时耦合。
- fake prisma 在 domain/api 两处复制（跨包不能引测试目录），`audit:dup` 若报告按既有模式接受。
- 邀请预指派角色收窄为非 owner（2026-07-29 Task 6 评审 ⚠️ 用户裁决）：邀请 zod 用 `nonOwnerRoleSchema`，所有权只能经 transfer 产生；spec §5.3/§6 已同步。
