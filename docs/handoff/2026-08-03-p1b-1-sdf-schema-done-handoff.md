# Handoff — 2026-08-03 P1B-1 SDF Schema 包完成，Phase 1B 开始

- Current goal: Phase 1B SDF 与版本。P1B-1 已闭环（core/manifest JSON Schema + ajv 校验，本地门禁全绿），下一任务 P1B-2 数据模型（task-master 3.2）。
- Done:
  - design gate 两决策 + 实证测试：手写 JSON Schema draft-07 + ajv（§5.3 规范要求 JSON Schema 文件，非 zod）；**additionalProperties 宽容**（技术债务，实证三场景权衡）
  - `core.ts`：六必填字段 Schema（§5.1）+ SDF_CORE_FIELDS 常量 + SdfCore 类型；schemaVersion const 0.1.0
  - `manifest.ts`：§5.3 全字段 + objectId/versionId OSR pattern + visibility 三态 + licenses 三类 + SdfManifest 类型
  - `validate.ts`：ajv draft-07 + ajv-formats，模块级编译缓存，validateSdfCore/validateManifest 结构化错误
  - 测试 14（core 6 + manifest 8）；build/typecheck/lint/audit/docs 全绿
  - task-master 3.1 done + details
- Constraints: 同前。新增：**SDF Schema additionalProperties 宽容 = 技术债务**（0.2.0 可选字段定型时收紧 additionalProperties:false 并升级 schemaVersion）；**ajv 默认不开 format 需 ajv-formats**；**as const Schema 不能 cast JSONSchemaType**（ajv.compile 直接传）。
- Open risks / parked: SDF Schema 债务（0.2.0 收紧）、P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障。
- Next action: P1B-2 数据模型（task-master 3.2）：ResearchObject/SDFDocument/SDFNode 实体 + 迁移（RO 状态机枚举、归属 Workspace、幂等键 + 乐观锁）、/research-objects + /sdf API 骨架（步骤 2）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-1）→ `project_index.md` → task-master 任务 3.2 → `docs/specs|plans/2026-08-03-p1b-1-*`
