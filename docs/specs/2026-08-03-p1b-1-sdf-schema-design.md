# P1B-1 SDF 六字段与 manifest JSON Schema 包 — Design Spec

- 日期：2026-08-03
- 关联：task-master 3.1；Spec（Baseline v1.0）§5.1（六必填字段）、§5.2（推荐导出结构）、§5.3（manifest 最小结构 + JSON Schema MUST）、§21.1（单元/合同测试层）
- 状态：design gate 逐节已确认（2026-08-03）；下步 writing-plans
- 依赖：Phase 1A（monorepo 底座）

## 0. 范围

在 `packages/sdf-schema` 定义 SDF 六必填字段 + manifest.json 最小结构的 JSON Schema，供前后端共用合同校验（§5.3 MUST）。

- **`core.json` Schema**：六必填字段（problem/insight/method/results/limitations/reproducibility）+ 可选字段
- **`manifest.json` Schema**：§5.3 最小结构（schema/schemaVersion/objectId/versionId/version/title/visibility/publishedAt/contentHash/authors/licenses/artifacts/parentVersion/forkedFrom）
- **校验函数**：`validateSdfCore` / `validateManifest`（ajv，返回结构化错误）
- **TS 类型**：从 Schema 派生（手工维护对齐）

不做：relations.json/validation.json（§5.2 其他 sdf 子文件，后续 P1B）；数据落地/迁移；AI 提取（1D）；前后端实际接入（本任务只产出合同，web/api 后续 Phase 消费）。

## 1. 总体架构

`packages/sdf-schema`（P1A-1 占位已存在）实装：
- `src/core.ts`：六字段 core JSON Schema + 常量 + 类型
- `src/manifest.ts`：manifest JSON Schema + 类型
- `src/validate.ts`：ajv 校验函数（合同测试 + 未来 API/编辑器消费）
- `src/index.ts`：导出

**决策（已确认）**：手写 JSON Schema draft-07（规范要求 JSON Schema 文件，§5.2 目录树 core.json 即数据文件）；加 **ajv** 正式依赖做运行时校验（合同测试 + 未来消费方复用）。

## 2. core Schema（§5.1 六必填字段）

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OpenScience SDF Core",
  "type": "object",
  "required": [
    "schemaVersion", "problem", "insight", "method",
    "results", "limitations", "reproducibility"
  ],
  "properties": {
    "schemaVersion": { "const": "0.1.0" },
    "problem":          { "type": "string", "minLength": 1 },
    "insight":          { "type": "string", "minLength": 1 },
    "method":           { "type": "string", "minLength": 1 },
    "results":          { "type": "string", "minLength": 1 },
    "limitations":      { "type": "string", "minLength": 1 },
    "reproducibility":  { "type": "string", "minLength": 1 }
  },
  "additionalProperties": false
}
```

- 六字段均为**自由文本字符串**（§5.1 各一段描述）
- `schemaVersion: const 0.1.0`（§5.3 初始 0.1.0）
- **`additionalProperties` 宽容**（不设 false，默认允许额外键）——**技术债务，实证权衡**：
  - 严格 false 会误伤合法数据（编辑器自动保存带 draft_meta、可选字段定型前的临时键，实证场景 D）
  - 预置空壳可选字段会放行结构未定型的数据（AI 提取填 `experiments:{protocol:x}` 被放行但下游读 undefined，实证场景 A）
  - 0.1.0 期间结构未定型，选宽容；**债务：可选字段定型时（如 0.2.0）收紧 additionalProperties:false 并升级 schemaVersion**（§5.3 语义化版本）
- 可选字段（§5.1：实验/数据集/图表/应用场景/相关工作/争议/失败实验/作者贡献/伦理声明）：**0.1.0 不预置**（避免空壳属性），靠宽容额外键兼容；定型时按实际需求升级版本加字段

> 注：§5.1 可选字段在 schemaVersion 升级时加（如 0.2.0），0.1.0 保持最小。

## 3. manifest Schema（§5.3 最小结构）

对齐 §5.3 示例字段：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OpenScience SDF Manifest",
  "type": "object",
  "required": [
    "schema", "schemaVersion", "objectId", "versionId", "version",
    "title", "visibility", "contentHash", "authors", "licenses",
    "artifacts", "parentVersion", "forkedFrom"
  ],
  "properties": {
    "schema": { "const": "openscience-sdf" },
    "schemaVersion": { "const": "0.1.0" },
    "objectId": { "type": "string", "pattern": "^OSR-\\d{4}-\\d{6}$" },
    "versionId": { "type": "string", "pattern": "^OSR-\\d{4}-\\d{6}-v\\d+$" },
    "version": { "type": "integer", "minimum": 1 },
    "title": { "type": "string", "minLength": 1 },
    "visibility": { "enum": ["private", "invite_only", "public"] },
    "publishedAt": { "type": "string", "format": "date-time" },
    "contentHash": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "authors": { "type": "array", "items": { "type": "string" } },
    "licenses": {
      "type": "object",
      "required": ["text", "code", "data"],
      "properties": {
        "text": { "type": "string" },
        "code": { "type": "string" },
        "data": { "type": "string" }
      }
    },
    "artifacts": { "type": "array" },
    "parentVersion": { "type": ["string", "null"] },
    "forkedFrom": { "type": ["string", "null"] }
  },
  "additionalProperties": false
}
```

- `publishedAt` 非 required（§5.3 示例有但 draft 态无发布；用 `dependencies` 或 optional）——**决策：optional**（draft RO 无 publishedAt）
- `objectId/versionId` pattern 对齐 §6.1（OSR-YYYY-NNNNNN / -vN）
- `visibility` 三态枚举（§4.2）
- `licenses` 三类（text/code/data，§6.3）
- `artifacts` 本任务 array（P1B-3 Blob 落地填实）
- **`additionalProperties` 宽容**（同 core，技术债务：P1B-4 manifest 定型时收紧）

## 4. 校验函数（ajv）

```ts
// src/validate.ts
export interface ValidationResult { ok: boolean; errors: Ajv.ErrorObject[] }
export function validateSdfCore(doc: unknown): ValidationResult
export function validateManifest(doc: unknown): ValidationResult
```

- ajv draft-07（`ajv` 包，default 即 draft-07）
- 缓存编译（模块级 compile，避免每次 request 重编译）
- 返回结构化错误（allErrors + 路径）

## 5. 测试（Spec §21.1）

- **单元**：合法六字段文档通过；缺任一必填字段拒绝；空字符串拒绝；**未知附加键容忍**（additionalProperties 宽容——债务基线，收紧时改测试）；manifest 合法/非法（缺 schema、visibility 非法枚举、hash pattern 错、objectId pattern 错）
- **合同**：core/manifest 导出同一 JSON Schema（前后端未来引用同一包，本任务验证导出完整性）

## 6. 边界（明确不做）

- 不做 relations.json/validation.json（§5.2 其他 sdf 子文件）
- 六字段不做结构化（保持自由文本，§5.1 语义）
- 可选字段不预置（schemaVersion 0.1.0 严格，升级版本再加）
- 不做数据落地/迁移
- web/api 实际接入（后续 Phase）
- 不引入 zod（合同语义是 JSON Schema）
