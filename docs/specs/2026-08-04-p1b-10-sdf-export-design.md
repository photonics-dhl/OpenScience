# P1B-10 SDF 标准导出包生成与校验 Design

> Phase 1B SDF 与版本 — P1B-10  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §2.2.1、§5.2、§5.3  
> 对应 task-master: 3.10（SDF 标准导出包生成与校验）

---

## 1. 目标与范围

### 1.1 目标
生成可下载的标准 SDF 导出包（§5.2 目录树 + §5.3 manifest.json），导出包不依赖平台私有数据库即可读取（§5.3 MUST），内容从 Blob/Manifest 重建并验证与线上一致。

### 1.2 范围

**In Scope（P1B-10）**：
- `packages/domain`：`buildExportPackage`（重建 §5.2 目录树 + §5.3 manifest）+ `validateExportPackage`（脱库校验）
- API：`GET /versions/:id/export`（下载 zip）
- 测试：单测（manifest 序列化字段完整性）+ 集成（生成→脱库纯文件校验 Schema + 哈希一致）

**Out of Scope（Phase 1C+）**：
- 许可选择交互（licenses/authors 字段预留，§5.3，Phase 1C 发布时填实）
- 实验协议（experiments/protocol.yaml 等——P1B-10 空目录占位）
- 讨论（discussions/——Phase 1D）
- manifest 的 relations/validation 详细内容（P1B-10 占位结构）

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §2.2.1 | SDF 同时具数据库表达和可导出标准文件包 | buildExportPackage 从 Manifest 重建 |
| §5.2 | 目录树：manifest/manuscript/sdf/experiments/code/figures/discussions/provenance/versions | 目录生成 |
| §5.3 | manifest.json 最小结构（contentHash = P1B-6 哈希） | manifest 序列化（P1B-1 validateManifest 校验） |
| §5.3 MUST | 不依赖平台私有 DB 即可读取 | 纯文件结构（JSON/YAML/MD） |
| — | 导出与线上一致 | validateExportPackage 脱库校验 |

---

## 3. 导出结构

```text
open-science-object/
├── manifest.json          # §5.3（P1B-1 manifestSchema）
├── manuscript/
│   ├── paper.md           # 六字段 Markdown 汇编（§5.1）
│   ├── abstract.md        # insight 摘要
│   └── references.json    # 空数组占位（Phase 1C）
├── sdf/
│   ├── core.json          # 六字段 core（§5.1）
│   ├── relations.json     # {} 占位（Phase 1D）
│   └── validation.json    # { valid: true, checkedAt }（P1B-1 validateSdfCore）
├── experiments/           # 空（P1B-10 占位）
├── code/                  # 空（P1B-10 占位，附件按类型归位 Phase 1D）
├── figures/               # 附件中图片（logicalPath 含 .png/.jpg 等）
├── discussions/           # 空（Phase 1D）
├── provenance/
│   ├── contributors.json  # 空数组占位（Phase 1C）
│   ├── licenses.json      # {} 占位（Phase 1C 许可选择）
│   └── audit.json         # 版本审计行（§17）
└── versions/
    └── index.json         # 版本列表（P1B-4）
```

**附件归位**：Manifest entries 按 logicalPath 扩展名分到 figures/（图片）或 code/（代码），其余放根级 artifacts/。**决策 Q2**。

---

## 4. domain 设计

### 4.1 buildExportPackage

```ts
// packages/domain/src/export/packager.ts
export interface ExportFile {
  path: string; // 相对包根
  content: Buffer | string;
}

export async function buildExportPackage(
  deps: ArtifactDeps,
  input: { userId: string; versionId: string },
): Promise<ExportFile[]> {
  // 1. 可见性判定（§4.2 requireRoAccess）
  // 2. 读 Version + Manifest + entries + Publication
  // 3. 重建 §5.2 目录树（目录文件生成）
  // 4. manifest.json（§5.3，contentHash = computeContentSha256）
  // 5. 附件读 Blob（storage.getBlob）→ figures/code 归位
  // 6. 返回文件清单
}
```

### 4.2 validateExportPackage

```ts
// packages/domain/src/export/validate.ts
export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateExportPackage(files: ExportFile[]): Promise<ExportValidationResult> {
  // 1. manifest.json 存在 + validateManifest（P1B-1 ajv）
  // 2. sdf/core.json 存在 + validateSdfCore
  // 3. contentHash 重算 == manifest.contentHash
  // 4. 版本文件存在
}
```

**脱库校验**：纯文件输入（不含 deps）——满足"不依赖平台私有 DB 即可读取"。

---

## 5. API

### 5.1 GET /versions/:id/export

**响应**：application/zip（流式）

**依赖**：zip 打包——`archiver` npm 库（Node 标准，流式）。

**错误**：
- 404：版本不存在/越权
- 403：非成员/非 public

---

## 6. 测试策略

### 6.1 单元测试（manifest 序列化字段完整性）
- buildExportPackage 生成文件清单（含 §5.2 全部目录）
- manifest.json 字段完整（§5.3 required：objectId/versionId/contentHash/licenses/artifacts...）

### 6.2 集成测试（生成→脱库校验）
1. 建 RO → commit v1（改 SDF + 附件）→ export → **脱离数据库**用纯文件校验：
   - validateManifest（P1B-1 ajv）通过
   - validateSdfCore（P1B-1）通过
   - contentHash 与线上 computeContentSha256 一致
   - 附件内容与 Blob 一致（sha256 匹配）

---

## 7. Open Questions（Design Gate 确认）

### 7.1 下载格式
- **决策（2026-08-04）**：方案 A — zip（archiver 库，浏览器直接下载）。

### 7.2 附件归位策略
- **决策（2026-08-04）**：方案 A — 按扩展名分类（图片 → figures/、代码 → code/、其余 → artifacts/）。

### 7.3 zip 依赖
- **决策（2026-08-04）**：方案 A — archiver（流式，Node 标准）。

### 7.4 导出鉴权
- **决策（2026-08-04）**：方案 A — 成员可导出（同 getVersion）；public 版本公开可导出。

### 7.5 paper.md 汇编
- **决策（2026-08-04）**：方案 A — 六字段 Markdown 汇编（标题 + 各字段章节）。

---

## 8. 债务登记

- **experiments/code/discussions 占位空目录**（Phase 1D 按附件类型填充）
- **references/contributors/licenses 空占位**（Phase 1C 填实）
- **relations/validation 内容**（Phase 1D）
- **licenses/authors 字段**（Phase 1C 许可选择交互）

---

## 9. 验收条件

- [ ] domain export 单测全绿（目录树 + manifest 字段完整）
- [ ] API 集成测试（生成→脱库校验 Schema + 哈希一致）
- [ ] 本地门禁全绿
- [ ] 云上集成测试全绿
- [ ] task-master 3.10 done
- [ ] 文档同步
