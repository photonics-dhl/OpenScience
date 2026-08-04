# P1C-8 Review 与 Merge 流程及高风险确认 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.8
- 依据：`docs/specs/2026-08-04-p1c-8-review-merge-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | Review：空间成员可评审；verdict 枚举 + items 校验 |
| Q2 | Merge：source tip commit 落 target（fast-forward）+ 新草稿版本 + PR merged + 作者合并 + 许可应用 |
| Q3 | 高风险：409 + 原因列表；confirmHighRisk=true 重试 |
| Q4 | 作者合并：现有 authors + PR.newContributors（去重） |
| Q5 | 扩大可见性：Merge 不改可见性（P1B-7 审批，登记不适用） |

## 四类高风险判定

| # | 条件 | 判定 |
|---|---|---|
| a | 新增作者/改序 | PR.newContributors 中 userId 不在当前 authors ∪ 已有 → 或 PR newContributors 非空（新增）→ highRisk |
| b | 变更许可 | PR.dataLicense/codeLicense ≠ 源 RO 有效许可对应项 |
| c | 改变方法/数据/结论 | PR.changesMethod/changesData/changesConclusion 任一 true |
| d | 扩大可见性 | Merge 不改可见性 → 不适用（登记） |

## Merge 事务流程（Q2）

1. PR 存在 + status=open
2. Owner/Maintainer 校验（membership.role ∈ {owner, maintainer}）
3. 高风险判定 + confirmHighRisk 强制
4. 事务：
   - source tip commit → target 分支（update commit.branchId）
   - source tip manifest → 新草稿版本（versionNo = target 分支版本数+1，status=draft）
   - 作者合并（现有 + newContributors 去重）→ setAuthors
   - 许可应用（dataLicense/codeLicense → RO 级）
   - PR status → merged
   - pull_request.merged Notification + 审计

## TDD 步骤

1. **domain `review/errors.ts`**：ReviewError + 错误码（RESEARCH_OBJECT_NOT_FOUND/FORBIDDEN/VALIDATION_ERROR/PR_NOT_OPEN/HIGH_RISK_CONFIRMATION_REQUIRED）
2. **domain `review/reviews.ts`**：
   - `createReview(deps, {prId, userId, verdict, body?, items?}, ctx)`：PR 存在 + requireMembership + verdict 校验 + create + 审计
   - `listReviews(deps, {prId, userId?})`：canAccessRo（经 PR→RO）
   - `mergePullRequest(deps, {prId, userId, confirmHighRisk}, ctx)`：Q2 全流程 + Q3 高风险
3. **单测**（`test/review/reviews.test.ts`）：Merge 权限/四类高风险/无确认拒绝/非 open 拒绝/Review 创建
4. **domain index** 导出
5. **API `routes/reviews.ts`**：POST/GET /research-objects/:id/pull-requests/:prId/reviews + POST /:prId/merge（body confirmHighRisk）
6. **fake prisma**：review create/findMany + PR update
7. **集成测试**（collab 追加 P1C-8 describe）
8. **本地门禁**
9. **云上集成测试**
10. **文档同步** + task-master 4.8 done

## 验收对照

- §8.3：仅 Owner/Maintainer Merge ✅；四类高风险确认 ✅；不修改历史公开版本 ✅；新草稿 ✅；不自动解决冲突 ✅
- §16：pull_request.merged 事件 ✅
- §21.2 步骤 12：Review 和 Merge ✅
- 既有 79/79 不回退

## 风险

- Merge 事务大：commit 迁移 + 新版本 + 作者 + 许可 + PR 状态
- getAuthorChangeInfo 对比：PR.newContributors vs 当前 authors
- items Json 校验（{path, kind, comment}）
