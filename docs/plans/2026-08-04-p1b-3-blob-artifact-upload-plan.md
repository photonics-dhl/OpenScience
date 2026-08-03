# P1B-3 Blob 内容寻址存储与上传管线 Plan

> Phase 1B SDF 与版本 — P1B-3  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-3-blob-artifact-upload-design.md](../specs/2026-08-04-p1b-3-blob-artifact-upload-design.md)  
> 对应 task-master: 3.3

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| Blob 存储键前缀 | `blobs/<sha256[0:2]>/<sha256[2:4]>/<sha256>`（分段） |
| Artifact.logicalPath 唯一性 | 非唯一（同名可多次上传） |
| MIME 检测失败行为 | 允许上传（mimeType = null），记录审计日志 |
| file-type ESM-only | **dynamic import**（开工实测发现全仓 esnext 会破坏 CJS 运行时，改用方案 B） |
| 配额读取不扣费 | 只读 `upload.max_file_size` 限制拦截，P1B-6 再记账 |

---

## 1. 任务拆解（TDD）

### Task 1：迁移 8 + Prisma 同步 + 测试骨架
- 写 `infra/migrations/20260804000000_blob_artifact/migration.sql` + `rollback.sql`
- `infra/schema.prisma`：Blob + Artifact model + User/Workspace 关联
- 本地 `migrate deploy` + `generate`
- 测试骨架：`packages/storage/src/__tests__/blob.test.ts`、`packages/domain/src/artifact/__tests__/artifacts.test.ts`、`apps/api/src/__tests__/integration/artifact.test.ts`（占位，跳过）
- 门禁：build/typecheck 全绿

### Task 2：file-type dynamic import 依赖
- `pnpm --filter @openscience/domain add file-type@^22.0.1`
- 验证 `await import('file-type')` 在 CJS 下类型解析正常（build 全绿）
- 门禁：typecheck 全绿

### Task 3：storage Blob 层实现
- `packages/storage/src/blob.ts`：`putBlob` / `getBlob` / `headBlob`
- `putBlob` 去重逻辑：`headBlob(sha256)` 存在 → `{ alreadyExists: true }`
- 存储键工具：`getBlobStorageKey(sha256: string): string` → `blobs/${sha256.slice(0,2)}/${sha256.slice(2,4)}/${sha256}`
- 单测：`packages/storage/src/__tests__/blob.test.ts`（去重、校验和、读取）
- 门禁：storage 单测 3+ 用例全绿

### Task 4：domain artifact MIME 检测
- `packages/domain/src/artifact/mime.ts`：`detectMimeType(content: Buffer | Readable)`
- 依赖：`pnpm add file-type@^19.7.0 -w` → `packages/domain/package.json`
- 单测：`packages/domain/src/artifact/__tests__/mime.test.ts`（PNG 识别、未知文件 undefined）
- 门禁：domain mime 单测 2+ 用例全绿

### Task 5：domain artifact 配额检查（占位）
- `packages/domain/src/artifact/quota.ts`：`checkUploadQuota(workspaceId, fileSize, prisma)`
- 读 `QuotaPolicy` `resource='upload.max_file_size'` scope='workspace'/scopeKey
- 超限 → throw `ArtifactError('FILE_TOO_LARGE', { max, actual })`
- `packages/domain/src/artifact/errors.ts`：`ArtifactError` 类（含 FILE_TOO_LARGE / INVALID_MIME / MALICIOUS_FILE）
- 单测：`packages/domain/src/artifact/__tests__/quota.test.ts`（超限抛错、无配额通过）
- 门禁：domain quota 单测 2+ 用例全绿

### Task 6：domain artifact 病毒扫描（占位）
- `packages/domain/src/artifact/scan.ts`：`scanFile(content) → { safe: true }`（占位，P1B-8 实装）
- 单测：`packages/domain/src/artifact/__tests__/scan.test.ts`（占位返回 safe）
- 门禁：domain scan 单测 1 用例全绿

### Task 7：domain artifact 核心逻辑
- `packages/domain/src/artifact/artifacts.ts`：`createArtifact` / `getArtifact`
- `createArtifact` 流程：
  1. `checkUploadQuota(workspaceId, fileSize)`
  2. `scanFile(content)` → 不 safe 抛 `MALICIOUS_FILE`
  3. `detectMimeType(content)` → mimeType（失败 = undefined，记录审计日志）
  4. `storage.putBlob(content)` → `{ sha256, size, alreadyExists }`
  5. `prisma.blob.upsert({ where: { sha256 }, create: { sha256, storageKey, size } })`
  6. `prisma.artifact.create({ data: { logicalPath, mimeType, size, blobSha256: sha256, uploadedBy, workspaceId } })`
  7. 审计日志：`artifact.created`（含 alreadyExists）
  8. 返回 `{ artifactId, blobSha256, size, mimeType, alreadyExists }`
- `getArtifact`：`prisma.artifact.findUnique({ where: { id }, include: { blob: true, uploader: true } })`
- 单测：`packages/domain/src/artifact/__tests__/artifacts.test.ts`（创建原子、去重、MIME、配额超限、病毒拒绝）
- 门禁：domain artifact 单测 5+ 用例全绿

### Task 8：API /artifacts 路由
- `apps/api/src/routes/artifacts/index.ts`：注册 `/artifacts` 路由
- `POST /artifacts/upload`：
  - `@fastify/multipart` 解析 file + logicalPath
  - 鉴权：requireAuth + requireWorkspace preHandler
  - 调用 `domain.createArtifact({ content: file, logicalPath, uploadedBy: session.userId, workspaceId })`
  - 返回 201 + `{ artifactId, blobSha256, size, mimeType, alreadyExists }`
- `GET /artifacts/:id/download`：
  - 鉴权：requireAuth + 越权检查（artifact.workspaceId 与用户权限）
  - 调用 `storage.getBlob(artifact.blobSha256)`
  - stream 响应：`Content-Type: artifact.mimeType`、`Content-Disposition: attachment; filename="<basename>"`
- `apps/api/src/routes/artifacts/error-map.ts`：ArtifactError → HTTP（FILE_TOO_LARGE=413, INVALID_MIME=415, MALICIOUS_FILE=451）
- `apps/api/src/app.ts`：注册 `/artifacts` 路由
- 门禁：build 全绿

### Task 9：API 集成测试
- `apps/api/src/__tests__/integration/artifact.test.ts`：
  1. **上传→下载回环**：POST → 201 + artifactId，GET → 200 + 内容一致
  2. **重复上传不产生新 Blob**：两次相同文件 → 两个 Artifact，`blobs` 表只一行
  3. **配额超限拒绝**：seed `upload.max_file_size=1048576`（1MB），上传 2MB → 413
  4. **MIME 检测失败允许**：上传无魔数文件 → 201 + mimeType=null
  5. **越权拒绝**：workspace A 上传，user B 下载 → 403
- 门禁：集成测试 5 用例全绿

### Task 10：本地门禁收口
- `npx pnpm build` 全绿
- `npx pnpm typecheck` 全绿
- `npx pnpm lint` 0 errors
- `npx pnpm test`：storage 3 + domain 10 + api 集成 5 = 18 新增（既有回归）
- `npx pnpm audit:knip` 无新增 unused
- `npx pnpm audit:dep` 0 errors
- `npx pnpm docs:lint` 0 errors

### Task 11：云上集成测试
- `scripts/cloud-sync.mjs` 同步代码
- 云上：`npx pnpm install` + 全量 `npx pnpm build`
- 云上：容器内 `migrate deploy`（迁移 8）
- 云上：seed `upload.max_file_size` 配额（`scripts/seed-quota.mjs`）
- 云上：`npx pnpm test:integration` 全绿（新增 P1B-3 5 + 既有 26 回归 = 31）

### Task 12：文档同步 + task-master done
- 更新 `docs/progress.md`（置顶 P1B-3 完成条目）
- 更新 `project_index.md`（新增 migration 8 / storage blob.ts / domain artifact / api artifacts）
- `task-master 3.3` → done + details
- 写 `docs/handoff/2026-08-04-p1b-3-blob-artifact-done-handoff.md`（决策/坑/P1B-4 第一步）

---

## 2. 验收清单（步骤 14）

- [ ] 迁移 8 applied + rollback 验证
- [ ] storage Blob 层单测 3+（去重/校验和/读取）
- [ ] domain MIME 单测 2+
- [ ] domain 配额单测 2+
- [ ] domain artifact 单测 5+（创建/去重/MIME/配额/病毒）
- [ ] API 集成测试 5+（回环/去重/配额/MIME/越权）
- [ ] 本地门禁全绿（build/typecheck/lint/audit）
- [ ] 云上集成 31/31 全绿（新增 5 + 既有 26）
- [ ] task-master 3.3 done
- [ ] 文档同步（progress/index/handoff）

---

## 3. 风险与依赖

### 3.1 风险
- **file-type ESM-only**：tsconfig 升级可能影响既有包（验证：Task 2 全仓 build）
- **@fastify/multipart**：已安装（P1A-3），但未用过 file upload（Task 8 验证）
- **MinIO 存储键分段**：MinIO 不支持真实目录，`/` 只是键前缀（无风险，只是逻辑分段）

### 3.2 依赖
- P1A-2：StorageAdapter + MinioStorageAdapter（已实现）
- P1A-7：QuotaPolicy 表（已实现，seed 数据待补）
- P1B-2：User + Workspace 关联（已实现）

---

## 4. 预计工作量

| 任务 | 预计时间 |
|---|---|
| Task 1–2（迁移 + tsconfig） | 30min |
| Task 3（storage Blob） | 1h |
| Task 4–6（domain MIME/配额/扫描） | 1h |
| Task 7（domain artifact 核心） | 1.5h |
| Task 8（API 路由） | 1h |
| Task 9（集成测试） | 1h |
| Task 10（本地门禁） | 30min |
| Task 11（云上收口） | 1h |
| Task 12（文档） | 30min |
| **总计** | **8h**（一个工作日） |

---

## 5. 开工前准备

- [x] Design gate 确认（五决策）
- [x] Plan 写毕
- [ ] 用户批准 plan
- [ ] 开始 Task 1
