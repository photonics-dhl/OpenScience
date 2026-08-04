# P1C-3 Issue 与评论基础交互 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.3
- 依据：`docs/specs/2026-08-04-p1c-3-issue-comment-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | Issue 关闭/重开：作者本人 或 空间成员；状态变化审计 |
| Q2 | 通用评论多态：本期仅 issueId（domain 三 FK 全支持预留） |
| Q3 | 状态流转幂等：同状态重复成功 + 审计；无版本号 |
| Q4 | 限流：RATE_LIMIT_ROUTES 加 issues 20/60s + comments 30/60s |
| Q5 | 评论仅创建+列表；编辑/删除延期（§3.4） |

## 权限/审计/限流说明（登记）

- **可见性继承（§4.2）**：Issue/Comment 零存储，读 `canAccessRo`、写 `requireMembership`
- **§17 审计**：issue.create / issue.status_changed / comment.create 全部落 audit_logs
- **§17 限流**：复用 P1A-8 `RATE_LIMIT_ROUTES` 声明表，key=完整路径
- **§19 禁止**：点赞/投票/Top Questions 不实现
- **Comment 归属**：三 FK 至多一个且属于同一 RO（防跨 RO 挂靠）

## TDD 步骤

1. **domain `issue/errors.ts`**：IssueError + 错误码（RESEARCH_OBJECT_NOT_FOUND/FORBIDDEN/VALIDATION_ERROR/COMMENT_TARGET_INVALID/CROSS_RO_COMMENT）
2. **domain `issue/issues.ts`**：
   - `createIssue(deps, {researchObjectId, userId, title, kind, body?}, ctx)`
     - requireMembership（§17 越权）+ title/kind 校验 + 审计 issue.create
   - `listIssues(deps, {researchObjectId, userId?, kind?, status?})`
     - canAccessRo 读门禁 + include _count.comments + orderBy createdAt desc
   - `getIssue(deps, {researchObjectId, userId?, issueId})`：canAccessRo + include comments（作者 + createdAt）
   - `updateIssueStatus(deps, {researchObjectId, userId, issueId, status}, ctx)`
     - requireMembership + authorId 或 membership（Q1）
     - status 幂等（同状态 → 审计 + 直接成功）
     - 审计 issue.status_changed
   - `createComment(deps, {researchObjectId, userId, body, issueId?, prId?, reviewId?}, ctx)`
     - requireMembership + body 校验
     - 三 FK 至多一个 + 归属同 RO（跨 RO → CROSS_RO_COMMENT）
     - 审计 comment.create
3. **单测**（`packages/domain/test/issue/issues.test.ts`）：状态机、权限、可见性、Comment 多态、kind 校验
4. **domain index** 导出
5. **API `apps/api/src/routes/issues.ts`**：
   - POST /research-objects/:id/issues
   - GET /research-objects/:id/issues（?kind=&status=）
   - GET /research-objects/:id/issues/:issueId
   - PATCH /research-objects/:id/issues/:issueId（status）
   - POST /research-objects/:id/issues/:issueId/comments
   - app.ts 注册 + RATE_LIMIT_ROUTES 加行
6. **fake prisma**：issue/comment 假实现（create/findMany/findUnique/update/count + _count.comments）
7. **集成测试**（collab.integration.test.ts 追加 P1C-3 describe）：
   - 全生命周期：创建 → 列表（kind 过滤）→ 评论 → 关闭 → 重开 → 详情含评论
   - 权限：非成员创建 404；public 匿名读可见
   - 审计：3 种 action 落 audit_logs
8. **本地门禁**：build / typecheck / lint / audit / 单测
9. **云上集成测试**：cloud-sync + 跑 collab（预期 63+N 全绿）
10. **文档同步**：progress / project_index / handoff；task-master 4.3 done

## 验收对照

- §8 概念表：Issue 五类语义（IssueKind 枚举）✅
- §2.5 决策 4：MVP 社区 = RO 评论/Issue/PR/Review ✅
- §4.2：Issue 继承 RO 可见性 ✅
- §17：写审计 + 限流 ✅
- §19：禁止项未实现 ✅
- 既有 63/63 不回退

## 风险

- fake prisma issue/comment 需支持 include._count.comments + 多态归属查询
- 跨 RO 挂靠：Comment 归属校验需查目标 Issue 的 researchObjectId 对比
