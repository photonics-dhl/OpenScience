# P1A-2 数据基础实施计划：PostgreSQL + Redis + Storage Adapter

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起开发态 PostgreSQL + Redis + MinIO 栈，落地 `packages/database`（Prisma 连接 + 迁移 runner + Redis 工厂）与 `packages/storage`（Storage Adapter + MinIO 实现），并用 Vitest 单测/集成测试验证。

**Architecture:** docker-compose 一键起本机开发栈（端口仅 127.0.0.1）；Prisma 管理 schema 与前向迁移，迁移文件归 `infra/migrations/`，每个迁移附手写 `rollback.sql` 补偿；Storage 以接口隔离 MinIO 实现，OSS 仅留配置位。

**Tech Stack:** pnpm workspace（`npx pnpm@9.15.0`）、TypeScript 5.5（NodeNext/CJS）、Prisma 5.22、ioredis 5、minio SDK 8、Vitest 2、Docker（`docker compose` 或 `docker-compose` 兜底）。

**设计依据：** `docs/specs/2026-07-28-p1a-2-data-foundation-design.md`（已批准）。

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`，不全局安装（ADR-002）。
- 全程不 `git add/commit/push`，除非用户逐次明确批准。
- 不读取/打印 `.env`；开发凭据只写 compose 内联默认值与 `.env.example`（用户已批准的开发态豁免）。
- 迁移脚本归 `infra/migrations/`；每个迁移目录必须附 `rollback.sql`（database-migration skill 第 2、6 条）。
- 生产禁止自动破坏性迁移：`NODE_ENV=production` 时 runner 拒绝 `reset`（Spec §15）。
- 端口一律绑 `127.0.0.1`（Spec §14.2 数据库不公网）。
- TS 为 NodeNext + CJS 输出（包内无 `"type": "module"`）：相对导入不写扩展名。
- MinIO 镜像固定 `minio/minio:RELEASE.2025-09-07T16-13-09Z`，mc 固定 `minio/mc:RELEASE.2025-08-13T08-35-41Z`（已核实存在于 Docker Hub）；不用 latest。
- 本机 docker daemon 当前未运行；集成测试前需启动 Docker Desktop。`docker compose` 插件不可用，脚本一律 `docker compose ... || docker-compose ...` 双写兜底。
- 范围红线：不实现 OSS 客户端、User/Workspace 实体、限流、文件元数据表、presigned URL、生产 compose。

## 开发态默认值（全计划统一引用）

| 项 | 值 |
|---|---|
| DATABASE_URL | `postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience` |
| REDIS_URL | `redis://127.0.0.1:6379` |
| S3 endpoint | `127.0.0.1:9000`（useSSL=false） |
| S3 access/secret | `minioadmin` / `openscience_minio_dev` |
| S3 bucket | `openscience-dev` |
| 基线迁移目录名 | `20260728000000_baseline_app_meta` |

---

### Task 1: Dev compose 栈 + 根脚本

**Files:**
- Create: `infra/compose/docker-compose.dev.yml`
- Modify: `.env.example`（追加开发栈键名段）
- Modify: `package.json`（根 scripts 增加 stack:*/test/test:integration）
- Modify: `infra/README.md`（追加 dev 栈使用与凭据策略小节）

**Interfaces:**
- Consumes: 无（首个任务）。
- Produces: 根脚本 `stack:up`/`stack:down`/`stack:ps`/`stack:logs`/`test`/`test:integration`；运行中的 postgres(5432)/redis(6379)/minio(9000/9001) 与 bucket `openscience-dev`，供 Task 4/5 集成测试使用。

- [ ] **Step 1: 创建 `infra/compose/docker-compose.dev.yml`**

```yaml
name: openscience-dev

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-openscience}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-openscience_dev}
      POSTGRES_DB: ${POSTGRES_DB:-openscience}
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 12

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:${REDIS_PORT:-6379}:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12

  minio:
    image: minio/minio:RELEASE.2025-09-07T16-13-09Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-openscience_minio_dev}
    ports:
      - "127.0.0.1:${S3_PORT:-9000}:9000"
      - "127.0.0.1:${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc:RELEASE.2025-08-13T08-35-41Z
    depends_on:
      - minio
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-openscience_minio_dev}
      S3_BUCKET: ${S3_BUCKET:-openscience-dev}
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 \"$${MINIO_ROOT_USER}\" \"$${MINIO_ROOT_PASSWORD}\"; do sleep 2; done;
      mc mb --ignore-existing \"local/$${S3_BUCKET}\";
      echo BUCKET_READY;
      "

volumes:
  postgres-data:
  redis-data:
  minio-data:
```

说明：minio 服务不设 healthcheck（官方镜像内不保证有 curl/mc），改由 `minio-init` 的 `until` 重试环等待 server 就绪后建 bucket。

- [ ] **Step 2: 修改根 `package.json` scripts（其余字段不动）**

```json
"scripts": {
  "build": "pnpm -r --if-present build",
  "typecheck": "pnpm -r --if-present typecheck",
  "lint": "node scripts/verify-workspace.mjs",
  "verify:workspace": "node scripts/verify-workspace.mjs",
  "stack:up": "docker compose -f infra/compose/docker-compose.dev.yml up -d || docker-compose -f infra/compose/docker-compose.dev.yml up -d",
  "stack:down": "docker compose -f infra/compose/docker-compose.dev.yml down || docker-compose -f infra/compose/docker-compose.dev.yml down",
  "stack:ps": "docker compose -f infra/compose/docker-compose.dev.yml ps || docker-compose -f infra/compose/docker-compose.dev.yml ps",
  "stack:logs": "docker compose -f infra/compose/docker-compose.dev.yml logs -f || docker-compose -f infra/compose/docker-compose.dev.yml logs -f",
  "test": "pnpm -r --if-present test",
  "test:integration": "pnpm stack:up && pnpm -r --if-present test:integration"
}
```

- [ ] **Step 3: `.env.example` 追加**

```dotenv
# --- P1A-2 dev stack (local development defaults only, NOT real secrets) ---
POSTGRES_USER=openscience
POSTGRES_PASSWORD=openscience_dev
POSTGRES_DB=openscience
POSTGRES_PORT=5432
DATABASE_URL=postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience
REDIS_URL=redis://127.0.0.1:6379
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=openscience_minio_dev
S3_ENDPOINT=127.0.0.1
S3_PORT=9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=openscience_minio_dev
S3_BUCKET=openscience-dev
```

- [ ] **Step 4: `infra/README.md` 追加小节**

在文件末尾追加：

```markdown
## Dev 栈（P1A-2）

- 一键起栈：`npx pnpm@9.15.0 stack:up`（postgres:5432 / redis:6379 / minio:9000+9001，均仅绑 127.0.0.1）。
- compose 文件：`infra/compose/docker-compose.dev.yml`；脚本自动在 `docker compose` 与 `docker-compose` 之间兜底。
- 凭据策略：compose 内联的 `*_dev` 默认值仅用于本机一次性开发数据，属用户批准的开发态豁免；生产部署（2.9）一律强制 env、无默认值。真实密钥仍只来自 `.env`/服务器 Secret。
- MinIO Console：http://127.0.0.1:9001（minioadmin / openscience_minio_dev），dev bucket `openscience-dev` 由 minio-init 自动创建。
```

- [ ] **Step 5: 验证 compose 配置合法（不需 daemon）**

Run: `docker compose -f infra/compose/docker-compose.dev.yml config -q || docker-compose -f infra/compose/docker-compose.dev.yml config -q`
Expected: exit 0，无输出。

- [ ] **Step 6: 验证 verify:workspace 仍绿**

Run: `npx pnpm@9.15.0 verify:workspace`
Expected: 输出 `WORKSPACE_STRUCTURE_OK`。

---

### Task 2: packages/database — Prisma 基线 + 连接工厂 + 迁移 runner

**Files:**
- Modify: `packages/database/package.json`
- Create: `infra/schema.prisma`
- Create: `infra/migrations/20260728000000_baseline_app_meta/migration.sql`
- Create: `infra/migrations/20260728000000_baseline_app_meta/rollback.sql`
- Create: `packages/database/src/dev-defaults.ts`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/redis.ts`
- Create: `packages/database/src/migrate-guard.ts`
- Create: `packages/database/src/migrate-cli.ts`
- Modify: `packages/database/src/index.ts`（替换 placeholder）
- Create: `packages/database/vitest.config.ts`
- Create: `packages/database/test/migrate-guard.test.ts`

**Interfaces:**
- Consumes: Task 1 的开发态默认值表。
- Produces（Task 4 依赖以下签名）:
  - `DEFAULT_DEV_DATABASE_URL: string`、`DEFAULT_DEV_REDIS_URL: string`（`src/dev-defaults.ts`）
  - `createPrismaClient(options?: { datasourceUrl?: string }): PrismaClient`（`src/client.ts`）
  - `createRedisClient(url?: string): Redis`、`pingRedis(client: Redis): Promise<boolean>`（`src/redis.ts`）
  - `type MigrateCommand = 'deploy' | 'status' | 'reset-dev'`；`assertMigrateCommandAllowed(command: MigrateCommand, nodeEnv: string | undefined): void`（`src/migrate-guard.ts`）
  - CLI：`node packages/database/dist/migrate-cli.js <deploy|status|reset-dev>`（`src/migrate-cli.ts`，Task 4 用 `deploy`）

- [ ] **Step 1: 安装依赖**

Run: `npx pnpm@9.15.0 add @prisma/client@5.22.0 ioredis@5 --filter @openscience/database && npx pnpm@9.15.0 add -D prisma@5.22.0 vitest@2 @types/node@20.14.10 --filter @openscience/database`
Expected: 成功写入 `packages/database/package.json` 与 lockfile。

- [ ] **Step 2: 更新 `packages/database/package.json` scripts**

```json
"scripts": {
  "generate": "prisma generate --schema ../../infra/schema.prisma",
  "build": "pnpm run generate && tsc -p tsconfig.json",
  "typecheck": "pnpm run generate && tsc -p tsconfig.json --noEmit",
  "migrate": "node dist/migrate-cli.js",
  "test": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

- [ ] **Step 3: 创建 `infra/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model AppMeta {
  key       String   @id
  value     Json
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  @@map("app_meta")
}
```

- [ ] **Step 4: 创建基线迁移 `infra/migrations/20260728000000_baseline_app_meta/migration.sql`**

```sql
CREATE TABLE "app_meta" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_meta_pkey" PRIMARY KEY ("key")
);
```

- [ ] **Step 5: 创建补偿回滚 `infra/migrations/20260728000000_baseline_app_meta/rollback.sql`**

```sql
-- Compensation rollback for 20260728000000_baseline_app_meta.
-- Prisma 仅前向迁移；本文件为人工/测试执行的回滚补偿（database-migration skill 第 2 条）。
DROP TABLE IF EXISTS "app_meta";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260728000000_baseline_app_meta';
```

- [ ] **Step 6: 创建 `packages/database/src/dev-defaults.ts`**

```ts
// 开发态默认值（本机 docker-compose.dev.yml 专用，非真实密钥）。
export const DEFAULT_DEV_DATABASE_URL =
  'postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience';
export const DEFAULT_DEV_REDIS_URL = 'redis://127.0.0.1:6379';
```

- [ ] **Step 7: 创建 `packages/database/src/client.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { DEFAULT_DEV_DATABASE_URL } from './dev-defaults';

export interface CreatePrismaClientOptions {
  datasourceUrl?: string;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const url = options.datasourceUrl ?? process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  return new PrismaClient({ datasources: { db: { url } } });
}
```

- [ ] **Step 8: 创建 `packages/database/src/redis.ts`**

```ts
import Redis from 'ioredis';
import { DEFAULT_DEV_REDIS_URL } from './dev-defaults';

/**
 * 创建 ioredis 连接。默认挂空 error listener，避免 redis 不可用/重连时
 * 未处理的 'error' 事件直接打挂宿主进程；消费方可自行 client.on('error', ...)
 * 添加自己的处理（多个 listener 共存，互不影响）。
 */
export function createRedisClient(url?: string): Redis {
  const client = new Redis(url ?? process.env.REDIS_URL ?? DEFAULT_DEV_REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
  });
  client.on('error', () => {});
  return client;
}

export async function pingRedis(client: Redis): Promise<boolean> {
  const reply = await client.ping();
  return reply === 'PONG';
}
```

- [ ] **Step 9: 创建 `packages/database/src/migrate-guard.ts`**

```ts
export type MigrateCommand = 'deploy' | 'status' | 'reset-dev';

const PRODUCTION_FORBIDDEN: ReadonlySet<MigrateCommand> = new Set(['reset-dev']);

/**
 * Spec §15：生产环境禁止自动执行破坏性迁移。
 * reset-dev 会清空并重放全部迁移，仅允许非生产环境。
 */
export function assertMigrateCommandAllowed(
  command: MigrateCommand,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv === 'production' && PRODUCTION_FORBIDDEN.has(command)) {
    throw new Error(
      `Refused: migrate command "${command}" is destructive and forbidden when NODE_ENV=production (Spec §15).`,
    );
  }
}
```

- [ ] **Step 10: 创建 `packages/database/src/migrate-cli.ts`**

```ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { DEFAULT_DEV_DATABASE_URL } from './dev-defaults';
import { assertMigrateCommandAllowed, type MigrateCommand } from './migrate-guard';

const COMMANDS: readonly MigrateCommand[] = ['deploy', 'status', 'reset-dev'];

function prismaBinPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkgPath = require.resolve('prisma/package.json');
  return path.join(path.dirname(pkgPath), 'build', 'index.js');
}

function main(): void {
  const command = process.argv[2] as MigrateCommand | undefined;
  if (!command || !COMMANDS.includes(command)) {
    console.error(`Usage: node dist/migrate-cli.js <${COMMANDS.join('|')}>`);
    process.exit(64);
  }
  assertMigrateCommandAllowed(command, process.env.NODE_ENV);

  const repoRoot = path.join(__dirname, '..', '..', '..');
  const schema = path.join(repoRoot, 'infra', 'schema.prisma');
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL };

  const args =
    command === 'deploy'
      ? ['migrate', 'deploy', '--schema', schema]
      : command === 'status'
        ? ['migrate', 'status', '--schema', schema]
        : ['migrate', 'reset', '--force', '--skip-generate', '--schema', schema];

  const result = spawnSync(process.execPath, [prismaBinPath(), ...args], {
    stdio: 'inherit',
    env,
  });
  process.exit(result.status ?? 1);
}

main();
```

- [ ] **Step 11: 替换 `packages/database/src/index.ts`**

```ts
export { DEFAULT_DEV_DATABASE_URL, DEFAULT_DEV_REDIS_URL } from './dev-defaults';
export { createPrismaClient, type CreatePrismaClientOptions } from './client';
export { createRedisClient, pingRedis } from './redis';
export { assertMigrateCommandAllowed, type MigrateCommand } from './migrate-guard';
```

- [ ] **Step 12: 创建 `packages/database/vitest.config.ts`**

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

- [ ] **Step 13: 创建 `packages/database/test/migrate-guard.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { assertMigrateCommandAllowed } from '../src/migrate-guard';

describe('assertMigrateCommandAllowed', () => {
  it('allows deploy in production', () => {
    expect(() => assertMigrateCommandAllowed('deploy', 'production')).not.toThrow();
  });

  it('allows status in production', () => {
    expect(() => assertMigrateCommandAllowed('status', 'production')).not.toThrow();
  });

  it('rejects reset-dev in production', () => {
    expect(() => assertMigrateCommandAllowed('reset-dev', 'production')).toThrow(/forbidden/);
  });

  it('allows reset-dev outside production', () => {
    expect(() => assertMigrateCommandAllowed('reset-dev', 'development')).not.toThrow();
    expect(() => assertMigrateCommandAllowed('reset-dev', undefined)).not.toThrow();
  });
});
```

- [ ] **Step 14: 跑 build + typecheck + 单测**

Run: `npx pnpm@9.15.0 --filter @openscience/database build && npx pnpm@9.15.0 --filter @openscience/database typecheck && npx pnpm@9.15.0 --filter @openscience/database test`
Expected: prisma generate 成功；tsc 无错误；4 个单测全过。

- [ ] **Step 15: 验证 CLI 无参用法与生产守卫**

Run: `node packages/database/dist/migrate-cli.js`（应 exit 64 打印 Usage）；`NODE_ENV=production node packages/database/dist/migrate-cli.js reset-dev`（应非零退出并打印 Refused）
Expected: 两命令行为如上。

---

### Task 3: packages/storage — Adapter 接口 + MinIO 实现

**Files:**
- Modify: `packages/storage/package.json`
- Create: `packages/storage/src/errors.ts`
- Create: `packages/storage/src/types.ts`
- Create: `packages/storage/src/checksum.ts`
- Create: `packages/storage/src/streams.ts`
- Create: `packages/storage/src/minio-adapter.ts`
- Create: `packages/storage/src/factory.ts`
- Modify: `packages/storage/src/index.ts`（替换 placeholder）
- Create: `packages/storage/vitest.config.ts`
- Create: `packages/storage/test/checksum.test.ts`
- Create: `packages/storage/test/factory.test.ts`
- Create: `packages/storage/test/map-minio-error.test.ts`

**Interfaces:**
- Consumes: Task 1 的 S3 默认值表。
- Produces（Task 5 依赖以下签名）:
  - `StorageError` / `ObjectNotFoundError` / `ChecksumMismatchError` / `StorageUnavailableError` / `StorageDriverNotImplementedError`（`src/errors.ts`）
  - `StorageAdapter` 接口及 `PutObjectOptions`/`PutObjectResult`/`GetObjectResult`/`HeadObjectResult`（`src/types.ts`）
  - `sha256HexBuffer(buf: Buffer): string`（`src/checksum.ts`）
  - `streamToBuffer(stream: Readable): Promise<Buffer>`（`src/streams.ts`）
  - `MinioStorageAdapter implements StorageAdapter`、`mapMinioError(err: unknown): StorageError`（`src/minio-adapter.ts`）
  - `createStorageAdapter(config: StorageConfig): StorageAdapter`、`storageConfigFromEnv(env?: NodeJS.ProcessEnv): StorageConfig`、`StorageConfig`、`StorageDriver`（`src/factory.ts`）

- [ ] **Step 1: 安装依赖**

Run: `npx pnpm@9.15.0 add minio@8 --filter @openscience/storage && npx pnpm@9.15.0 add -D vitest@2 @types/node@20.14.10 --filter @openscience/storage`
Expected: 成功。

- [ ] **Step 2: 更新 `packages/storage/package.json` scripts**

```json
"scripts": {
  "build": "tsc -p tsconfig.json",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

- [ ] **Step 3: 创建 `packages/storage/src/errors.ts`**

```ts
export class StorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ObjectNotFoundError extends StorageError {}
export class ChecksumMismatchError extends StorageError {}
export class StorageUnavailableError extends StorageError {}
export class StorageDriverNotImplementedError extends StorageError {}
```

- [ ] **Step 4: 创建 `packages/storage/src/types.ts`**

```ts
import type { Readable } from 'node:stream';

export interface PutObjectOptions {
  contentType?: string;
  /** 提供时在上传前校验内容 SHA-256（hex），不匹配抛 ChecksumMismatchError */
  sha256?: string;
}

export interface PutObjectResult {
  key: string;
  size: number;
  etag: string;
}

export interface GetObjectResult {
  body: Readable;
  size: number;
  contentType?: string;
}

export interface HeadObjectResult {
  size: number;
  etag: string;
  contentType?: string;
  sha256?: string;
}

export interface StorageAdapter {
  putObject(key: string, body: Buffer | Readable, opts?: PutObjectOptions): Promise<PutObjectResult>;
  getObject(key: string): Promise<GetObjectResult>;
  headObject(key: string): Promise<HeadObjectResult | null>;
  deleteObject(key: string): Promise<void>;
}
```

- [ ] **Step 5: 创建 `packages/storage/src/checksum.ts`**

```ts
import { createHash } from 'node:crypto';

export function sha256HexBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
```

- [ ] **Step 6: 创建 `packages/storage/src/streams.ts`**

```ts
import type { Readable } from 'node:stream';

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
```

- [ ] **Step 7: 创建 `packages/storage/src/minio-adapter.ts`**

```ts
import * as Minio from 'minio';
import type { Readable } from 'node:stream';
import { sha256HexBuffer } from './checksum';
import { ChecksumMismatchError, ObjectNotFoundError, StorageError, StorageUnavailableError } from './errors';
import { streamToBuffer } from './streams';
import type { HeadObjectResult, PutObjectOptions, PutObjectResult, GetObjectResult, StorageAdapter } from './types';
import type { StorageConfig } from './factory';

const NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

/** 把 minio/网络错误映射为 StorageError 子类（可单测的纯函数）。 */
export function mapMinioError(err: unknown): StorageError {
  const e = err as { code?: string; message?: string } | null | undefined;
  const code = e?.code ?? '';
  const message = e?.message ?? String(err);
  if (code === 'NoSuchKey') return new ObjectNotFoundError(`Object not found: ${message}`, err);
  if (NETWORK_CODES.has(code)) return new StorageUnavailableError(`Storage unavailable: ${message}`, err);
  return new StorageError(`Storage error (${code || 'unknown'}): ${message}`, err);
}

export class MinioStorageAdapter implements StorageAdapter {
  private readonly client: Minio.Client;
  private readonly bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  async putObject(key: string, body: Buffer | Readable, opts: PutObjectOptions = {}): Promise<PutObjectResult> {
    const buf = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    if (opts.sha256) {
      const actual = sha256HexBuffer(buf);
      if (actual !== opts.sha256.toLowerCase()) {
        throw new ChecksumMismatchError(
          `sha256 mismatch for "${key}": expected ${opts.sha256}, got ${actual}`,
        );
      }
    }
    const metaData: Record<string, string> = { 'x-amz-meta-sha256': sha256HexBuffer(buf) };
    if (opts.contentType) metaData['Content-Type'] = opts.contentType;
    try {
      const result = await this.client.putObject(this.bucket, key, buf, buf.length, metaData);
      return { key, size: buf.length, etag: result.etag };
    } catch (err) {
      throw mapMinioError(err);
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const head = await this.headObject(key);
    if (!head) throw new ObjectNotFoundError(`Object not found: ${key}`);
    try {
      const body = await this.client.getObject(this.bucket, key);
      return { body, size: head.size, contentType: head.contentType };
    } catch (err) {
      throw mapMinioError(err);
    }
  }

  async headObject(key: string): Promise<HeadObjectResult | null> {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      const meta = (stat.metaData ?? {}) as Record<string, string>;
      return {
        size: stat.size,
        etag: stat.etag,
        contentType: meta['content-type'],
        sha256: meta['x-amz-meta-sha256'],
      };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      throw mapMinioError(err);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (err) {
      throw mapMinioError(err);
    }
  }
}
```

- [ ] **Step 8: 创建 `packages/storage/src/factory.ts`**

```ts
import { StorageDriverNotImplementedError } from './errors';
import { MinioStorageAdapter } from './minio-adapter';
import type { StorageAdapter } from './types';

export type StorageDriver = 'minio' | 'oss';

export interface StorageConfig {
  driver: StorageDriver;
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.driver) {
    case 'minio':
      return new MinioStorageAdapter(config);
    case 'oss':
      // 迁移期配置位预留（Spec §13.1）；OSS 客户端按 YAGNI 不在 P1A-2 实现。
      throw new StorageDriverNotImplementedError('OSS driver is reserved but not implemented yet');
  }
}

export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  return {
    driver: (env.S3_DRIVER as StorageDriver | undefined) ?? 'minio',
    endPoint: env.S3_ENDPOINT ?? '127.0.0.1',
    port: Number(env.S3_PORT ?? '9000'),
    useSSL: env.S3_USE_SSL === 'true',
    accessKey: env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: env.S3_SECRET_KEY ?? 'openscience_minio_dev',
    bucket: env.S3_BUCKET ?? 'openscience-dev',
  };
}
```

- [ ] **Step 9: 替换 `packages/storage/src/index.ts`**

```ts
export {
  StorageError,
  ObjectNotFoundError,
  ChecksumMismatchError,
  StorageUnavailableError,
  StorageDriverNotImplementedError,
} from './errors';
export type {
  StorageAdapter,
  PutObjectOptions,
  PutObjectResult,
  GetObjectResult,
  HeadObjectResult,
} from './types';
export { sha256HexBuffer } from './checksum';
export { streamToBuffer } from './streams';
export { MinioStorageAdapter, mapMinioError } from './minio-adapter';
export { createStorageAdapter, storageConfigFromEnv, type StorageConfig, type StorageDriver } from './factory';
```

- [ ] **Step 10: 创建 `packages/storage/vitest.config.ts`**（内容与 database 包相同）

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

- [ ] **Step 11: 创建单测 `packages/storage/test/checksum.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { sha256HexBuffer } from '../src/checksum';
import { streamToBuffer } from '../src/streams';

describe('sha256HexBuffer', () => {
  it('matches the well-known sha256 of "abc"', () => {
    expect(sha256HexBuffer(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('returns 64 lowercase hex chars', () => {
    expect(sha256HexBuffer(Buffer.from('hello openscience'))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('streamToBuffer', () => {
  it('collects a readable into one buffer', async () => {
    const buf = await streamToBuffer(Readable.from(['ab', 'cd']));
    expect(buf.toString()).toBe('abcd');
  });
});
```

- [ ] **Step 12: 创建单测 `packages/storage/test/factory.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createStorageAdapter, storageConfigFromEnv } from '../src/factory';
import { StorageDriverNotImplementedError } from '../src/errors';
import { MinioStorageAdapter } from '../src/minio-adapter';

describe('createStorageAdapter', () => {
  it('returns a MinioStorageAdapter for driver=minio', () => {
    const adapter = createStorageAdapter(storageConfigFromEnv({}));
    expect(adapter).toBeInstanceOf(MinioStorageAdapter);
  });

  it('throws for driver=oss (reserved, not implemented)', () => {
    expect(() => createStorageAdapter({ ...storageConfigFromEnv({}), driver: 'oss' })).toThrow(
      StorageDriverNotImplementedError,
    );
  });
});

describe('storageConfigFromEnv', () => {
  it('applies dev defaults when env is empty', () => {
    const config = storageConfigFromEnv({});
    expect(config).toMatchObject({
      driver: 'minio',
      endPoint: '127.0.0.1',
      port: 9000,
      useSSL: false,
      bucket: 'openscience-dev',
    });
  });

  it('reads overrides from env', () => {
    const config = storageConfigFromEnv({ S3_BUCKET: 'other', S3_PORT: '9443', S3_USE_SSL: 'true' });
    expect(config).toMatchObject({ bucket: 'other', port: 9443, useSSL: true });
  });
});
```

- [ ] **Step 13: 创建单测 `packages/storage/test/map-minio-error.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mapMinioError } from '../src/minio-adapter';
import { ObjectNotFoundError, StorageError, StorageUnavailableError } from '../src/errors';

describe('mapMinioError', () => {
  it('maps NoSuchKey to ObjectNotFoundError', () => {
    expect(mapMinioError({ code: 'NoSuchKey', message: 'missing' })).toBeInstanceOf(ObjectNotFoundError);
  });

  it('maps network codes to StorageUnavailableError', () => {
    expect(mapMinioError({ code: 'ECONNREFUSED', message: 'refused' })).toBeInstanceOf(
      StorageUnavailableError,
    );
  });

  it('maps unknown errors to StorageError', () => {
    const mapped = mapMinioError({ code: 'InternalError', message: 'boom' });
    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped).not.toBeInstanceOf(StorageUnavailableError);
  });
});
```

- [ ] **Step 14: 跑 build + typecheck + 单测**

Run: `npx pnpm@9.15.0 --filter @openscience/storage build && npx pnpm@9.15.0 --filter @openscience/storage typecheck && npx pnpm@9.15.0 --filter @openscience/storage test`
Expected: 全绿（7 个单测）。

---

### Task 4: 集成测试 — 迁移 up/rollback/re-deploy + Redis ping

**Files:**
- Create: `packages/database/vitest.integration.config.ts`
- Create: `packages/database/test/migrate.integration.test.ts`
- Create: `packages/database/test/redis.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 的运行栈；Task 2 的 `createPrismaClient`/`createRedisClient`/`pingRedis`/`DEFAULT_DEV_DATABASE_URL`、CLI `node packages/database/dist/migrate-cli.js deploy`、迁移目录 `infra/migrations/20260728000000_baseline_app_meta/`。
- Produces: 迁移可重复 deploy、rollback.sql 可回滚的测试证据。

前置条件：Docker Desktop 已启动；`npx pnpm@9.15.0 stack:up` 已跑通；`@openscience/database` 已 build（dist/migrate-cli.js 存在）。

- [ ] **Step 1: 创建 `packages/database/vitest.integration.config.ts`**

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

- [ ] **Step 2: 创建 `packages/database/test/migrate.integration.test.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/client';

const repoRoot = path.join(__dirname, '..', '..', '..');
const MIGRATION_DIR = path.join(repoRoot, 'infra', 'migrations', '20260728000000_baseline_app_meta');

const prisma = createPrismaClient();

function migrate(command: 'deploy' | 'status'): void {
  execFileSync(
    process.execPath,
    [path.join(repoRoot, 'packages', 'database', 'dist', 'migrate-cli.js'), command],
    { stdio: 'inherit' },
  );
}

async function appMetaExists(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('public.app_meta') AS t`;
  return rows[0]?.t ?? null;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migration deploy/rollback cycle', () => {
  it('deploys baseline, rolls back via rollback.sql, then re-deploys', async () => {
    migrate('deploy');
    expect(await appMetaExists()).toBe('app_meta');

    // Prisma client 可用：写入并读回 app_meta
    await prisma.appMeta.upsert({
      where: { key: 'integration-test' },
      update: { value: { ok: true } },
      create: { key: 'integration-test', value: { ok: true } },
    });
    const row = await prisma.appMeta.findUnique({ where: { key: 'integration-test' } });
    expect(row?.value).toEqual({ ok: true });

    // 补偿回滚（database-migration skill 第 2 条）
    const rollbackSql = readFileSync(path.join(MIGRATION_DIR, 'rollback.sql'), 'utf8');
    await prisma.$executeRawUnsafe(rollbackSql);
    expect(await appMetaExists()).toBeNull();

    // 可重复部署
    migrate('deploy');
    expect(await appMetaExists()).toBe('app_meta');
  });
});
```

- [ ] **Step 3: 创建 `packages/database/test/redis.integration.test.ts`**

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { createRedisClient, pingRedis } from '../src/redis';

const client = createRedisClient();

afterAll(async () => {
  client.disconnect();
});

describe('redis connectivity', () => {
  it('pings the dev redis', async () => {
    expect(await pingRedis(client)).toBe(true);
  });
});
```

- [ ] **Step 4: 跑集成测试**

Run: `npx pnpm@9.15.0 --filter @openscience/database test:integration`
Expected: 2 个集成测试全过；输出可见 prisma migrate deploy 日志。

---

### Task 5: 集成测试 — Storage 对 MinIO 全链路

**Files:**
- Create: `packages/storage/vitest.integration.config.ts`
- Create: `packages/storage/test/minio-adapter.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 的运行栈（bucket `openscience-dev`）；Task 3 的 `createStorageAdapter`/`storageConfigFromEnv`/`streamToBuffer`/`sha256HexBuffer` 与错误类。
- Produces: put/get/head/delete 全链路 + checksum 不匹配 + 缺 key 错误路径的测试证据。

前置条件：同 Task 4（栈已起、bucket 已由 minio-init 建好）。

- [ ] **Step 1: 创建 `packages/storage/vitest.integration.config.ts`**（同 database 包的 integration config，include 相同）

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

- [ ] **Step 2: 创建 `packages/storage/test/minio-adapter.integration.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createStorageAdapter, storageConfigFromEnv } from '../src/factory';
import { sha256HexBuffer } from '../src/checksum';
import { streamToBuffer } from '../src/streams';
import { ChecksumMismatchError, ObjectNotFoundError } from '../src/errors';

const adapter = createStorageAdapter(storageConfigFromEnv({}));
const runId = `integration/${Date.now()}`;

describe('MinioStorageAdapter against dev MinIO', () => {
  it('put/get/head/delete roundtrip', async () => {
    const key = `${runId}/hello.txt`;
    const content = Buffer.from('hello openscience');

    const put = await adapter.putObject(key, content, {
      contentType: 'text/plain',
      sha256: sha256HexBuffer(content),
    });
    expect(put.size).toBe(content.length);
    expect(put.etag).toBeTruthy();

    const head = await adapter.headObject(key);
    expect(head).not.toBeNull();
    expect(head?.size).toBe(content.length);
    expect(head?.sha256).toBe(sha256HexBuffer(content));

    const got = await adapter.getObject(key);
    expect((await streamToBuffer(got.body)).equals(content)).toBe(true);

    await adapter.deleteObject(key);
    expect(await adapter.headObject(key)).toBeNull();
  });

  it('rejects a wrong sha256 before upload', async () => {
    const key = `${runId}/bad-checksum.bin`;
    await expect(
      adapter.putObject(key, Buffer.from('tampered'), { sha256: '0'.repeat(64) }),
    ).rejects.toBeInstanceOf(ChecksumMismatchError);
    expect(await adapter.headObject(key)).toBeNull();
  });

  it('maps missing keys correctly', async () => {
    const missing = `${runId}/missing.bin`;
    expect(await adapter.headObject(missing)).toBeNull();
    await expect(adapter.getObject(missing)).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
});
```

- [ ] **Step 3: 跑集成测试**

Run: `npx pnpm@9.15.0 --filter @openscience/storage test:integration`
Expected: 3 个集成测试全过。

---

### Task 6: 全量门禁 + docs-sync 收尾

**Files:**
- Modify: `AGENTS.md`（Monorepo Layout & Commands 小节补 stack/test 命令）
- Modify: `project_index.md`（登记 compose/schema/migrations/两包实现/plan 文件）
- Modify: `docs/progress.md`（置顶 P1A-2 完成条目，含证据命令输出）
- Modify: `.taskmaster/tasks/tasks.json`（任务 2.2 → done；先试 MCP `set_task_status`，子任务 MCP 写入有已知故障，失败则备份后 JSON 直改）

**Interfaces:**
- Consumes: Task 1–5 全部产物与测试证据。
- Produces: 阶段验收证据与文档同步。

- [ ] **Step 1: 全量构建与静态门禁**

Run: `npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 verify:workspace`
Expected: 全绿，`WORKSPACE_STRUCTURE_OK`。

- [ ] **Step 2: 全量单测 + 集成测试**

Run: `npx pnpm@9.15.0 test && npx pnpm@9.15.0 test:integration`
Expected: 单测 11 个全过；集成测试 5 个全过。

- [ ] **Step 3: 生产守卫演示**

Run: `NODE_ENV=production node packages/database/dist/migrate-cli.js reset-dev`
Expected: 非零退出，输出含 `Refused`；数据库未被触碰。

- [ ] **Step 4: 更新 `AGENTS.md`**

在 “Monorepo Layout & Commands（P1A-1）” 小节的常用命令行追加：

```markdown
- 开发栈：`npx pnpm@9.15.0 stack:up|stack:down|stack:ps`（postgres/redis/minio，仅 127.0.0.1）；测试：`npx pnpm@9.15.0 test`（单测）、`npx pnpm@9.15.0 test:integration`（起栈+集成测试）。
- 数据库迁移：`node packages/database/dist/migrate-cli.js deploy|status|reset-dev`（reset-dev 生产禁用；迁移归 `infra/migrations/`，每个迁移附 rollback.sql）。
```

同时把该小节标题 “（P1A-1）” 改为 “（P1A-1 起）”，并把 `packages/` 行说明从“占位包，未实现业务逻辑”更新为“11 个包；database/storage 已含 P1A-2 实现，其余占位”。

- [ ] **Step 5: 更新 `project_index.md`**

- 根目录表：无需变更。
- docs/ 表追加：`docs/plans/2026-07-28-p1a-2-data-foundation-plan.md`（本计划）。
- infra/ 表更新：`infra/compose/` → “docker-compose.dev.yml 开发栈（P1A-2）”；`infra/migrations/` → “Prisma 迁移（20260728000000_baseline_app_meta + rollback.sql）”；追加 `infra/schema.prisma` 行。
- 根目录表 `packages/` 行更新：注明 database/storage 已实现 P1A-2。
- docs/specs/ 行已存在（design 文档），状态改为“已批准，已实现”。

- [ ] **Step 6: 更新 `docs/progress.md` 置顶条目**

```markdown
## 2026-07-28 — P1A-2 PostgreSQL + Redis + Storage Adapter 完成

### ✅ Completed
| 任务 | 详情 |
|---|---|
| dev 栈 | `infra/compose/docker-compose.dev.yml`（postgres:16/redis:7/minio 固定 tag + minio-init 建 bucket）；`stack:up` 一键起栈，端口仅 127.0.0.1 |
| packages/database | Prisma 5.22 + 基线迁移 `app_meta`（含 rollback.sql 补偿）；`createPrismaClient`/`createRedisClient`；迁移 runner 生产守卫 |
| packages/storage | StorageAdapter 接口 + MinIO 实现（put/get/head/delete + sha256 校验）；OSS 驱动预留抛 NotImplemented |
| 测试证据 | 单测 11 过；集成 5 过（迁移 deploy→rollback→redeploy、redis ping、MinIO 全链路 + 2 错误路径）；`NODE_ENV=production ... reset-dev` 被拒 |

### Key Decisions / 坑
- Prisma 仅前向迁移，回滚走每迁移附带的 rollback.sql 补偿路径（database-migration skill 第 2 条）
- 本机 `docker compose` 插件缺失，脚本 `docker compose ... || docker-compose ...` 兜底
- 开发凭据 compose 内联默认值为用户批准的开发态豁免；生产强制 env（2.9）

### ⏳ Next Steps
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate）
```

（证据数字以实际运行输出为准填写。）

- [ ] **Step 7: task-master 任务 2.2 → done**

先尝试 MCP `set_task_status(id=2.2, status=done)`；若报 `Failed to update task status`（已知子任务故障），则：备份 `.taskmaster/tasks/tasks.json` 为 `.taskmaster/tasks/tasks.json.bak-<日期>-p1a2`，用 node 脚本将子任务 `2.2` 的 status 改为 `done`，校验 JSON 合法。

- [ ] **Step 8: 最终确认栈可清理复起**

Run: `npx pnpm@9.15.0 stack:down && npx pnpm@9.15.0 stack:up && npx pnpm@9.15.0 stack:ps`
Expected: down/up 成功，三服务 running（minio-init 为 exited 0）。

---

## Self-Review 记录

- Spec 覆盖：设计文档 §3 compose→Task 1；§4 database→Task 2/4；§5 storage→Task 3/5；§6 测试→Task 2/3 单测 + Task 4/5 集成；§7 docs-sync→Task 6；§8 验收标准→Task 6 各 Step。无缺口。
- 占位符扫描：无 TBD/TODO；所有代码步骤含完整代码。
- 类型一致性：`storageConfigFromEnv`/`createStorageAdapter`/`mapMinioError`/`createPrismaClient`/`createRedisClient`/`pingRedis`/`assertMigrateCommandAllowed`/`MigrateCommand`/`DEFAULT_DEV_DATABASE_URL` 在定义任务与消费任务间签名一致；集成测试引用的迁移目录名 `20260728000000_baseline_app_meta` 全局唯一一致。
