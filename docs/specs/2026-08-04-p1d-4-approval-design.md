# P1D-4 R0-R4 分级审批与统一确认交互 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.4（审批分级 + 统一确认）
- 依据：Spec §2.5-7、§9.4、§15 ToolApproval、§17
- 现状：ToolApproval 表迁移 15 已建（taskId/level/scope/status/prompt/approvedBy）；agent 任务通道就绪

---

## 需求基线

1. R0-R4 审批分级（§9.4）：R0 自动 / R1 批量 diff 一次批准 / R2 任务内同类授权 / R3 最终摘要+明确确认 / R4 重新验证+逐项确认
2. 每次确认说明：将改变什么、作用范围、能否撤销、预计费用、预计耗时（§9.4 五要素）
3. 已批准的同一批任务不得重复弹窗（§9.4 同批去重）
4. 支持批量预览、作用域授权（当前任务内同类操作）、撤销（§2.5-7）
5. 审批记录落 ToolApproval 实体 + 审计（§15/§17）
6. Merge/发布/作者/许可/可见性 = R3；删除/所有权/密钥/安全设置 = R4
7. P1D-8 发布确认挂接 R3
8. 验收步骤 5：R1 批量批准 AI 建议 + R3 发布确认弹窗含五要素

## 架构决策（拟）

### 分级判定（Q1，纯函数）

- `approvalLevel(action): 0|1|2|3|4`
  - R0 读：get/list/search/read
  - R1 可撤销草稿：sdf.extract 建议应用、草稿修改
  - R2 协作写入：commit.create、issue.create/comment、pr.create、review.create（任务内同类）
  - R3 高影响：merge.pull_request、authorship.set、license.upsert、visibility 变化、version.publish（P1D-8）
  - R4 危险：ro.delete、ownership.transfer、secret/settings 变更
- 未知 action → R3（安全默认）

### ToolApproval 生命周期（Q2）

- `createApproval(taskId, level, scope, prompt)`：level>0 时任务执行前创建（pending）
- `approveApproval(approvalId, userId, scopeGrant?)`：pending → approved + 审计 + scopeGrant（R2 任务内同类）
- `rejectApproval(approvalId, userId)`：pending → rejected + 审计
- `revokeApproval(approvalId, userId)`：approved → revoked（撤销，§2.5-7）
- 同批去重：`getPendingApprovals(taskId, scope)`——同任务同 scope 已批准 → 不再弹窗

### 五要素（Q3）

- `ConfirmationSpec`：{what, scope, reversible, estCost, estTime}
- `buildConfirmation(action, context)` → 生成五要素（文案模板，中文优先 i18n）
- 前端确认弹窗展示五要素 + approve/reject

### API（Q4）

- `GET /agent/approvals/pending`：当前用户待审批列表
- `POST /agent/approvals/:id/approve`（body: scopeGrant?）
- `POST /agent/approvals/:id/reject`
- `POST /agent/approvals/:id/revoke`
- 权限：approve/reject/revoke 仅任务 owner（ToolApproval 经 task.session.userId）

### 挂接（Q5）

- R1 批量批准：P1D-3 编辑器建议整批 apply → createApproval(level=1, scope=suggestions) → 一次批准
- R3 发布确认：P1D-8 publish 前 createApproval(level=3) → 五要素弹窗
- Merge 高风险（P1C-8）已有 confirmHighRisk——升级为 R3 审批（本期复用既有，P1D-4 提供 createApproval 通路）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 分级判定？ | 纯函数 `approvalLevel(action)` + action 白名单映射 + 未知 → R3 安全默认 | 硬编码调用点（散落） |
| Q2 | ToolApproval 生命周期？ | create→approve/reject→revoke（状态机 pending/approved/rejected/revoked） | 仅 create+approve（无撤销，§2.5-7 违） |
| Q3 | 五要素来源？ | `buildConfirmation(action, ctx)` 生成（i18n 模板，中文优先） | 前端硬编码（重复逻辑） |
| Q4 | 权限？ | approve/reject/revoke 仅任务 owner（经 task.session.userId） | 任何用户（越权） |
| Q5 | 挂接点？ | R1 编辑器建议批量、R3 发布（P1D-8）+ Merge 升级；R2 commit/issue 等先登记（执行前 createApproval 供 P1D-8 用） | 全量强制执行（阻塞交互，违 §2.5-7 速度） |

---

## 测试策略

- **单测**（domain）：
  - approvalLevel 映射（R0/R1/R2/R3/R4 + 未知 → R3）
  - ToolApproval 状态机（pending→approved/rejected/revoked，非法迁移拒绝）
  - 同批去重：同 task+scope 已批准 → 不重复 pending
  - 权限：非 owner approve → 拒绝
- **集成测试**（云上）：
  - 建审批 → approve → 审计 + 状态
  - 撤销 → revoked
  - 五要素生成（buildConfirmation 字段齐全）
- 既有 90/90 不回退

---

## 涉及模块

- `packages/domain/src/approval/approvals.ts`（新）+ `errors.ts`（新）
- `apps/api/src/routes/agent.ts`（加 approvals 端点）
- `packages/domain/src/index.ts` 导出
- 无迁移（ToolApproval 迁移 15 已建）

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.4 done + 文档同步
