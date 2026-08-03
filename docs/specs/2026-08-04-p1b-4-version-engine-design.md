# P1B-4 Commit/Manifest 增量版本引擎 Design

> Phase 1B SDF 与版本 — P1B-4  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §2.2.3、§7.1、§7.2、§15、§16、§17  
> 对应 task-master: 3.4（Commit/ChangeSet/Version/VersionManifest）

---

## 1. 目标与范围

### 1.1 目标
实现增量版本引擎：Commit 记录变更、VersionManifest 引用 Artifact、SDF 变化用 JSON Patch、任意版本可重建可校验、公开版本不可变。

### 1.2 范围

**In Scope（P1B-4）**：
- 迁移 9：`branches` + `commits` + `changesets` + `versions` + `version_manifests` 表（含 rollback）
- `packages/versioning`：JSON Patch 纯函数（apply/compare/校验）+ Manifest 重建逻辑
- `packages/domain`：commit 领域模块（createCommit + 自动生成 Manifest）
- API：`POST /research-objects/:id/commits` + `GET /versions/:id` + 重建校验端点
- 不可变校验：公开版本禁止原地修改（§2.2.3）
- 测试：单测（JSON Patch 应用/逆推/Manifest 重建/不可变）+ 集成（创建 Commit→生成 Manifest→重建校验哈希）

**Out of Scope（Phase 1C+）**：
- 完整 Branch 模型（Merge/Fork/PR，§2.3）——P1B-4 只建默认主线
- Version 发布状态机（draft→published→revised，§4.1）——P1B-7 发布
- 逻辑检查点加速重建（§7.2.7）——P1B-6
- SDF 结构化 diff 展示（§7.3）——P1B-8

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §7.2.3 | Version Manifest 保存版本对 Artifact 的引用 | `version_manifests` 行（versionId → artifactId 引用列表） |
| §7.2.4 | 未改变 Artifact 继续引用原 Blob | Manifest 生成时未变化 Artifact 引用原 blobSha256（内容寻址天然支持） |
| §7.2.5 | SDF JSON 结构化变化用 RFC 6902 JSON Patch | `fast-json-patch` apply/compare（CJS，非 ESM 依赖） |
| §7.2.7 | 小型逻辑检查点可生成，相同 Blob 不重复保存 | 检查点字段预留，P1B-6 实装 |
| §2.2.3 | 已公开版本永久不可原地修改，修改必须产生新版本 | 写入路径强制校验（version.status = published → 拒绝） |
| §7.1 | 版本必须可完整重建、可校验 | Manifest 记录完整 Artifact 引用，重建 = 遍历 Manifest + 读 Blob + 校验 sha256 |
| §15 | Branch、Commit、ChangeSet、Version、VersionManifest 实体 | 迁移 9 五表 |
| §16 | /commits、/versions API + 幂等键 + 乐观锁 | POST commit（Idempotency-Key）+ GET version |
| §17 | 写操作记录审计 | commit.create / version.rebuild 审计 |

---

## 3. 数据模型

### 3.1 Branch 表（默认主线，Phase 1C 扩展）

```prisma
model Branch {
  id            String   @id @default(uuid()) @db.Uuid
  researchObjectId String @map("research_object_id") @db.Uuid
  name          String   // 默认 "main"；Phase 1C 分支扩展
  isDefault     Boolean  @default(false) @map("is_default")
  createdAt     DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation(fields: [researchObjectId], references: [id], onDelete: Cascade)
  commits        Commit[]

  @@unique([researchObjectId, name]) // 分支名唯一（Phase 1C 多分支）
  @@map("branches")
}
```

**设计决策**：
1. **默认主线**：每 RO 建一个 `main` 分支（isDefault=true），Commit 挂它
2. **不封死分支扩展**：name 唯一约束 + researchObjectId 外键，Phase 1C 加其他分支只需插行

### 3.2 Commit 表

```prisma
model Commit {
  id            String   @id @default(uuid()) @db.Uuid
  researchObjectId String @map("research_object_id") @db.Uuid
  branchId       String   @map("branch_id") @db.Uuid
  parentCommitId String?  @map("parent_commit_id") @db.Uuid // 前驱 Commit（链）
  message        String   // 提交说明（§8 Commit 语义）
  authorId       String   @map("author_id") @db.Uuid
  idempotencyKey String?  @unique @map("idempotency_key") // §16 幂等键
  createdAt      DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation("CommitResearchObject", fields: [researchObjectId], references: [id], onDelete: Cascade)
  branch         Branch         @relation(fields: [branchId], references: [id], onDelete: Restrict)
  parentCommit   Commit?        @relation("CommitParent", fields: [parentCommitId], references: [id], onDelete: Restrict)
  childCommits   Commit[]       @relation("CommitParent")
  changesets     ChangeSet[]
  versions       Version[]

  @@index([branchId, createdAt])
  @@map("commits")
}
```

### 3.3 ChangeSet 表（一次 commit 的变更单元）

```prisma
model ChangeSet {
  id       String  @id @default(uuid()) @db.Uuid
  commitId String  @map("commit_id") @db.Uuid
  kind     String  // 'sdf_core' | 'artifact_add' | 'artifact_update' | 'artifact_remove'
  payload  Json    // 变化内容：
                   //   sdf_core → { op: 'replace', path: '/problem', value: '...' }（RFC 6902 单 op）
                   //   artifact_add → { logicalPath, blobSha256 }
                   //   artifact_update → { logicalPath, oldBlobSha256, newBlobSha256 }
                   //   artifact_remove → { logicalPath }
  createdAt DateTime @default(now()) @map("created_at")

  commit Commit @relation(fields: [commitId], references: [id], onDelete: Cascade)

  @@index([commitId])
  @@map("changesets")
}
```

### 3.4 Version 表（不可变快照）

```prisma
model Version {
  id            String   @id @default(uuid()) @db.Uuid
  researchObjectId String @map("research_object_id") @db.Uuid
  commitId       String   @map("commit_id") @db.Uuid // 版本对应的 Commit
  versionNo      Int      @map("version_no") // RO 内递增版本号（外部可读，§2.2 原则 5）
  status         VersionStatus @default(draft) // draft → published（P1B-7 发布状态机）
  createdAt      DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation("VersionResearchObject", fields: [researchObjectId], references: [id], onDelete: Cascade)
  commit         Commit         @relation(fields: [commitId], references: [id], onDelete: Restrict)
  manifest       VersionManifest?

  @@unique([researchObjectId, versionNo])
  @@index([researchObjectId])
  @@map("versions")
}

enum VersionStatus {
  draft
  published
  revised
  withdrawn
}
```

### 3.5 VersionManifest 表（§7.2.3 Artifact 引用）

```prisma
model VersionManifest {
  id        String   @id @default(uuid()) @db.Uuid
  versionId String   @unique @map("version_id") @db.Uuid
  coreJson  Json     @map("core_json") // 版本 SDF core 快照（重建时先 apply JSON Patch 链再固化）
  createdAt DateTime @default(now()) @map("created_at")

  version   Version  @relation(fields: [versionId], references: [id], onDelete: Cascade)
  entries   ManifestEntry[]

  @@map("version_manifests")
}

model ManifestEntry {
  id              String   @id @default(uuid()) @db.Uuid
  manifestId      String   @map("manifest_id") @db.Uuid
  logicalPath     String   @map("logical_path") // Artifact 逻辑路径
  artifactId      String   @map("artifact_id") @db.Uuid // 指向 Artifact（引用）
  blobSha256      String   @map("blob_sha256") @db.Char(64) // 冗余：Manifest 重建免 join Blob

  manifest        VersionManifest @relation(fields: [manifestId], references: [id], onDelete: Cascade)

  @@unique([manifestId, logicalPath]) // 版本内路径唯一
  @@index([manifestId])
  @@map("manifest_entries")
}
```

**设计决策**：
1. **ManifestEntry 存 blobSha256 冗余**：重建时免 join Blob 表，直接读对象存储 + 校验
2. **coreJson 快照**：版本 SDF core 固化（不存 patch 链，重建高效；patch 链在 ChangeSet 保留审计/差异）
3. **versionNo 递增**：外部可读版本号（§2.2 原则 5「外部使用永久可读编号」）
4. **不可变**：version 行不更新（除 status 由 draft→published，P1B-7）

---

## 4. packages/versioning 设计

### 4.1 JSON Patch 纯函数（fast-json-patch@3.1.1，CJS）

```ts
// packages/versioning/src/patch.ts
import { applyPatch, compare } from 'fast-json-patch';

/** 对 SDF core 应用 RFC 6902 patch（§7.2.5），返回新对象。 */
export function applySdfPatch(core: Record<string, unknown>, patch: Operation[]): Record<string, unknown>;

/** 对比两个 SDF core，生成 RFC 6902 patch（用于 commit 前计算 diff）。 */
export function diffSdfCore(before: Record<string, unknown>, after: Record<string, unknown>): Operation[];

/** 校验 patch 合法（op 类型 + path 格式）。 */
export function validatePatch(patch: unknown): boolean;
```

**依赖**：`fast-json-patch@^3.1.1`（CJS，无需 dynamic import）

### 4.2 Manifest 重建

```ts
// packages/versioning/src/manifest.ts
export interface VersionSnapshot {
  core: Record<string, unknown>;
  artifacts: Array<{ logicalPath: string; blobSha256: string }>;
}

/** 从 Version + ChangeSet 链重建完整版本快照（§7.1 任意版本可完整重建）。 */
export async function rebuildVersion(
  storage: StorageAdapter,
  baseCore: Record<string, unknown>, // 初始 core（RO 创建时）
  corePatches: Operation[][], // 沿 commit 链的 sdf_core patch 序列
  manifestEntries: ManifestEntryInput[], // 版本最终 artifact 引用
): Promise<VersionSnapshot>;
```

**重建流程**：
1. 从初始 core 沿 commit 链逐条 apply SDF patch → 最终 core
2. Manifest entries 直接给出 artifact → blobSha256 引用
3. 读每个 blob + 校验 sha256 → 完整快照

---

## 5. domain 设计

### 5.1 createCommit（核心流程）

```ts
// packages/domain/src/commit/commits.ts
export interface CreateCommitInput {
  researchObjectId: string;
  userId: string;
  message: string;
  /** 变更描述（比对新旧状态） */
  changes: {
    sdfCore?: Record<string, unknown>; // 目标 SDF core（完整，diff 自动计算）
    artifacts?: ArtifactChangeInput[]; // artifact 增删改
  };
  version?: number; // 乐观锁：当前 RO.version
  idempotencyKey?: string; // §16
}

export interface CreateCommitResult {
  commitId: string;
  versionId: string;
  versionNo: number;
  /** 重建后的完整快照（含 core + artifact 引用） */
  snapshot: VersionSnapshot;
}
```

**createCommit 流程**：
1. 乐观锁校验：`RO.version == input.version`（§16，防并发覆盖）
2. 公开不可变校验：RO.status = published → 拒绝创建 commit（§2.2.3）——实际是检查最新版本 status
3. 找 RO 默认主线 branch（无则创建 main）
4. 计算 SDF diff：`diffSdfCore(当前core, input.sdfCore)` → ChangeSet(kind=sdf_core)
5. artifact 变化 → ChangeSet(kind=artifact_add/update/remove)
6. 事务建 Commit + ChangeSets + Version(versionNo = RO.version) + VersionManifest + ManifestEntries
7. 更新 RO.version = RO.version + 1
8. 审计 `commit.create`
9. 返回 commitId + versionId + snapshot

### 5.2 getVersion / rebuildVersion

```ts
export async function getVersion(deps, { userId, versionId }): Promise<VersionDetail>;
export async function rebuildVersion(
  deps, { userId, versionId },
): Promise<VersionSnapshot>; // 读 Manifest + 校验 blob sha256
```

**rebuildVersion**：读 VersionManifest + entries → 从初始 core apply patch 链 → 读 blob 校验 → 快照

---

## 6. API 设计

### 6.1 POST /research-objects/:id/commits

**请求**：

```json
{
  "message": "更新问题定义",
  "version": 1,
  "changes": {
    "sdfCore": { "schemaVersion": "0.1.0", "problem": "新版问题", "..." },
    "artifacts": [ { "op": "add", "logicalPath": "figures/fig1.png" } ]
  }
}
```

**头**：`Idempotency-Key: <uuid>`（§16）

**响应 201**：

```json
{
  "commitId": "uuid",
  "versionId": "uuid",
  "versionNo": 2,
  "snapshot": { "core": {...}, "artifacts": [{"logicalPath": "...", "blobSha256": "..."}] }
}
```

**错误**：
- 409 `CONCURRENT_UPDATE`：version 不匹配（乐观锁）
- 409 `VERSION_PUBLISHED`：公开版本不可修改（§2.2.3）
- 400 `VALIDATION_ERROR`：message 空 / sdfCore 非法
- 409 `DUPLICATE_IDEMPOTENCY_KEY`：幂等键重复

### 6.2 GET /versions/:id

**响应 200**：版本详情（versionNo + snapshot）

### 6.3 GET /versions/:id/rebuild

**响应 200**：重建快照 + 每个 blob 的 sha256 校验结果

---

## 7. 测试策略

### 7.1 单元测试

**packages/versioning**：
- `applySdfPatch`：RFC 6902 replace 应用、逆推一致
- `diffSdfCore`：同对象空 patch、单字段变化 patch 正确
- `validatePatch`：非法 op / path 拒绝
- Manifest 重建：core patch 链正确

**packages/domain commit**：
- `createCommit`：乐观锁冲突 409、公开不可变 409、幂等键重放、审计
- `getVersion` / `rebuildVersion`：blob sha256 校验失败

### 7.2 集成测试

1. **创建 Commit→生成 Manifest→重建校验**：
   - 建 RO → POST commit（改 SDF core）→ GET version → rebuild → sha256 匹配
2. **未变化 Artifact 复用 Blob**：两次 commit 相同 artifact，Manifest 引用同 blobSha256
3. **乐观锁**：过期 version → 409
4. **公开不可变**：published 版本 → 409
5. **幂等键**：同 key 重发 → 409 不重复

---

## 8. 迁移 9

**up.sql**：branches/commits/changesets/versions/version_manifests/manifest_entries 六表 + FK + 索引
**rollback.sql**：逆序 DROP

---

## 9. Open Questions（Design Gate 确认）

### 9.1 SDF core patch 存储粒度
- **决策（2026-08-04）**：方案 A — ChangeSet 存**单 op**（`{op:'replace', path:'/problem', value:'...'}`），apply 链重建。

### 9.2 初始 core 来源
- **决策（2026-08-04）**：方案 A — RO 创建时 SdfDocument.coreJson 作基准，commit 链逐条 apply。

### 9.3 Version 状态机（P1B-4 简化）
- **决策（2026-08-04）**：方案 A — Version.status 默认 draft，仅 draft→published（P1B-7 发布实装）。

### 9.4 分支扩展字段
- **决策（2026-08-04）**：方案 A — Branch 表就建，default main，Phase 1C 扩展。

### 9.5 artifact 变更如何表达
- **决策（2026-08-04）**：方案 A — commit 时传完整 artifact 集合，diff 自动计算增删改。

---

## 10. 债务登记

- **Version 发布状态机**（P1B-7）：仅 draft，published/revised 后置
- **逻辑检查点**（P1B-6）：§7.2.7 预留
- **完整分支模型**（Phase 1C）：Merge/Fork/PR
- **SDF 结构化 diff 展示**（P1B-8）：§7.3
- **Version Manifest 的 AI 摘要**（后续）：§7.3 自然语言变更摘要

---

## 11. 验收条件

- [ ] 迁移 9 applied + rollback 验证
- [ ] versioning 包单测全绿（JSON Patch apply/compare/validate + Manifest 重建）
- [ ] domain commit 单测全绿（乐观锁/不可变/幂等/审计）
- [ ] API 集成测试全绿（Commit→Manifest→重建校验哈希、复用 Blob、乐观锁、不可变、幂等）
- [ ] 本地门禁全绿（build/typecheck/lint/audit）
- [ ] 云上集成测试全绿（新增 P1B-4 + 既有回归）
- [ ] task-master 3.4 done
- [ ] 文档同步（progress/project_index/handoff）
