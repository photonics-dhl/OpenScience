# Handoff — 2026-08-03 P1B-2 RO/SDF 数据模型完成

- Current goal: Phase 1B SDF 与版本。P1B-2 已闭环（迁移 7 + API 骨架，云上集成 26/26），下一任务 P1B-3 Blob 存储（task-master 3.3）。
- Done:
  - 三决策（design gate）：UUID v4 沿用（v7 归 P1B-6）、SDFNode 固定六型枚举、visibility 本任务建（private 默认，P1B-7 只加强制）
  - 迁移 7：research_objects/sdf_documents/sdf_nodes + RoStatus 9 枚举/RoVisibility/SdfNodeType + rollback；Prisma 三 model + Workspace/User 关系
  - domain `research-object/`：types（RO_STATUSES/RO_VISIBILITIES/SDF_NODE_TYPES 常量）、errors（ResearchObjectError 含 CONCURRENT_UPDATE）、research-objects（create 同事务建 RO+SDFDocument+六 node+审计 / get / update 乐观锁 updateMany where version）、sdf（validateSdfCore 合同 + 乐观锁 + 审计 sdf.update）
  - api：`/research-objects` POST（幂等键预留）/GET/PATCH + `/sdf` GET/PUT；error-map ResearchObjectError（CONCURRENT_UPDATE→409）
  - RO.version = 乐观锁 = P1B-4 版本引擎版本号（复用同一字段）
  - 测试：domain 18 新增；本地门禁全绿；云上集成 26/26（新增 P1B-2 5 + 既有 21）
  - task-master 3.2 done + details
- Constraints: 同前。新增：**sdf-schema P1B-1 漏 main/types 已补**（本任务发现，P1B-1 commit 未含——本任务代码 commit 带上）；domain 测试子目录相对路径 ../../src。
- Open risks / parked: RO.version 与 P1B-4 版本引擎耦合（设计对齐，P1B-4 验证）；幂等键 POST 目前靠业务层（domain 无唯一约束，P1A-7 topup 模式可参考）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-3 Blob 内容寻址存储 + 上传管线（task-master 3.3）：SHA-256 键 Blob + Artifact 元数据（逻辑路径/MIME/大小/hash）+ 接入 StorageAdapter + 分片/校验/MIME 检测/病毒扫描（§7.2、§13.1、§17）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-2）→ `project_index.md` → task-master 任务 3.3 → `docs/specs|plans/2026-08-03-p1b-2-*`
