# P1C-7 作者组与 CRediT 贡献记录 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.7
- 依据：`docs/specs/2026-08-04-p1c-7-authors-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 作者组 = Author 表用户 ∪ RO 创建者；空名单创建者独属 |
| Q2 | 全量替换（顺序=数组序）+ 通讯至多一人 |
| Q3 | Contribution append-only + 同 user+role 幂等；不可删 |
| Q4 | 贡献添加：空间成员 |
| Q5 | getAuthorChangeInfo（P1C-8 Merge 审批对比用） |

## TDD 步骤

1. **domain `authorship/errors.ts`**：AuthorError + 错误码（RESEARCH_OBJECT_NOT_FOUND/FORBIDDEN/VALIDATION_ERROR/MULTIPLE_CORRESPONDING）
2. **domain `authorship/authors.ts`**：
   - `setAuthors(deps, {roId, userId, authors: [{userId, isCorresponding}]}, ctx)`：
     - requireMembership + 作者组校验（Author 表用户 ∪ 创建者；空名单创建者独属）→ 非作者组 403
     - 通讯至多一人（超 1 → MULTIPLE_CORRESPONDING）
     - 全量替换事务：deleteMany 旧 + createMany 新 + 审计 authorship.set
   - `listAuthors(deps, {roId, userId?})`：canAccessRo + 按 sortOrder + 含 userId/displayName/isCorresponding
   - `addContribution(deps, {roId, userId, creditRole}, ctx)`：
     - requireMembership（Q4 空间成员）
     - CRediT 角色合法校验
     - 同 user+role 已存在 → 幂等返回（Q3）
     - create + 审计 contribution.add
   - `listContributions(deps, {roId, userId?})`：canAccessRo + 按时间
   - `getAuthorChangeInfo(deps, {roId, userId})`：requireMembership + 返回 {authors: [{userId, sortOrder, isCorresponding}], contributorIds: []}（Q5 P1C-8 用）
3. **单测**（`test/authorship/authors.test.ts`）：作者组权限/全量替换/通讯唯一/贡献幂等不可删/无自动署名
4. **domain index** 导出
5. **API `routes/authors.ts`**：GET/PUT /research-objects/:id/authors + POST/GET /research-objects/:id/contributions + GET /research-objects/:id/author-change-info
6. **fake prisma**：author/contribution 假实现
7. **集成测试**（collab 追加 P1C-7 describe）
8. **本地门禁**
9. **云上集成测试**
10. **文档同步** + task-master 4.7 done

## 验收对照

- §3.4：作者组确认署名/顺序/通讯 ✅；创建者不自动第一作者 ✅；无自动署名逻辑 ✅；贡献不可抹除 ✅
- §2.3 决策 2：事实贡献者独立记录 ✅
- P1C-8 Merge 审批查询接口 ✅
- 既有 77/77 不回退

## 风险

- 作者组校验需查 Author 表 + RO 创建者
- Contribution 幂等：findFirst 同 user+role → 返回既有
- fake prisma author/contribution findMany 支持 sortOrder
