# P1C-5 Fork 与来源关系及许可继承校验 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.5（从特定公开版本 Fork 独立衍生 RO）
- 依据：Spec §8.1、§4.2、§6.3、§7.1、§15 ForkRelation、§16 /forks
- 现状：ForkRelation 实体迁移 12 已建（唯一 + Restrict 无删除路径）；assignPublicId P1B-6；validateLicenseInheritance P1C-4

---

## 需求基线

1. Fork 产生新的 RO 和 unique ID（§8.1）
2. 永久保留来源对象、来源版本和内容哈希（ForkRelation）
3. 原作者不会自动成为新成果作者（§8.1）
4. 来源许可、引用与归属要求继续生效（§8.1）
5. Fork 作者不能移除来源关系（数据层无外键删除路径，迁移 12 已 Restrict）
6. 仅允许 Fork public 版本（可见性规则 §4.2）
7. Fork 时复制该版本 Manifest 指向的 Blob 引用（内容寻址复用 P1B，不复制物理数据）
8. 调用 P1C-4 继承校验函数验证来源许可（§6.3）：不满足 → 阻断 Fork 或按来源限制目标许可

## 现状约束

- ForkRelation：`@@unique([forkedRoId])`（一 RO 至多一个来源）+ 三 FK 全 Restrict（来源不可移除）
- ManifestEntry：`{logicalPath, artifactId, blobSha256}`——blobSha256 内容寻址，物理 Blob 在 MinIO 共享
- Artifact 属 workspace：P1B createCommit 校验 artifact.workspaceId === ro.workspaceId → fork 复刻必须在新 workspace 重建 artifact 行
- assignPublicId：需 prefix 参数（PUBLIC_ID_PREFIX env）
- Version 状态机：draft/published 等（P1B-7），发布推进在 P1D-8

## 架构决策（拟）

### Fork 事务（Q2 复刻 Blob 引用）

单事务完成，不调 createCommit（避免嵌套事务 + artifact workspace 校验）：

1. 校验：源 RO `visibility=public` + sourceVersion 属于源 RO + 有 manifest entries
2. 新 RO：workspaceId = fork 者目标 workspace，sdf core = 源 manifest.coreJson（§7.2.3 快照）
3. 复制 artifact 行：源 manifest entries 逐个查源 artifact（mimeType/size）→ 新 workspace 建同 blobSha256 的 artifact 行（**物理 Blob 不复制，MinIO 内容寻址天然共享**）
4. 建 main branch + initial commit（parentCommitId=null）+ version(versionNo=1, draft) + manifest entries
5. ForkRelation：`{forkedRoId: 新RO, sourceRoId, sourceVersionId, sourceContentHash: computeContentSha256(entries)}`（§6.2 哈希）
6. 许可：默认复制源有效许可 → 新 RO RO 级；调用方传 licenses → `validateLicenseInheritance(source, target)` 拒绝则阻断
7. publicId 分配（assignPublicId，§8.1 unique ID）
8. 审计：fork.create + research_object.create

### 来源不可移除（§8.1）

- 数据层：ForkRelation.forkedRoId 唯一 + 三 FK Restrict（迁移 12 已建，P1C-1 测试已证）
- 业务层：无删除/更新 ForkRelation 的 domain 函数（Q 决策：不暴露）

### 许可继承校验（Q3）

- `forkResearchObject` 接受可选 `licenses`（目标许可覆盖）
- 默认：目标 = 源有效许可（复制，必然通过）
- 显式传：`validateLicenseInheritance(source, target)`；violations → 阻断（INHERITANCE_VIOLATION 409）
- 源有效许可 = `getEffectiveLicenses(sourceRoId)`（P1C-4，版本级优先回退 RO 级）

### API 形态

- `POST /research-objects/:id/forks`：body `{workspaceId, title?, licenses?}` → 新 RO
  - 语义：POST 到源 RO 路径，fork 到目标 workspace
- `GET /research-objects/:id/forks`：来源关系详情（sourceRoId/sourceVersionId/contentHash）+ fork 出的 RO 列表（P1C-9 通知/公开页用）——本期实现 GET 来源详情即可
- 幂等：`@@unique([forkedRoId])`——同源同目标重复 fork → 唯一约束冲突（409）。加 Idempotency-Key？fork 是创建操作，幂等键重放返回既有 fork。MVP：靠唯一约束拒绝重复（源 RO 已被 fork 到该 workspace 时），不额外幂等键。

### 可见性（Q5）

- 仅 `public` 源 RO 可 fork（§4.2 + task）；private/invite_only → 404（不泄露）
- 新 RO：private（fork 者 workspace 私有起步，作者后续提升，§4.2 扩大需审批）

### 版本要求（Q1）

- 源版本无需 published（发布状态机 P1D-8）；RO public + 版本存在 + manifest 有 entries 即可
- sourceContentHash 记录源版本内容哈希（§6.2 computeContentSha256）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 源版本状态要求？ | RO public + 版本存在即可（无需 published；发布状态机 P1D-8） | 必须 published（验收步骤 9 已发布后 fork——太严，fork 早于发布场景被堵） |
| Q2 | fork 是否立即复刻 Blob 引用？ | 是：单事务重建 artifact 行（同 blobSha256，物理共享）+ initial commit + manifest（task 7 明确要求） | 仅骨架 + ForkRelation（"Blob 引用共享"验收不过） |
| Q3 | 许可继承 enforce？ | 默认复制源；显式覆盖须过 validateLicenseInheritance，不满足 → 409 阻断 | 强制 = 源许可（fork 不可调整，过严） |
| Q4 | 来源关系管理 API？ | 只读 GET 来源详情；无 delete/update 端点（§8.1 不可移除 + 数据层 Restrict） | 提供 delete（违反 §8.1） |
| Q5 | 新 RO 可见性？ | private 起步（forker workspace）；扩大走 P1B-7 审批 | 继承源 public（fork 即公开，越权风险） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - 来源不可移除：无 forkRelation 删除 domain 函数（编译期保证）+ 数据层 Restrict 已测（P1C-1）
  - 许可继承：默认复制通过；显式覆盖合法通过；放宽（CC-BY-NC→CC-BY）→ 阻断
  - 仅 public 源：private/invite_only → 404
  - 源版本无 manifest → 拒绝
  - fork 幂等：重复 fork 同源同 workspace → 唯一冲突
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - Fork 全流程：建 public RO + commit → 另一用户 fork → 新 RO 有 publicId + ForkRelation + 许可复制 + initial commit manifest entries 同源 blobSha256
  - Blob 引用共享：源 version manifest entries 与新 fork manifest entries blobSha256 一致（MinIO 物理共享）
  - 许可继承阻断：fork 时显式放宽许可 → 409
  - 非 public 源 fork → 404
- 既有 71/71 不回退

---

## 涉及模块

- `packages/domain/src/fork/forks.ts`（新）+ `errors.ts`（新）
- `apps/api/src/routes/forks.ts`（新）+ `app.ts` 注册
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- `apps/api/test/helpers/fakes.ts`（forkRelation/identifier/manifest 假实现）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档（TDD 步骤 + 复刻流程 + 继承校验说明）
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 4.5 done + 文档同步
