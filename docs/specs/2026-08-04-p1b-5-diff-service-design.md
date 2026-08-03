# P1B-5 多类型确定性 Diff 服务 Design

> Phase 1B SDF 与版本 — P1B-5  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §7.1、§7.2.6、§7.3、§4.3  
> 对应 task-master: 3.5（多类型确定性 Diff 服务）

---

## 1. 目标与范围

### 1.1 目标
实现 §7.3 全部九类确定性 diff 服务，输出结构化 Diff 结果，供编辑器版本导航与 Phase 1D 公开页 Versions & Diff 标签消费。

### 1.2 范围

**In Scope（P1B-5）**：
- `packages/diff`（新包）：九类确定性 diff 纯函数
  1. 文本 diff（行级）
  2. SDF 字段 diff（复用 P1B-4 RFC 6902 patch）
  3. 结论变化摘要（结构化提取，非 AI 摘要）
  4. 作者/贡献者变化
  5. 引用变化
  6. 文件增删与哈希变化（§7.2.6：大二进制仅元数据）
  7. 表格数据摘要变化
  8. 代码 diff（行级）
  9. 许可证和可见性变化
- `packages/domain`：`compareVersions` 领域逻辑（读两个 Version 的 Manifest + ChangeSet 链，产出 DiffResult）
- API：`GET /versions/:from/comparison?to=:to`（diff 端点）
- 测试：单测（九类各夹具）+ 集成（v1→v2 diff + 去重联合验证）

**Out of Scope（Phase 1D+）**：
- AI 自然语言变更摘要（§7.3 展示层，Phase 1D）
- 公开页 Versions & Diff 标签渲染（Phase 1D）
- diff 应用/合并（GitHub 式 diff view 编辑）

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §7.3 | 九类 diff | 九类纯函数 + 统一 DiffResult 结构 |
| §7.1 | 差异展示区分文字/结构化字段/代码/数据/图表/结论 | DiffType 枚举区分 |
| §7.2.6 | 大型二进制不生成行级 diff，只显示哈希/大小/元数据/替换关系 | `isLargeBinary` 判断 → 元数据 diff |
| §7.3 | AI 摘要仅展示层，底层确定性 diff 是事实来源 | 本任务只做确定性 diff，AI 摘要 Phase 1D |
| §4.3 | Versions & Diff 标签消费 | 输出结构化 DiffResult 供前端 |

---

## 3. DiffResult 结构

```ts
// packages/diff/src/types.ts
export type DiffType =
  | 'text'          // 文本行级
  | 'sdf_field'     // SDF 字段（RFC 6902）
  | 'conclusion'    // 结论变化摘要
  | 'authors'       // 作者/贡献者变化
  | 'citations'     // 引用变化
  | 'file'          // 文件增删与哈希
  | 'table'         // 表格数据摘要
  | 'code'          // 代码行级
  | 'license';      // 许可证与可见性

export interface DiffChange {
  type: DiffType;
  path: string;        // 定位（文件路径 / SDF 字段 / 代码段）
  kind: 'added' | 'removed' | 'modified' | 'metadata_only';
  before?: unknown;
  after?: unknown;
  /** 行级 diff 的行块（text/code） */
  hunks?: LineHunk[];
  /** SDF 字段 RFC 6902 op */
  patchOp?: Operation;
  /** 文件级：仅元数据（§7.2.6 大二进制） */
  metadata?: { size?: number; sha256?: string; mimeType?: string };
}

export interface LineHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{ prefix: ' ' | '+' | '-'; content: string }>;
}

export interface DiffResult {
  versionFrom: string;
  versionTo: string;
  changes: DiffChange[];
}
```

---

## 4. packages/diff 设计（纯函数）

### 4.1 文本 / 代码 diff（行级）

```ts
// packages/diff/src/text.ts
/** 行级 diff：LCS 或简单行对齐，返回 hunk 数组。 */
export function diffLines(before: string, after: string): LineHunk[];
```

**实现**：不引重型 diff 库，用**简单 LCS（动态规划）**——小文本够用；大文本 P1B-后续换 myers/diff 库。**决策 Q2**。

### 4.2 SDF 字段 diff（复用 P1B-4）

```ts
// packages/diff/src/sdf.ts
import { diffSdfCore } from '@openscience/versioning';
/** SDF core 差异 → sdf_field changes（RFC 6902 op 序列）。 */
export function diffSdfFields(before: Record<string, unknown>, after: Record<string, unknown>): DiffChange[];
```

### 4.3 结论变化摘要

```ts
// packages/diff/src/conclusion.ts
/** 结构化结论提取：SDF 六字段中 results/limitations 变化 → 摘要。 */
export function diffConclusion(before: Record<string, unknown>, after: Record<string, unknown>): DiffChange | null;
```

### 4.4 作者/贡献者变化

```ts
// packages/diff/src/authors.ts
/** 作者/贡献者名单 diff（增删改）。 */
export function diffAuthors(before: string[], after: string[]): DiffChange[];
```

### 4.5 引用变化

```ts
// packages/diff/src/citations.ts
/** 引用列表 diff。 */
export function diffCitations(before: string[], after: string[]): DiffChange[];
```

### 4.6 文件增删与哈希（§7.2.6）

```ts
// packages/diff/src/file.ts
/** 对比两个版本的文件清单（Manifest entries）→ 增删改 + 哈希变化。
 *  大二进制（> LARGE_BINARY_THRESHOLD 字节）→ 仅元数据（kind=metadata_only）。 */
export function diffFiles(
  before: ManifestEntryInput[],
  after: ManifestEntryInput[],
  beforeBlobs: Map<string, BlobInfo>, // 需读 Blob 大小
  afterBlobs: Map<string, BlobInfo>,
): DiffChange[];
```

**LARGE_BINARY_THRESHOLD**：`1 * 1024 * 1024`（1MB，可配置常量）。

### 4.7 表格数据摘要

```ts
// packages/diff/src/table.ts
/** CSV/TSV 表格摘要 diff：行数/列数变化 + 前 N 行变化。 */
export function diffTableSummary(before: string, after: string): DiffChange | null;
```

### 4.8 许可证与可见性变化

```ts
// packages/diff/src/license.ts
/** 许可证 + RO 可见性 diff。 */
export function diffLicenseVisibility(before: { license?: string; visibility?: string }, after: { license?: string; visibility?: string }): DiffChange[];
```

### 4.9 聚合入口

```ts
// packages/diff/src/index.ts
export function computeDiff(input: {
  beforeCore: Record<string, unknown>;
  afterCore: Record<string, unknown>;
  beforeFiles: ManifestEntryInput[];
  afterFiles: ManifestEntryInput[];
  beforeBlobSizes: Map<string, number>;
  afterBlobSizes: Map<string, number>;
  beforeMeta?: { license?: string; visibility?: string; authors?: string[]; citations?: string[]; table?: string };
  afterMeta?: { license?: string; visibility?: string; authors?: string[]; citations?: string[]; table?: string };
}): DiffResult;
```

**依赖**：`@openscience/versioning`（diffSdfCore，RFC 6902）

---

## 5. domain 设计

### 5.1 compareVersions

```ts
// packages/domain/src/diff/comparisons.ts
export async function compareVersions(
  deps: ArtifactDeps,
  input: { userId: string; fromVersionId: string; toVersionId: string },
): Promise<DiffResult> {
  // 1. 越权：两个版本都必须属于同一 RO，调用者是成员
  // 2. 读两个 Version 的 Manifest（core + entries）
  // 3. 读 Blob 大小（从 Blob 表，免读内容）
  // 4. computeDiff(...) → DiffResult
}
```

**性能**：只读 Manifest entries（含 blobSha256）+ Blob 表 size，**不读对象存储内容**（§7.2.6 元数据 diff 不需要内容）。

---

## 6. API 设计

### 6.1 GET /versions/:from/comparison?to=:to

**响应 200**：

```json
{
  "versionFrom": "uuid",
  "versionTo": "uuid",
  "changes": [
    { "type": "sdf_field", "path": "/problem", "kind": "modified", "before": "...", "after": "...", "patchOp": { "op": "replace", "path": "/problem", "value": "..." } },
    { "type": "file", "path": "fig.png", "kind": "metadata_only", "metadata": { "size": 1024, "sha256": "abc..." } }
  ]
}
```

**错误**：
- 404 `RESEARCH_OBJECT_NOT_FOUND`：版本不存在 / 跨 RO
- 403 `FORBIDDEN`：非成员

---

## 7. 测试策略

### 7.1 单元测试（九类）

| diff 类型 | 夹具 |
|---|---|
| text | 两段文本 → 行增删 |
| sdf_field | core 六字段变化 → RFC 6902 op |
| conclusion | results/limitations 变化 → 摘要 |
| authors | 作者名单增删 |
| citations | 引用增删 |
| file | 文件增删 + 哈希变化 + 大二进制仅元数据（§7.2.6） |
| table | CSV 行数变化 |
| code | 代码行级 |
| license | 许可证 + 可见性变化 |

### 7.2 集成测试

1. **v1→v2 全量 diff**：建 RO → commit v1（改 SDF + 加文件）→ commit v2（再改）→ compareVersions → 断言各 diff 类型正确
2. **大二进制仅元数据**：上传 > 1MB 文件 → diff → kind=metadata_only 无 hunks
3. **去重联合验证**：diff 不读内容（只 Manifest + Blob 表），未变 Blob 不重复存储

---

## 8. Open Questions（Design Gate 确认）

### 8.1 diff 库选型
- **决策（2026-08-04）**：方案 A — 不引库，自写简单 LCS 行 diff（小文本够用，P1B-后续大文本换库）。

### 8.2 大二进制阈值
- **决策（2026-08-04）**：方案 A — `1MB`（可配置常量 LARGE_BINARY_THRESHOLD）。

### 8.3 表格 diff 输入
- **决策（2026-08-04）**：方案 A — CSV/TSV 文本直接行级 diff + 摘要。

### 8.4 作者/引用数据源
- **决策（2026-08-04）**：方案 A — SDF 附加字段传入（Phase 1C 建表后接入）。

### 8.5 diff 端点鉴权
- **决策（2026-08-04）**：方案 A — 成员可看（同 getVersion）。

---

## 9. 债务登记

- **行 diff 用简单 LCS**（P1B-后续换 Myers/diff 库处理大文本）
- **作者/引用无数据表**：Phase 1C 建 Authorship/Citation 后接入
- **表格解析**：CSV 简单解析，复杂格式 P1B-后续
- **AI 摘要**：Phase 1D 展示层
- **公开页 Versions & Diff**：Phase 1D

---

## 10. 验收条件

- [ ] packages/diff 单测九类全绿
- [ ] domain compareVersions 单测（越权/跨 RO）
- [ ] API 集成测试（v1→v2 diff、大二进制元数据、去重）
- [ ] 本地门禁全绿
- [ ] 云上集成测试全绿
- [ ] task-master 3.5 done
- [ ] 文档同步
