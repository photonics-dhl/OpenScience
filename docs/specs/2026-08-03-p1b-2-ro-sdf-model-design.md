# P1B-2 RO/SDF 数据模型与迁移 — Design Spec

- 日期：2026-08-03
- 关联：task-master 3.2；Spec（Baseline v1.0）§4.1（RO 状态机）、§4.2（可见性）、§5.1（六字段）、§15（核心实体）、§16（API 幂等键/乐观锁）、§17（审计）
- 状态：design gate 逐节已确认（2026-08-03）；下步 writing-plans
- 依赖：P1B-1（SDF core Schema）、P1A-4（Workspace）、P1A-6（AuditSink）

## 0. 范围

建立 ResearchObject、SDFDocument、SDFNode 数据实体与数据库迁移，支持在个人 Workspace 创建私有 RO（§15、§4.1、§3.2，验收主流程步骤 2）。

- 三实体 + 迁移 7（可回滚）
- `/research-objects`、`/sdf` API 骨架（创建私有 RO、查询、乐观锁更新）
- 写操作幂等键 + 乐观锁（§16）+ 审计（§17）

不做：可见性强制检查（P1B-7）；Blob/Artifact（P1B-3）；Commit/版本（P1B-4）；RO 状态机流转逻辑（1C/1D）；AI 提取（1D）。

## 1. 数据模型（migration 7）

### 1.1 决策（已确认）

- **主键沿用 UUID v4**（`gen_random_uuid()`，对齐现有 6 表；v7/ULID 归 P1B-6 标识层评估）
- **SDFNode 固定六型**（枚举 problem/insight/method/results/limitations/reproducibility，对齐 §5.1 + P1B-1 SDF_CORE_FIELDS）
- **visibility 本任务建字段**（private 默认，P1B-7 只加强制检查）

### 1.2 实体

```sql
-- RO 状态机（§4.1 建议 + 补充状态）
CREATE TYPE "RoStatus" AS ENUM (
  'draft', 'under_review', 'approved', 'published', 'revised',
  'withdrawn', 'restricted', 'rejected', 'archived'
);
-- 可见性（§4.2）
CREATE TYPE "RoVisibility" AS ENUM ('private', 'invite_only', 'public');
-- SDFNode 类型（§5.1 六字段）
CREATE TYPE "SdfNodeType" AS ENUM (
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'
);

CREATE TABLE "research_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RoStatus" NOT NULL DEFAULT 'draft',
    "visibility" "RoVisibility" NOT NULL DEFAULT 'private',
    "version" INTEGER NOT NULL DEFAULT 1,       -- 乐观锁（P1B-4 版本引擎用）
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_objects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "research_objects_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "research_objects_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "research_objects_workspace_id_idx" ON "research_objects"("workspace_id");

CREATE TABLE "sdf_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "core_json" JSONB NOT NULL,                -- SdfCore 结构（P1B-1 validateSdfCore 校验）
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sdf_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sdf_documents_research_object_id_key" UNIQUE ("research_object_id"),
    CONSTRAINT "sdf_documents_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "sdf_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sdf_document_id" UUID NOT NULL,
    "node_type" "SdfNodeType" NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,   -- 显示顺序（六字段固定序，保留排序余地）
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sdf_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sdf_nodes_sdf_document_id_fkey"
      FOREIGN KEY ("sdf_document_id") REFERENCES "sdf_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sdf_nodes_doc_type_key" UNIQUE ("sdf_document_id", "node_type")
);
CREATE INDEX "sdf_nodes_sdf_document_id_idx" ON "sdf_nodes"("sdf_document_id");
```

### 1.3 设计要点

- **RO 1:1 SDFDocument**（UNIQUE research_object_id）——SDF 承载，core_json JSONB 存 P1B-1 SdfCore
- **SDFDocument 1:N SDFNode**（固定六型，UNIQUE doc+type 防重复）——字段级 diff/建议挂载（P1D）
- **RO.version 乐观锁**（§16）：PATCH 带 version 条件更新，冲突 409；P1B-4 版本引擎复用
- **status/visibility 枚举**：MVP 只落地 draft 及后续阶段所需状态（§4.1 全枚举建表，流转逻辑留 1C/1D）
- **created_by**：RO 创建者（非自动获得第一作者，作者组归 P1C-7）

## 2. API（骨架，§16）

| 端点 | 方法 | 权限 | 说明 |
|---|---|---|---|
| `/research-objects` | POST | 登录用户 | 创建私有 RO（title + 可选初始 SDF）；Idempotency-Key 防重 |
| `/research-objects/:id` | GET | workspace 成员 | 查 RO + SDF 详情 |
| `/research-objects/:id` | PATCH | workspace 成员 | 更新 title/status/visibility（乐观锁 version 条件） |
| `/sdf/:roId` | GET | workspace 成员 | 查 SDFDocument（core_json + nodes） |
| `/sdf/:roId` | PUT | workspace 成员 | 更新 SDF（乐观锁 + validateSdfCore 校验） |

- 权限：复用 P1A-4 `requireMembership` + P1A-5 RBAC（创建 = workspace 成员；跨 workspace 越权 404——P1B-7 完整强制）
- 幂等键：POST 用 Idempotency-Key 头 → 唯一约束防重（对齐 P1A-7 /admin/credits 模式）
- 审计：`research_object.create` / `research_object.update` / `sdf.update`（P1A-6 AuditSink 同事务）
- 乐观锁：PATCH/PUT 带 `version` 字段 → `updateMany where version` → count 0 = 409

## 3. domain 模块

`packages/domain/src/research-object/`（复用 WorkspaceDeps 模式 + validateSdfCore）：

- `research-objects.ts`：`createResearchObject(deps, {workspaceId, userId, title, sdf?}, ctx)`（同事务建 RO + SDFDocument + 六 SDFNode + 审计）、`getResearchObject`（requireMembership + 详情）、`updateResearchObject`（乐观锁）
- `sdf.ts`：`getSdfDocument`、`updateSdfDocument`（乐观锁 + validateSdfCore + 写 core_json/nodes）
- `types.ts`：RoStatus/RoVisibility/SdfNodeType 常量 + 类型

## 4. 测试（§21.1）

- **单元**：createResearchObject 建 RO+SDFDocument+六 node 原子；乐观锁冲突 409；validateSdfCore 拒绝非法 SDF；幂等键重放
- **集成**（云上）：迁移 7 up/down；创建 RO 落库 + 审计行；跨 workspace 越权 404
- **合同**：/sdf PUT 校验对齐 P1B-1 core Schema

## 5. 边界（明确不做）

- 可见性强制（P1B-7）
- Blob/Artifact/上传（P1B-3）
- Commit/版本引擎（P1B-4）
- RO 状态机流转（1C/1D）
- AI 提取（1D）
- 不建 Branch/Issue/PR 等协作表（P1C）
