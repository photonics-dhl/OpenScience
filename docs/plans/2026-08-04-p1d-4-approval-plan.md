# P1D-4 R0-R4 分级审批与统一确认交互 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.4
- 依据：`docs/specs/2026-08-04-p1d-4-approval-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | approvalLevel(action) 纯函数 + 未知 → R3 |
| Q2 | ToolApproval create→approve/reject→revoke 状态机 |
| Q3 | buildConfirmation 五要素 i18n 模板 |
| Q4 | approve/reject/revoke 仅任务 owner |
| Q5 | R1 编辑器批量 / R3 发布+Merge；R2 登记 |

## TDD 步骤

1. **domain `approval/errors.ts`**：ApprovalError（NOT_FOUND/FORBIDDEN/ILLEGAL_TRANSITION/ALREADY_PROCESSED）
2. **domain `approval/approvals.ts`**：
   - `approvalLevel(action)`：R0/R1/R2/R3/R4 映射 + 未知 → R3
   - `buildConfirmation(action, ctx?)`：五要素 {what, scope, reversible, estCost, estTime}
   - `createApproval(deps, {taskId, action, level?, scope, prompt})`：level>0 才建；同 task+scope 已 approved → 不重复（同批去重）
   - `approveApproval(deps, {userId, approvalId, scopeGrant?})`：owner 校验 + pending→approved + 审计
   - `rejectApproval` / `revokeApproval`：同上
   - `listPendingApprovals(deps, {userId})`：当前用户待审批
3. **API `routes/agent.ts`**：GET /agent/approvals/pending + POST /agent/approvals/:id/{approve,reject,revoke}
4. **单测**（domain）：approvalLevel 全映射/状态机/同批去重/权限/buildConfirmation 五要素
5. **集成测试**（云上）：建审批→approve→审计+状态；revoke→revoked
6. **本地门禁**
7. **云上集成测试**
8. **文档同步** + task-master 5.4 done

## 验收对照

- §9.4：R0-R4 分级 + 五要素 + 同批去重 + 批量/作用域/撤销 ✅
- §15/§17：ToolApproval 落实体 + 审计 ✅
- P1D-8 发布挂接 R3（登记）✅
- §21.2 步骤 5 ✅
- 既有 90/90 不回退

## 风险

- 同批去重：同 task+scope approved → 返回既有（不重复 pending）
- owner 判定：ToolApproval → task → session.userId
- fake prisma toolApproval/agentTask 支持
