# Handoff — 2026-08-04 P1B-3 Blob 内容寻址存储 + 上传管线完成

- Current goal: Phase 1B SDF 与版本。P1B-3 已闭环（迁移 8 + /artifacts API，云上集成 35/35），下一任务 P1B-4 版本引擎（task-master 3.4）。
- Done:
  - 五决策（design gate）：Blob 存储键分段 `blobs/<h2>/<h4>/<sha256>`、Artifact.logicalPath 非唯一（P1B-4 Manifest 去重）、MIME 失败允许上传（mimeType=null + 审计）、file-type ESM-only 用 dynamic import、配额只读不扣费（P1B-6 记账）
  - 迁移 8：blobs（sha256 主键 + storage_key + size）+ artifacts（logical_path/mime_type/size/blob_sha256/uploaded_by/workspace_id）+ rollback；Prisma Blob/Artifact + User/Workspace 关系
  - storage `blob.ts`：putBlob 去重（§7.1）/getBlob/headBlob/deleteBlob/getBlobStorageKey（分段键）；补 package.json main/types（P1A-2 漏，本任务首次暴露）
  - domain `artifact/`：errors（FILE_TOO_LARGE/MALICIOUS_FILE）、mime（file-type@22 dynamic import）、quota（复用 resolvePolicy，§13.3 只读不扣费）、scan（占位，P1B-8 实装）、artifacts（createArtifact 管线：成员→配额→扫描→MIME→putBlob→入库→审计）
  - api：/artifacts/upload POST（multipart）+ /artifacts/:id/download GET（stream）；error-map FILE_TOO_LARGE=413/MALICIOUS_FILE=451；app.ts storage 注入（缺省不注册，旧测试零影响）
  - config：api-env 加 storage（S3_* env）
  - 测试：storage 9 + domain 11 + api 集成 6 = 26 新增；本地门禁全绿；**云上集成 35/35**（新增 P1B-3 6 + 既有 29）；迁移 8 applied + rollback 演练
  - task-master 3.3 done + details
- Constraints: 同前。新增：**storage package.json 需 main/types**（P1A-2 从未被消费，P1B-3 首次暴露）；cloud-sync 需 `.cloud-sync-env`（从 .env 中文键生成，本机临时重建）。
- Open risks / parked: P1B-3 配额只读不扣费（P1B-6 接入 UsageLedger）；病毒扫描占位（P1B-8）；大文件分片（P1B-5）；幂等键（P1B-5）；Blob GC（P1B-9）；MIME 白名单（P1B-8）；限流测试跨运行残留 flaky 已修（security 集成测试前置清 rl key）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-4 版本引擎（task-master 3.4）：Version Manifest 引用 Artifact + RO.version 版本引擎推进（§16、§7.2.3），复用 RO.version 乐观锁字段。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-3）→ `project_index.md` → task-master 任务 3.4 → `docs/specs|plans/2026-08-04-p1b-3-*`
