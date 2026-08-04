# P1B-7 RO 可见性模型与 API 层权限强制 Plan

> Phase 1B SDF 与版本 — P1B-7  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-7-visibility-permissions-design.md](../specs/2026-08-04-p1b-7-visibility-permissions-design.md)  
> 对应 task-master: 3.7

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| invite_only 语义 | VisibilityGrant 表（指定账户） |
| 扩大可见性 | 立即阻断 + VisibilityRequest(pending) |
| public 索引 | 即可索引，不另设字段 |
| /research/* | public 匿名，invite_only/private 404 |
| 变更幂等 | 同 toVisibility 幂等 |

---

## 1. 任务拆解（TDD）

### Task 1：迁移 11 + Prisma
- `infra/migrations/20260804030000_visibility/migration.sql`：
  - `visibility_grants`（ro_id + grantee_id + granted_by + 唯一约束）
  - `visibility_requests`（ro_id + requested_by + from/to_visibility + status）
- `rollback.sql`
- `infra/schema.prisma`：VisibilityGrant/VisibilityRequest model + ResearchObject/User 关系
- Prisma generate
- 门禁：build/typecheck

### Task 2：domain 可见性
- `packages/domain/src/visibility/errors.ts`：`VisibilityError`（FORBIDDEN/VALIDATION_ERROR/REQUEST_PENDING）
- `packages/domain/src/visibility/access.ts`：`canAccessRo`（判定矩阵 §4.2）
- `packages/domain/src/visibility/requests.ts`：`requestVisibilityChange`（缩小直接应用/扩大阻断+请求）+ `grantVisibility`
- 单测：`packages/domain/test/visibility/`（矩阵全组合 + 扩大阻断 + 幂等 + 越权）
- 门禁：domain visibility 单测 8+ 全绿

### Task 3：API requireRoAccess
- `apps/api/src/routes/ro-access.ts`：`requireRoAccess`（读 RO + visibility + 成员/grant 判定）
- 挂接：research-objects GET/PATCH、sdf GET/PUT、commits POST、versions GET
- 门禁：build 全绿

### Task 4：集成测试
- `apps/api/test/visibility.integration.test.ts`：
  1. private RO：成员可见，非成员 404
  2. invite_only：grant 命中可见，未 grant 404
  3. public RO：匿名可见（/research/*）
  4. 扩大可见性：private→public → 阻断 + VisibilityRequest(pending)
  5. 缩小可见性：public→private → 直接应用
  6. 绕过前端直调 API 越权 → 404
- 门禁：集成测试 6 全绿

### Task 5：本地门禁收口
- build/typecheck/lint/audit/knip/dep/docs 全绿
- 全仓 test 无回归

### Task 6：云上集成测试
- cloud-sync → install + 全量 build
- 云上 migrate deploy（迁移 11）
- test:integration 全绿（新增 P1B-7 + 既有 50 回归 = 56）

### Task 7：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 3.7 done + details

---

## 2. 验收清单

- [ ] 迁移 11 applied + rollback
- [ ] domain 可见性矩阵单测 8+
- [ ] API 集成测试 6（private/invite_only/public/扩大阻断/缩小/绕过前端）
- [ ] 本地门禁全绿
- [ ] 云上集成 56/56
- [ ] task-master 3.7 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **requireRoAccess 挂接影响既有路由**：现有测试可能依赖非成员可见性（验证回归）
- **invite_only grant 判定**：需 join VisibilityGrant

### 3.2 依赖
- P1B-2：RoVisibility enum + research-object 路由
- P1B-6：/research 公开路由（已强制 public）

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1（迁移 11） | 1h |
| Task 2（domain 可见性） | 1.5h |
| Task 3（API 强制） | 1.5h |
| Task 4（集成测试） | 1.5h |
| Task 5-7（门禁 + 云上 + 文档） | 2h |
| **总计** | **7.5h** |
