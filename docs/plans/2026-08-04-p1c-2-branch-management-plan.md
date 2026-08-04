# P1C-2 Branch 管理与可见性继承 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.2
- 依据：`docs/specs/2026-08-04-p1c-2-branch-management-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 三规则禁删：default + 有 Commit + 被 PR 引用（403；数据层 Restrict 兜底） |
| Q2 | 零存储：Branch 不存 visibility；读 canAccessRo、写 requireMembership |
| Q3 | headCommitId 可选，校验同 RO，写 parentCommitId 锚点 |
| Q4 | 嵌套 `/research-objects/:id/branches` |
| Q5 | 切换无状态占位：返回目标分支详情 + 审计，无 RO 字段 |

## 越权/继承/幂等说明（登记）

- **越权**：create/delete 用 `requireMembership`（非成员 → 404，§17 不泄露）；list/get 用 `canAccessRo`（public 非成员可读，private/invite_only 拒绝）
- **可见性继承**：分支无自有 visibility，访问判定完全由 RO 承担，§2.3 决策 3 天然成立
- **扩大可见范围审批**：分支不存储可见性 → 无法在分支层扩大；扩大仅发生在 RO 层（P1B-7 已实现审批）。任务描述此项对分支为不适用项。
- **幂等键**：`@@unique([roId, name])` 天然幂等——重复创建同名校验先行返回冲突，而非落库报错
- **乐观锁**：分支创建/删除不推进 RO.version，无版本竞争；删除前重读状态（CAS）

## TDD 步骤

1. **domain `branch/errors.ts`**：BranchError + 错误码（NOT_FOUND/NAME_INVALID/DEFAULT_BRANCH/BRANCH_HAS_COMMITS/BRANCH_IN_USE/CROSS_RO_COMMIT）
2. **domain `branch/branches.ts`**（TDD 红）：
   - `createBranch(deps, {researchObjectId, userId, name, headCommitId?}, ctx)`
     - requireMembership（§17 越权）
     - 名称校验：`^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,63}$`（git 风格，禁 `main` 保留名以外冲突靠唯一约束）
     - `@@unique` 冲突 → BranchError NAME_EXISTS
     - headCommitId 校验：同 RO（跨 RO → CROSS_RO_COMMIT）
     - 创建分支；若 headCommitId，写一条 `anchor commit`？——**否**：锚点写入在后续 commit 的 parentCommitId 由 createCommit 天然接续。本函数仅存分支行。
     - 审计 `branch.create`
   - `listBranches(deps, {userId?, researchObjectId})`：canAccessRo 门禁 + include tipCommit（最近 Commit）+ commitCount
   - `deleteBranch(deps, {userId, researchObjectId, branchId}, ctx)`：
     - requireMembership
     - isDefault → DEFAULT_BRANCH
     - 有 Commit（count>0）→ BRANCH_HAS_COMMITS
     - 被 PR 引用（source/target count>0）→ BRANCH_IN_USE
     - 删除 + 审计 `branch.delete`
   - `switchBranch(deps, {userId, researchObjectId, branchId}, ctx)`：
     - requireMembership + 分支存在
     - 返回分支详情 + 审计 `branch.switch`（无状态占位）
3. **单测**（`packages/domain/test/branch/branches.test.ts`）：
   - 可见性继承：public 非成员 list 可见；private 非成员 denied
   - 越权创建：非成员 → 404
   - 名称校验：非法字符拒绝
   - headCommitId 跨 RO 拒绝
   - 三规则删除保护
4. **domain `index.ts`** 导出
5. **API `apps/api/src/routes/branches.ts`**：
   - GET /research-objects/:id/branches
   - POST /research-objects/:id/branches
   - DELETE /research-objects/:id/branches/:branchId
   - POST /research-objects/:id/branches/:branchId/switch
   - `app.ts` 注册（storage 分支内，与 commits 并列）
6. **集成测试**（`apps/api/test/collab.integration.test.ts` 追加 P1C-2 describe）：
   - 分支列表含 tipCommit + commit 后 tip 推进
   - 两分支独立 commit 链（parent 正确）
   - 有 Commit 分支 DELETE → 403
   - 非成员 createBranch → 404
   - headCommitId 锚点：起点 commit 后 parentCommitId 正确
7. **本地门禁**：build / typecheck / lint / audit / 单测
8. **云上集成测试**：cloud-sync + 迁移（无新迁移）+ 跑 collab 集成（预期 62+N 全绿）
9. **文档同步**：progress / project_index / handoff；task-master 4.2 done

## 验收对照

- §2.3 决策 3：分支继承可见性（零存储 + canAccessRo）✅
- §17 越权：非成员创建 → 404 ✅
- §4.2：扩大可见范围需审批 → 分支层不适用（登记）✅
- §21.2 步骤 11 前置：headCommitId 支持 Fork 后分支起点 ✅
- 既有 62/62 不回退

## 风险

- `@@unique` 冲突错误码（Prisma P2002）需映射到 409/400 而非 500
- listBranches 的 canAccessRo 需 userId 可选（匿名 public 读）
