# P1B-3 Blob 内容寻址存储与上传管线 Design

> Phase 1B SDF 与版本 — P1B-3  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §7.2、§13.1、§17  
> 对应 task-master: 3.3（Blob 内容寻址存储 + 上传管线）

---

## 1. 目标与范围

### 1.1 目标
实现 Blob 内容寻址存储与 Artifact 元数据层，接入 P1A-2 StorageAdapter，支持上传分片、校验和、MIME 检测与病毒扫描占位。

### 1.2 范围

**In Scope（P1B-3）**：
- 迁移 8：`blobs` + `artifacts` 表（含 rollback）
- Prisma model：Blob + Artifact + 与 ResearchObject 关联
- `packages/storage`：Blob 层接口（`putBlob` / `getBlob` / `headBlob`，基于 StorageAdapter）
- `packages/domain`：artifact 领域模块（`createArtifact` / `getArtifact`，去重逻辑）
- 上传管线骨架（分片/校验和/MIME/病毒扫描占位）
- API：`POST /artifacts/upload`（简版单文件上传，幂等键占位）
- 测试：单测（哈希去重）+ 集成测试（上传→存储→读取回环、重复上传不产生新 Blob）

**Out of Scope（P1B-4+）**：
- 版本引擎（Version Manifest 引用 Artifact，P1B-4）
- 多文件上传 / 大文件分片断点续传（P1B-5）
- 真实病毒扫描实装（P1B-8，§17）
- 配额限制强制（P1A-7 骨架已建，P1B-3 只读配额不扣费不拦截）

---

## 2. 需求对齐

### 2.1 Spec 约束

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §7.2.1 | Blob 以 SHA-256 为键保存（MUST） | `blobs.sha256` 主键，存储键 = `sha256` |
| §7.2.2 | Artifact 记录逻辑路径、MIME、大小、Blob hash | `artifacts.logical_path / mime_type / size / blob_sha256` |
| §7.2.4 | 未改变 Artifact 继续引用原 Blob | 去重：相同 sha256 的 putBlob 不重复存储，Artifact 引用已存 Blob |
| §13.1 | 数据库只存元数据和对象键，不存大二进制 | `blobs.sha256` + `storage_key`（对象存储路径），不存 bytea |
| §13.1 | 上传使用分片、校验和、MIME 检测与病毒扫描 | 校验和（StorageAdapter 已有）；MIME（`file-type` npm）；分片/病毒扫描占位函数 |
| §13.3 | 单文件大小等限制走配置，不写死前端 | 读 QuotaPolicy `resource='upload.max_file_size'`，超限返回 413 |
| §17 | 上传文件类型检测、大小限制和恶意内容扫描（MUST） | MIME 检测实装；大小限制实装；病毒扫描占位 `scanFile()` 函数（P1B-8 填充） |

### 2.2 与 P1B-2 的衔接
- P1B-2 建立了 RO + SDF，但 SDF 暂无附件关联
- P1B-3 建立 Artifact，**不立即关联 RO**（P1B-4 Version Manifest 引用 Artifact）
- 本任务 Artifact 独立存在，供后续版本引擎引用

---

## 3. 数据模型

### 3.1 Blob 表

```prisma
model Blob {
  sha256      String    @id @db.Char(64) // SHA-256 hex，内容寻址主键
  storageKey  String    @map("storage_key") // 对象存储路径（如 `blobs/<sha256>`）
  size        BigInt    // 字节数
  createdAt   DateTime  @default(now()) @map("created_at")

  artifacts   Artifact[]

  @@map("blobs")
}
```

**设计决策**：
1. **sha256 主键**：保证相同内容只存一次（§7.2.1、§7.1 去重）
2. **storageKey**：解耦对象存储路径与哈希（未来可迁移/重分布）
3. **size**：BigInt（支持大文件，虽然 P1B-3 只处理小文件）
4. **无 refCount**：不引入引用计数（P1B-9 GC 阶段再考虑清理策略）

### 3.2 Artifact 表

```prisma
model Artifact {
  id            String    @id @default(uuid()) @db.Uuid
  logicalPath   String    @map("logical_path") // 用户视角路径（如 `figures/fig1.png`）
  mimeType      String?   @map("mime_type") // MIME 类型（MIME 检测结果）
  size          BigInt    // 字节数（冗余，便于查询）
  blobSha256    String    @map("blob_sha256") @db.Char(64) // 指向 Blob
  uploadedBy    String    @map("uploaded_by") @db.Uuid // 上传者
  workspaceId   String    @map("workspace_id") @db.Uuid // 所属 Workspace
  createdAt     DateTime  @default(now()) @map("created_at")

  blob          Blob      @relation(fields: [blobSha256], references: [sha256], onDelete: Restrict)
  uploader      User      @relation("ArtifactUploader", fields: [uploadedBy], references: [id], onDelete: Restrict)
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([blobSha256])
  @@map("artifacts")
}
```

**设计决策**：
1. **logicalPath**：用户视角路径，**非唯一**（同一文件可被多次上传到不同 RO/版本）
2. **mimeType 可空**：MIME 检测失败仍可上传（不强制）
3. **size 冗余**：避免 join Blob 才能查大小
4. **uploadedBy + workspaceId**：审计与越权防护（§17）
5. **blobSha256 外键 Restrict**：Blob 被引用时不可删（P1B-9 GC 时处理）
6. **暂无 RO 关联**：P1B-4 Version Manifest 再引用 Artifact

### 3.3 与现有模型关联

- `User` 新增 `uploadedArtifacts Artifact[] @relation("ArtifactUploader")`
- `Workspace` 新增 `artifacts Artifact[]`
- P1B-4 将新增 `VersionManifest` 引用 `Artifact[]`（多对多）

---

## 4. 存储层设计

### 4.1 Blob 存储键规则

```text
blobs/<sha256[0:2]>/<sha256[2:4]>/<sha256>
```

**例**：`sha256 = abc123...` → `blobs/ab/c1/abc123...`

**理由**：
- 分段存储（避免单目录千万文件）
- 内容寻址（文件名即哈希）
- 未来迁移友好（前缀可改）

### 4.2 packages/storage Blob 层接口

```ts
// packages/storage/src/blob.ts
export interface BlobPutResult {
  sha256: string;
  size: number;
  alreadyExists: boolean; // 去重标志
}

export async function putBlob(
  adapter: StorageAdapter,
  content: Buffer | Readable
): Promise<BlobPutResult>;

export async function getBlob(
  adapter: StorageAdapter,
  sha256: string
): Promise<GetObjectResult>;

export async function headBlob(
  adapter: StorageAdapter,
  sha256: string
): Promise<HeadObjectResult | null>;
```

**putBlob 去重逻辑**：
1. 计算 content 的 SHA-256
2. `headBlob(sha256)` 检查已存在 → `{ sha256, size, alreadyExists: true }`
3. 否则 `adapter.putObject(storageKey, content, { sha256 })` → `{ sha256, size, alreadyExists: false }`

### 4.3 StorageAdapter 复用

P1A-2 已实现 `StorageAdapter` 与 `MinioStorageAdapter`，含 sha256 校验。P1B-3 直接复用，**无需修改**。

---

## 5. 领域层设计

### 5.1 packages/domain/artifact 模块

```ts
// packages/domain/src/artifact/artifacts.ts
export interface CreateArtifactInput {
  logicalPath: string;
  content: Buffer | Readable;
  mimeType?: string; // 可选（MIME 检测可自动填充）
  uploadedBy: string;
  workspaceId: string;
}

export interface CreateArtifactResult {
  artifactId: string;
  blobSha256: string;
  size: number;
  alreadyExists: boolean; // Blob 去重标志
}

export async function createArtifact(
  input: CreateArtifactInput,
  prisma: PrismaClient,
  storage: StorageAdapter
): Promise<CreateArtifactResult>;

export async function getArtifact(
  artifactId: string,
  prisma: PrismaClient
): Promise<ArtifactDetail | null>;
```

**createArtifact 流程**：
1. **MIME 检测**（如 input.mimeType 未提供）：`detectMimeType(content)` → `file-type` npm
2. **putBlob**：`storage.putBlob(content)` → `{ sha256, size, alreadyExists }`
3. **Blob 入库**（若不存在）：`prisma.blob.upsert({ where: { sha256 }, create: { ... } })`
4. **Artifact 入库**：`prisma.artifact.create({ data: { logicalPath, mimeType, size, blobSha256: sha256, uploadedBy, workspaceId } })`
5. 返回 `{ artifactId, blobSha256: sha256, size, alreadyExists }`

### 5.2 MIME 检测

```ts
// packages/domain/src/artifact/mime.ts
import { fileTypeFromBuffer, fileTypeFromStream } from 'file-type';

export async function detectMimeType(
  content: Buffer | Readable
): Promise<string | undefined> {
  if (Buffer.isBuffer(content)) {
    const type = await fileTypeFromBuffer(content);
    return type?.mime;
  }
  // Readable 需先转 Buffer（小文件）或用 fileTypeFromStream（P1B-5 大文件分片）
  const buf = await streamToBuffer(content);
  const type = await fileTypeFromBuffer(buf);
  return type?.mime;
}
```

**依赖**：`file-type@^22.0.1`（ESM-only，用 **dynamic import** 兼容 CJS，P1B-3 开工实测确认）

> **设计修订（2026-08-04 开工）**：设计 gate 原定「全仓升级 tsconfig `module: esnext`」，但实测发现 `module: esnext` 会让 TS 不转译 import/export，而包无 `type: module`，Node 按 CJS 加载 → 全仓 SyntaxError。改用 **dynamic import**：`await import('file-type')` 在 CJS 中合法，零 tsconfig 改动，风险最小。

### 5.3 配额检查（占位）

```ts
// packages/domain/src/artifact/quota.ts
export async function checkUploadQuota(
  workspaceId: string,
  fileSize: number,
  prisma: PrismaClient
): Promise<void> {
  // 1. 查 QuotaPolicy `resource='upload.max_file_size'` scope='workspace'/scopeKey=workspaceId
  // 2. 若 fileSize > limitValue → throw ArtifactError('FILE_TOO_LARGE', 413)
  // 3. P1B-3 只读配额，不扣费（P1A-7 UsageLedger 暂不消耗，P1B-6 再接入）
}
```

### 5.4 病毒扫描（占位）

```ts
// packages/domain/src/artifact/scan.ts
export async function scanFile(
  content: Buffer | Readable
): Promise<ScanResult> {
  // P1B-3 占位：返回 { safe: true }
  // P1B-8 实装：接入 ClamAV / VirusTotal API（§17）
  return { safe: true };
}

export interface ScanResult {
  safe: boolean;
  threat?: string;
}
```

---

## 6. API 层设计

### 6.1 POST /artifacts/upload

**请求**：

```http
POST /artifacts/upload
Content-Type: multipart/form-data
Authorization: Bearer <session_token>
X-Workspace-Id: <workspace_id>

file=<binary>
logicalPath=figures/fig1.png
```

**响应**（成功 201）：

```json
{
  "artifactId": "uuid",
  "blobSha256": "abc123...",
  "size": 12345,
  "mimeType": "image/png",
  "alreadyExists": false
}
```

**错误**：
- 400 `INVALID_REQUEST`：缺 file / logicalPath
- 413 `FILE_TOO_LARGE`：超配额（checkUploadQuota）
- 415 `UNSUPPORTED_MEDIA_TYPE`：MIME 检测失败或不允许的类型（P1B-8 白名单）
- 451 `MALICIOUS_FILE`：病毒扫描不通过（P1B-8）
- 409 `CONCURRENT_UPDATE`：幂等键冲突（P1B-5）

### 6.2 GET /artifacts/:id/download

**响应**：

```http
HTTP/1.1 200 OK
Content-Type: <mime_type>
Content-Disposition: attachment; filename="<logical_path_basename>"
Content-Length: <size>

<binary stream>
```

### 6.3 幂等键（占位）

P1B-3 不实装幂等键（P1B-5 多文件上传时再加）。占位：
- 请求头 `Idempotency-Key: <uuid>`（可选）
- 存储到 `artifacts.idempotency_key`（P1B-5 迁移加列）
- 冲突返回 409（P1B-5）

---

## 7. 分片上传（占位）

P1B-3 只处理**小文件单次上传**（< 100MB）。大文件分片断点续传归 P1B-5。

**占位函数**：

```ts
// packages/domain/src/artifact/chunked-upload.ts
export async function initChunkedUpload(
  logicalPath: string,
  totalSize: number,
  workspaceId: string
): Promise<string> {
  // P1B-5 实装：返回 uploadId
  throw new Error('NOT_IMPLEMENTED');
}
```

---

## 8. 测试策略

### 8.1 单元测试

**packages/storage Blob 层**（`packages/storage/src/__tests__/blob.test.ts`）：
- `putBlob` 去重：相同内容两次调用，第二次 `alreadyExists: true`
- `putBlob` 校验和：内容不匹配 sha256 抛 `ChecksumMismatchError`
- `getBlob` / `headBlob` 正常流

**packages/domain artifact**（`packages/domain/src/artifact/__tests__/artifacts.test.ts`）：
- `createArtifact` 原子：Blob + Artifact 入库
- `createArtifact` 去重：相同内容上传，Blob 不重复，Artifact 新增
- MIME 检测：PNG 正确识别
- 配额超限：`checkUploadQuota` 抛 413

### 8.2 集成测试

**apps/api 集成测试**（`apps/api/src/__tests__/integration/artifact.test.ts`）：
1. **上传→存储→读取回环**：
   - POST /artifacts/upload → 201 + artifactId
   - GET /artifacts/:id/download → 200 + 内容一致
2. **重复上传不产生新 Blob**：
   - 两次上传相同文件 → 两个 Artifact，一个 Blob
   - `blobs` 表只有一行
3. **配额超限拒绝**：
   - seed QuotaPolicy `upload.max_file_size = 1MB`
   - 上传 2MB → 413
4. **MIME 伪装拒绝**（P1B-8 安全测试）：
   - 上传 `.png` 扩展名但内容为 `.exe` → 415（P1B-3 占位，P1B-8 实装）

---

## 9. 迁移

### 9.1 迁移 8：blobs + artifacts

**up.sql**：

```sql
CREATE TABLE blobs (
  sha256      CHAR(64) PRIMARY KEY,
  storage_key VARCHAR(255) NOT NULL,
  size        BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE artifacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_path VARCHAR(1024) NOT NULL,
  mime_type    VARCHAR(255),
  size         BIGINT NOT NULL,
  blob_sha256  CHAR(64) NOT NULL REFERENCES blobs(sha256) ON DELETE RESTRICT,
  uploaded_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_workspace_id ON artifacts(workspace_id);
CREATE INDEX idx_artifacts_blob_sha256 ON artifacts(blob_sha256);
```

**rollback.sql**：

```sql
DROP TABLE artifacts;
DROP TABLE blobs;
```

---

## 10. 实施顺序（对应 plan 文件）

1. **迁移 8** → Prisma 同步 → 测试骨架（local 门禁全绿）
2. **storage Blob 层** → putBlob/getBlob/headBlob + 单测
3. **domain artifact** → createArtifact/getArtifact + MIME 检测 + 配额占位 + 单测
4. **API** → POST/GET /artifacts + error-map + 集成测试
5. **云上收口** → 集成测试全绿 + task-master 3.3 done

---

## 11. Open Questions（Design Gate 确认）

### 11.1 Blob 存储键前缀
- 方案 A（推荐）：`blobs/<sha256[0:2]>/<sha256[2:4]>/<sha256>`（分段）
- 方案 B：`blobs/<sha256>`（平铺）

**决策**：？

### 11.2 Artifact.logicalPath 唯一性
- 方案 A（推荐）：**非唯一**（同名文件可多次上传，P1B-4 Version Manifest 再去重）
- 方案 B：workspace + logicalPath 唯一（限制同名上传）

**决策**：？

### 11.3 MIME 检测失败行为
- 方案 A（推荐）：允许上传（mimeType = null），但记录审计日志
- 方案 B：拒绝上传（415）

**决策**：？

### 11.4 file-type ESM-only 依赖
- `file-type@19` 是 ESM-only，需 tsconfig `"module": "esnext"` 或 dynamic import
- 方案 A（推荐）：全仓升级 tsconfig.base.json `"module": "esnext"`
- 方案 B：只 domain 包 dynamic import `file-type`

**决策**：？

### 11.5 P1B-3 配额读取不扣费
- P1A-7 骨架已建 QuotaPolicy + UsageLedger，但 P1B-3 上传暂不消耗 UsageLedger（P1B-6 再接入）
- 只读 `upload.max_file_size` 限制，超限拦截，通过不记账

**确认**：OK？

---

## 12. 债务登记

- **病毒扫描占位**（P1B-8）：`scanFile()` 返回 `{ safe: true }`
- **大文件分片上传**（P1B-5）：`initChunkedUpload()` 抛 `NOT_IMPLEMENTED`
- **幂等键**（P1B-5）：`artifacts.idempotency_key` 迁移 9 加列
- **Blob GC**（P1B-9）：无引用 Blob 清理策略
- **MIME 白名单**（P1B-8）：P1B-3 不限制类型，P1B-8 加白名单
- **file-type ESM-only**：需全仓或局部 dynamic import（Open Question 11.4）

---

## 13. 验收条件

- [ ] 迁移 8 applied + rollback 验证
- [ ] storage Blob 层单测全绿（去重/校验和/读取）
- [ ] domain artifact 单测全绿（创建/MIME/配额）
- [ ] API 集成测试全绿（上传→下载回环、重复上传一个 Blob、配额超限 413）
- [ ] 本地门禁全绿（build/typecheck/lint/audit）
- [ ] 云上集成测试全绿（新增 P1B-3 + 既有回归）
- [ ] task-master 3.3 done
- [ ] 文档同步（progress.md/project_index.md/handoff）
