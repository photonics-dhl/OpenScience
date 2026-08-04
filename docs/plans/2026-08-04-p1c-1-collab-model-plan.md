# P1C-1 协作域数据模型与数据库迁移 Plan

> Phase 1C GitHub 式科研协作 — P1C-1  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1c-1-collab-model-design.md](../specs/2026-08-04-p1c-1-collab-model-design.md)  
> 对应 task-master: 4.1

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| PR 声明字段 | 内联（Json + Boolean） |
| Comment 多态 | 三可空外键 |
| CreditRole | 14 项完整 CRediT |
| License 标识 | 标准字符串（配置位） |
| Notification | payload Json |

---

## 1. 任务拆解（TDD）

### Task 1：迁移 12 + Prisma
- `infra/migrations/20260804040000_collab/migration.sql`：11 表 + 4 枚举（IssueKind/ReviewVerdict/CreditRole）+ FK + 索引
- `rollback.sql`：逆序 DROP
- `infra/schema.prisma`：11 model + 枚举 + ResearchObject/User/Commit/Version 关系
- Prisma generate
- 门禁：build/typecheck

### Task 2：单测
- `packages/database/test/`：迁移 up/down 往返（临时库）
- `packages/domain/test/collab/`：枚举完整（CreditRole 14/IssueKind 5/ReviewVerdict 3）+ 必填约束
- 门禁：单测 8+ 全绿

### Task 3：集成测试
- `apps/api/test/collab.integration.test.ts`：
  1. Contribution → RO/User 外键一致性
  2. PR → Branch/RO 外键
  3. ForkRelation 唯一（二次 Fork 拒绝）
  4. Contribution 无删除路径（Restrict）
- 门禁：集成测试 4 全绿

### Task 4：本地门禁收口
- build/typecheck/lint/audit/knip/dep/docs 全绿
- 全仓 test 无回归

### Task 5：云上集成测试
- cloud-sync → install + 全量 build
- 云上 migrate deploy（迁移 12）
- test:integration 全绿（新增 P1C-1 + 既有 58 回归）

### Task 6：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 4.1 done + details

---

## 2. 验收清单

- [ ] 迁移 12 applied + rollback 往返
- [ ] Prisma 11 model + 4 枚举
- [ ] 单测 8+（枚举完整 + 必填）
- [ ] 集成测试 4（外键 + ForkRelation 唯一 + 无删除路径）
- [ ] 本地门禁全绿
- [ ] 云上集成全绿
- [ ] task-master 4.1 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **11 表迁移**：Prisma 关系多，format 缩进（读文件取精确文本）
- **ForkRelation 循环外键**：forkedRo/sourceRo 同表自引用（命名关系）
- **Comment 三可空外键**：Prisma 多可选 FK（无冲突）

### 3.2 依赖
- P1B-4：Branch/Commit/Version（挂接）
- P1B-2：ResearchObject/User

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1（迁移 12） | 2h |
| Task 2（单测） | 1.5h |
| Task 3（集成测试） | 1.5h |
| Task 4-6（门禁 + 云上 + 文档） | 2.5h |
| **总计** | **7.5h** |
