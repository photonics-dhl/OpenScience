# P1B-6 标识层与时间戳服务 Design

> Phase 1B SDF 与版本 — P1B-6  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §6.1、§6.2、§2.2.5  
> 对应 task-master: 3.6（标识层与时间戳服务）

---

## 1. 目标与范围

### 1.1 目标
实现内部 UUID v7 主键、公开 RO ID（OSR-YYYY-NNNNNN）、版本 ID、稳定 URL 与 UTC 时间戳 + SHA-256 内容哈希，为发布提供不可抵赖的标识与时间证明。

### 1.2 范围

**In Scope（P1B-6）**：
- `packages/identity`（新包）：UUID v7 生成 + 公开 ID 生成/解析 + URL 路由
- 迁移 10：ResearchObject 加 `publicId`、Version 加 `publicVersionId`、Identifier/Publication 预留字段（法律声明）
- domain：发布 ID 服务（assignPublicId / generateVersionId）+ 时间戳记录（只追加审计）
- API：`GET /research/OSR-YYYY-NNNNNN` + `GET /research/OSR-YYYY-NNNNNN/v/N`（公开稳定 URL 解析）
- 测试：单测（ID 生成唯一性/版本号递增/URL 解析）+ 集成（发布记录只追加/ID 不复用）

**Out of Scope（Phase 1D+）**：
- 状态说明页 UI（撤回/删除/合并后 ID 指向）
- 法律免责声明展示（Phase 1D 公开页）
- DOI 注册（Phase 2）
- 发布动作本身（P1B-7 发布状态机）

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §6.1 | 内部主键 UUID v7 或 ULID | UUID v7（P1B-2 决策归 P1B-6），新迁移主键默认 |
| §6.1 | 公开 RO ID：`OSR-YYYY-NNNNNN` | identity 包生成，前缀配置化（§24 待确认，禁写死） |
| §6.1 | 版本 ID：`OSR-YYYY-NNNNNN-vN` | generateVersionId |
| §6.1 | URL：`/research/OSR-YYYY-NNNNNN/v/N` | 路由解析 |
| §6.1 | 公开 ID 永不复用 | 发布时分配，撤回/删除/合并不回收 |
| §6.2 | UTC 事务时间 + manifest + SHA-256 哈希 | 发布记录只追加审计 |
| §6.2 | 法律免责声明字段预留 | Identifier/Publication 预留字段 |

---

## 3. packages/identity 设计

### 3.1 UUID v7

```ts
// packages/identity/src/uuid7.ts
import { randomUUID } from 'node:crypto'; // Node 22 无原生 v7

/** UUID v7：48bit unix ms + 随机（RFC 9562）。 */
export function uuidv7(): string;
```

**实现**：手写（48bit 时间戳 + version/variant 位 + 随机）——Node 20 无内置 v7。

### 3.2 公开 ID

```ts
// packages/identity/src/public-id.ts
export const PUBLIC_ID_PREFIX = 'OSR'; // 配置项（§24 待确认），禁写死 → 从 config 读

/** 生成 OSR-YYYY-NNNNNN（年 + 6 位序列）。 */
export function generatePublicId(year: number, seq: number): string;
/** 解析 OSR-YYYY-NNNNNN → { year, seq }。 */
export function parsePublicId(id: string): { prefix: string; year: number; seq: number } | null;
/** 版本 ID：OSR-YYYY-NNNNNN-vN。 */
export function versionPublicId(roPublicId: string, versionNo: number): string;
/** URL 路由：/research/:roPublicId/v/:versionNo。 */
export function researchUrl(roPublicId: string, versionNo: number): string;
```

### 3.3 配置

`packages/config/src/api-env.ts` 加：

```ts
/** §6.1 公开 ID 前缀（§24 待确认项，配置而非常量）。 */
publicIdPrefix: string; // env: PUBLIC_ID_PREFIX，缺省 'OSR'
```

---

## 4. 数据模型（迁移 10）

```prisma
// ResearchObject 加
publicId String? @unique @map("public_id") // 公开 RO ID，发布时分配

// Version 加
publicVersionId String? @unique @map("public_version_id") // OSR-YYYY-NNNNNN-vN

// 新表：Identifier（§15 实体，预留法律声明字段）
model Identifier {
  id           String   @id @default(uuid()) @db.Uuid
  researchObjectId String @map("research_object_id") @db.Uuid
  publicId     String   @unique @map("public_id")
  issuedAt     DateTime @map("issued_at")
  legalDisclaimer String? @map("legal_disclaimer") // §6.2 免责声明文案预留

  researchObject ResearchObject @relation(...)

  @@map("identifiers")
}

// 新表：Publication（§15，发布记录只追加）
model Publication {
  id            String   @id @default(uuid()) @db.Uuid
  versionId     String   @map("version_id") @db.Uuid
  publicVersionId String  @unique @map("public_version_id")
  contentSha256 String   @map("content_sha256") // 版本内容哈希（§6.2）
  publishedAt   DateTime @map("published_at")
  legalDisclaimer String? @map("legal_disclaimer")

  version       Version  @relation(...)

  @@map("publications")
}
```

**设计决策**：
1. **publicId 发布时分配**（P1B-7 触发），P1B-6 建字段 + 生成函数
2. **Identifier/Publication 表**：§15 实体 + §6.2 免责声明字段预留
3. **contentSha256**：版本内容哈希（Manifest entries 的 sha256 聚合）

---

## 5. domain 设计

### 5.1 assignPublicId

```ts
// packages/domain/src/identity/identifiers.ts
export async function assignPublicId(
  deps, input: { userId: string; researchObjectId: string; versionNo: number },
): Promise<{ publicId: string; publicVersionId: string }> {
  // 1. 越权：成员
  // 2. 已有 publicId → 复用（ID 永不复用，§6.1）
  // 3. 无 → 生成 OSR-YYYY-NNNNNN（seq = RO 创建序号）+ 写 Identifier 行（只追加）
  // 4. versionNo → publicVersionId = OSR-YYYY-NNNNNN-vN
}
```

### 5.2 时间戳记录

```ts
// 发布时（P1B-7 调用）：
// 1. UTC 事务时间 = now()
// 2. contentSha256 = 聚合 Manifest entries blobSha256（sorted 后 hash）
// 3. Publication 行写入（只追加，§6.2）
// 4. 审计 publication.published
```

---

## 6. API 设计

### 6.1 GET /research/OSR-YYYY-NNNNNN

**响应**：RO 最新版本摘要（publicId + 标题 + 最新版本号 + 稳定 URL）

### 6.2 GET /research/OSR-YYYY-NNNNNN/v/N

**响应**：指定版本详情（publicId + publicVersionId + 版本内容 + UTC 时间戳 + SHA-256 哈希）

**解析**：identity.parsePublicId + Prisma 查 publicId → 重定向或直返。公开访问（RO.visibility = public）。

**错误**：
- 404：ID 不存在（或已撤回 → Phase 1D 状态说明页）

---

## 7. 测试策略

### 7.1 单元测试（identity 包）
- uuidv7：唯一性（100 个不重复）+ 格式（8-4-4-4-12）+ version 位
- generatePublicId / parsePublicId 往返
- versionPublicId / researchUrl 格式

### 7.2 集成测试
1. assignPublicId：两次调用同 RO → 同 publicId（ID 不复用，§6.1）
2. 版本 ID 递增：v1/v2 → -v1/-v2
3. URL 解析：/research/OSR-2026-000001 → RO；/v/2 → 版本
4. 时间戳：Publication 只追加（重复发布不覆盖）

---

## 8. Open Questions（Design Gate 确认）

### 8.1 UUID v7 实现
- **决策（2026-08-04）**：方案 A — 手写 UUID v7（Node 20 无内置，RFC 9562）。

### 8.2 publicId 分配时机
- **决策（2026-08-04）**：方案 A — 发布时分配（P1B-7 触发），draft 无。

### 8.3 公开 ID 序列来源
- **决策（2026-08-04）**：方案 A — RO 创建年 + 全局递增 DB 序列。

### 8.4 公开访问鉴权
- **决策（2026-08-04）**：方案 A — /research/* 仅 public RO 匿名可见；private 404。

### 8.5 contentSha256 聚合方式
- **决策（2026-08-04）**：方案 A — Manifest entries 按 logicalPath 排序后逐个 blobSha256 拼接再 SHA-256。

---

## 9. 债务登记

- **公开 ID 序列**：DB 序列需迁移建（RO 序号）
- **状态说明页**：Phase 1D
- **免责声明展示**：Phase 1D
- **DOI**：Phase 2
- **发布动作**：P1B-7

---

## 10. 验收条件

- [ ] identity 包单测全绿（uuidv7 唯一性/ID 生成解析/URL）
- [ ] 迁移 10 applied + rollback
- [ ] domain assignPublicId 单测（复用/递增/越权）
- [ ] API 集成测试（URL 解析/ID 不复用/时间戳只追加）
- [ ] 本地门禁全绿
- [ ] 云上集成测试全绿
- [ ] task-master 3.6 done
- [ ] 文档同步
