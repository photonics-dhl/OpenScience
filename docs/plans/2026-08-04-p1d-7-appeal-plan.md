# P1D-7 审核申诉流程与 Moderator 队列 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.7
- 依据：`docs/specs/2026-08-04-p1d-7-appeal-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 迁移 17 appeals 表 |
| Q2 | aiReview blocked 才可申诉 |
| Q3 | moderator/platform_admin 看队列，appellant 仅自己 |
| Q4 | appeal.created 通知 |
| Q5 | 重审走 P1D-5；申诉独立 |

## TDD 步骤

1. **迁移 17**：appeals 表 + rollback；schema.prisma model Appeal + User/Version/AiReview 关系
2. **domain `appeal/errors.ts`**：AppealError（NOT_FOUND/FORBIDDEN/REVIEW_NOT_BLOCKED/ALREADY_PENDING）
3. **domain `appeal/appeals.ts`**：
   - `createAppeal(deps, {versionId, userId, reason}, ctx)`：版本 + RO 成员 + aiReview blocked + 幂等（同 version pending 去重）+ Notification(appeal.created) + 审计
   - `listAppeals(deps, {userId, moderator?})`：appellant 仅自己 / moderator 全部 pending
   - `resolveAppeal(deps, {userId, appealId, decision, note}, ctx)`：moderator/platform_admin + pending→resolved/rejected + 审计（人工结果与理由）
4. **API `routes/appeals.ts`**：POST /appeals + GET /appeals（角色隔离）+ POST /appeals/:id/resolve
5. **单测**（domain）：角色隔离/幂等/非 blocked/resolve 权限
6. **集成测试**（云上）：申诉创建→moderator 队列→处理→审计 + 通知
7. **本地门禁**
8. **云上集成测试**
9. **文档同步** + task-master 5.7 done

## 验收对照

- §11.3：稳定记录 + 修改重审或申诉 + 人工结果审计 ✅
- §3.3：Moderator/Admin 处理 ✅
- §16：appeal.created 事件 ✅
- §17：写操作审计 ✅
- 既有 95/95 不回退

## 风险

- moderator 判定：User.platformRole ∈ {moderator, platform_admin}
- 幂等：同 version 有 pending appeal → 拒绝
- fake prisma appeal + platformRole 查询
