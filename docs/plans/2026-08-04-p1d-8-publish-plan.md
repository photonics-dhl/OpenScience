# P1D-8 发布事务与状态机推进 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.8
- 依据：`docs/specs/2026-08-04-p1d-8-publish-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 迁移 18：VersionStatus 枚举扩展 + Version.parentVersionId |
| Q2 | 发布三重前置：AI 审核 passed + 许可齐全 + R3 确认 |
| Q3 | POST /versions/:id/status + POST /:id/publish |
| Q4 | parentVersionId 链（v2→v1） |
| Q5 | publish 幂等；published 禁变更 |

## TDD 步骤

1. **迁移 18**：ALTER TYPE VersionStatus ADD VALUE ×4（under_review/approved/rejected/restricted）+ ADD COLUMN Version.parent_version_id + FK + rollback
2. **schema.prisma**：VersionStatus 枚举扩展 + Version.parentVersionId + parentVersion 关系
3. **domain `publish/errors.ts`**：PublishError（NOT_FOUND/FORBIDDEN/VALIDATION_ERROR/REVIEW_NOT_PASSED/LICENSE_MISSING/R3_CONFIRMATION_REQUIRED/ALREADY_PUBLISHED/ILLEGAL_TRANSITION）
4. **domain `publish/publish.ts`**：
   - `transitionVersionStatus(deps, {versionId, userId, status}, ctx)`：状态机合法迁移（纯函数表）+ published/终态禁变更 + 审计
   - `publishVersion(deps, {versionId, userId, r3Confirmed}, ctx)`：三重前置 + assignPublicId + Version published + Publication（UTC 时间戳 + contentSha256 + §6.2 免责声明）+ version.published 事件 + 审计（只追加）
   - 幂等：已 published → 返回既有
5. **API `routes/publications.ts`**：POST /versions/:id/status + POST /versions/:id/publish + GET /versions/:id（公开读，P1D-9 用）
6. **单测**（domain）：状态机非法迁移/published 不可变/前置拒绝/幂等
7. **集成测试**（云上）：发布 v1 → publicId + versionId + UTC 时间戳 + 哈希 + 审计只追加；v2 → parentVersionId=v1
8. **本地门禁**
9. **云上集成测试**
10. **文档同步** + task-master 5.8 done

## 验收对照

- §2.1-6：时间戳 + unique ID + 版本 ID ✅
- §4.1：状态机 + 补充态 ✅
- §2.2-3：已公开不可原地修改 ✅
- §6.2：UTC 事务时间 + 哈希 + 免责声明 + 只追加审计 ✅
- §16：version.published 事件 ✅
- §21.2 步骤 9/13 ✅
- 既有 97/97 不回退

## 风险

- PG ALTER TYPE ADD VALUE：事务外执行（migrate-cli 已支持）
- parentVersionId FK 自引用（Version → Version）
- 前置校验顺序：AI 审核 passed 查 aiReview；许可 getEffectiveLicenses
