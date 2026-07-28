# P1A-2 数据基础设计：PostgreSQL + Redis + Storage Adapter

- 日期：2026-07-28
- 状态：已批准（2026-07-28 用户确认设计）
- 关联：task-master 任务 2.2；Spec §13.1、§14.2、§15、§21.1；ADR-001、ADR-002；`.agents/skills/database-migration/SKILL.md`
- 前置：P1A-1 Monorepo 骨架已完成

## 1. 范围

**做**：

- `infra/compose/docker-compose.dev.yml` 开发栈：PostgreSQL 16 + Redis 7 + MinIO（S3 兼容对象存储）。
- `packages/database`：Prisma 连接层、Redis 连接工厂、迁移 runner（含生产守卫）、最小基线迁移。
- `packages/storage`：Storage Adapter 接口 + MinIO 实现。
- Vitest 测试基建（单测 + 真实 compose 栈集成测试）。

**不做（YAGNI，留待后续任务）**：

- OSS 客户端（仅预留 `driver: 'oss'` 配置位，调用抛 NotImplemented）。
- User/Workspace/Invitation 等业务实体（随 2.3/2.4 各自 design gate 落地）。
- 限流逻辑（2.8）、文件元数据表/Blob/Artifact（1B）、presigned URL（1B 上传流需要时再加）。
- 生产 compose / CI 流水线（2.9）。

## 2. 选型决策（2026-07-28 用户确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据库访问与迁移 | Prisma | ADR-001 既定方向；Scholars Tea 的问题在流程（空 baseline/db push）而非工具；类型生成对 1B–1E 友好 |
| 本次 schema 范围 | 最小基线 | 只建迁移机制 + `app_meta` 一张表；业务实体随各自任务落地，避免未评审设计返工 |
| 测试框架 | Vitest | TS/ESM 原生、与 pnpm workspace 契合 |
| S3 客户端 | minio SDK | 轻量、API 直接；换 OSS 时 Adapter 接口已隔离 |

## 3. Dev 起栈（infra/compose）

`docker-compose.dev.yml` 服务：

- `postgres:16-alpine`：healthcheck（`pg_isready`），named volume，端口 `127.0.0.1:5432`。
- `redis:7-alpine`：healthcheck（`redis-cli ping`），named volume，端口 `127.0.0.1:6379`。
- `minio/minio`（固定 RELEASE tag，不用 latest）：healthcheck，named volume，API `127.0.0.1:9000`、Console `127.0.0.1:9001`。
- `minio-init`（minio/mc，一次性）：依赖 minio healthy，创建 dev bucket 后退出。

凭据策略（用户已确认的开发态豁免）：compose 内联 `${VAR:-dev-only默认值}`，本机开发零配置可用；这些默认值只保护本机一次性开发数据，不是真实密钥。键名登记进 `.env.example`。生产 compose（2.9）一律强制 env、无默认值。

根 `package.json` 新增脚本：`stack:up` / `stack:down` / `stack:ps`（封装 `docker compose -f infra/compose/docker-compose.dev.yml`）。

## 4. packages/database

- Prisma schema 放 `infra/schema.prisma`，迁移目录为 `infra/migrations/`（满足 database-migration skill 第 6 条）；generated client 走默认 node_modules 输出。
- 导出：
  - `createPrismaClient()`：PrismaClient 单例工厂（内置连接池，不另引 `pg`）。
  - `createRedisClient()`：ioredis 连接工厂 + `ping` 健康检查；限流逻辑属 2.8，不在此实现。（默认挂空 error listener 防未处理 error 事件打挂进程，消费方可自加 listener；2026-07-28 终审修订）
- 迁移 runner 脚本：封装 `prisma migrate deploy`；`NODE_ENV=production` 时拒绝 `migrate dev` / `db push` / `migrate reset`（Spec §15 MUST：生产禁止自动破坏性迁移）。
- 最小基线迁移：仅建 `app_meta(key TEXT PK, value JSONB, updated_at TIMESTAMPTZ)`。
- 回滚补偿：Prisma 仅前向迁移；按 database-migration skill 第 2 条，每个迁移目录附带手写 `rollback.sql`（基线的 rollback 即 `DROP TABLE app_meta`），集成测试实际执行验证。

## 5. packages/storage

接口 `StorageAdapter`：

```ts
putObject(key, body: Buffer | Readable, opts?: { contentType?: string; sha256?: string }): Promise<{ key: string; size: number; etag: string }>
getObject(key): Promise<{ body: Readable; contentType?: string; size: number }>
headObject(key): Promise<{ size: number; contentType?: string; etag: string } | null>
deleteObject(key): Promise<void>
```

- `sha256` 提供时做校验和验证，不匹配抛 `ChecksumMismatchError`（对应任务要求的签名校验）。
- 实现 `MinioStorageAdapter`：minio SDK，配置来自 env（`S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET`）。
- 工厂 `createStorageAdapter(config)`：`driver: 'minio' | 'oss'`；`oss` 分支抛 NotImplementedError（配置位预留，不实现 OSS 客户端）。
- 错误统一映射为 `StorageError` 子类：`ObjectNotFoundError`、`ChecksumMismatchError`、`StorageUnavailableError`。
- 数据库只存元数据 + 对象键（§13.1）；本任务不建文件元数据表。

## 6. 测试（Vitest）

- 单测（无需 docker 栈）：生产守卫逻辑、Adapter 错误映射、checksum 计算。
- 集成测试（真实 compose 栈，globalSetup 检查并复用已起的栈，不重复起停）：
  - 迁移：`migrate deploy` up → `app_meta` 存在 → 执行 `rollback.sql` → 消失 → 再 deploy → 恢复（可重复执行）。
  - Storage：对 MinIO 的 put/get/head/delete 全链路；checksum 不匹配、缺 key 两条错误路径。
- 根脚本：`test`（单测）、`test:integration`（集成，前置栈可用）。

## 7. 收尾同步（docs-sync）

- 登记 `project_index.md`；`docs/progress.md` 置顶条目（含证据命令输出）；`AGENTS.md` 补充新命令；task-master 2.2 状态流转（子任务 MCP 写入有已知故障，必要时按 JSON 修复路径 + 备份处理）。
- 实施沿用 P1A-1 做法：`.worktrees/p1a-2` 隔离执行，净产物复制回主目录；全程不 commit（未经用户逐次批准）。

## 8. 验收标准

- `pnpm stack:up` 一键起栈，三服务 healthy，MinIO dev bucket 已建。
- `pnpm build` / `typecheck` / `verify:workspace` 全绿。
- 单测全过；集成测试在栈可用时全过（迁移可重复 deploy、rollback.sql 验证通过、Storage 全链路 + 错误路径通过）。
- `NODE_ENV=production` 下破坏性迁移命令被 runner 拒绝。
