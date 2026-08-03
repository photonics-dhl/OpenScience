# P1B-6 标识层与时间戳服务 Plan

> Phase 1B SDF 与版本 — P1B-6  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-6-identity-service-design.md](../specs/2026-08-04-p1b-6-identity-service-design.md)  
> 对应 task-master: 3.6

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| UUID v7 | 手写（RFC 9562） |
| publicId 时机 | 发布时分配（P1B-7 触发），draft 无 |
| 公开 ID 序列 | RO 创建年 + 全局递增 DB 序列 |
| 公开鉴权 | /research/* 仅 public 匿名可见，private 404 |
| contentSha256 | Manifest entries 排序后拼接 blobSha256 再哈希 |

---

## 1. 任务拆解（TDD）

### Task 1：packages/identity 包
- `packages/identity/package.json`（main/types + build/typecheck/test）+ tsconfig + vitest 配置
- `src/uuid7.ts`：手写 UUID v7（48bit unix ms + RFC 9562 version/variant + 随机）
- `src/public-id.ts`：generatePublicId（OSR-YYYY-NNNNNN）/parsePublicId/versionPublicId/researchUrl
- `src/index.ts` 导出
- 单测：uuidv7 唯一性（100 不重复）+ 格式 + version 位；ID 生成/解析往返；URL 格式
- 门禁：identity 单测 6+ 全绿

### Task 2：迁移 10 + Prisma
- `infra/migrations/20260804020000_identity/migration.sql`：
  - ResearchObject 加 `public_id`（unique，可空）
  - Version 加 `public_version_id`（unique，可空）
  - 新表 `identifiers`（id/research_object_id/public_id unique/issued_at/legal_disclaimer）
  - 新表 `publications`（id/version_id/public_version_id unique/content_sha256/published_at/legal_disclaimer）
- `rollback.sql`：逆序 DROP + 移除列
- `infra/schema.prisma`：三处修改 + Identifier/Publication model
- Prisma generate
- 门禁：build/typecheck

### Task 3：config publicIdPrefix
- `packages/config/src/api-env.ts`：加 `publicIdPrefix`（env: PUBLIC_ID_PREFIX，缺省 'OSR'）
- build

### Task 4：domain assignPublicId + 时间戳
- `packages/domain/src/identity/identifiers.ts`：
  - `assignPublicId`（成员校验 + 已有复用 + 生成 OSR-YYYY-NNNNNN + Identifier 行）
  - `computeContentSha256`（Manifest entries 按 logicalPath 排序拼接 blobSha256 → SHA-256）
- `packages/domain/src/identity/errors.ts`：复用 CommitError（RESEARCH_OBJECT_NOT_FOUND/FORBIDDEN）
- domain 加 @openscience/identity 依赖
- 单测：`packages/domain/test/identity/identifiers.test.ts`（复用/递增/越权/contentSha256）
- 门禁：domain identity 单测 5+ 全绿

### Task 5：API /research/*
- `apps/api/src/routes/research.ts`：
  - `GET /research/:publicId`（匿名，public 可见；private 404）→ RO 最新版本
  - `GET /research/:publicId/v/:versionNo`（匿名，public 可见）→ 版本详情 + contentSha256
- `apps/api/src/app.ts`：注册（公开路由，不 requireCurrentUser）
- 门禁：build 全绿

### Task 6：API 集成测试
- `apps/api/test/research.integration.test.ts`：
  1. assignPublicId → publicId + publicVersionId 生成（发布时分配）
  2. 同 RO 两次 assign → 同 publicId（ID 不复用 §6.1）
  3. v1/v2 → -v1/-v2 版本 ID 递增
  4. /research/:publicId 匿名可读（public）；private → 404
  5. /research/:publicId/v/2 → 版本详情 + 时间戳
- 门禁：集成测试 5 全绿

### Task 7：本地门禁收口
- build/typecheck/lint/audit/knip/dep/docs 全绿
- 全仓 test 无回归

### Task 8：云上集成测试
- cloud-sync → install + 全量 build
- 云上 migrate deploy（迁移 10）
- test:integration 全绿（新增 P1B-6 + 既有 45 回归 = 50）

### Task 9：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 3.6 done + details

---

## 2. 验收清单

- [ ] identity 单测 6+
- [ ] 迁移 10 applied + rollback
- [ ] domain identity 单测 5+
- [ ] API 集成测试 5（ID 生成/不复用/版本递增/公开访问/时间戳）
- [ ] 本地门禁全绿
- [ ] 云上集成 50/50
- [ ] task-master 3.6 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **公开 ID 序列**：DB 序列需迁移建（RO 序号），PostgreSQL 序列
- **UUID v7 手写**：位运算正确性（单测覆盖）
- **/research/* 匿名路由**：与现有 requireCurrentUser 路由共存（公开路由无需鉴权）

### 3.2 依赖
- P1B-4：Version/Manifest（publicVersionId + contentSha256 来源）
- config：publicIdPrefix env

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1-3（identity 包 + 迁移 + config） | 2.5h |
| Task 4（domain identity） | 1.5h |
| Task 5-6（API + 集成测试） | 2h |
| Task 7-9（门禁 + 云上 + 文档） | 2h |
| **总计** | **8h** |
