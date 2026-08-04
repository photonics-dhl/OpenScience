# P1D-7 审核申诉流程与 Moderator 队列 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.7（申诉 + Moderator 队列 + 审计）
- 依据：Spec §2.3-4、§3.3、§11.3、§15 Appeal、§16、§17
- 现状：AIReview 表迁移 16 已建（稳定记录）；PlatformRole 枚举含 moderator（迁移 4）；通知通道 P1C-9

---

## 需求基线

1. 审核失败后生成稳定可引用审核记录（§11.3，P1D-5 已建 AIReview）
2. 用户选择：修改后重审（重新走 P1D-5 管线）或提交申诉（Appeal 实体 §15）
3. 申诉进入 Moderator 队列，仅 Moderator/Admin 角色可处理（§3.3）
4. 人工处理结果与理由写入审计日志（§11.3 + §17）
5. 发出 appeal.created 事件并触发通知（§16，P1C 通道）

## 架构决策（拟）

### Appeal 实体（Q1，迁移 17）

- `appeals`：id/versionId/researchObjectId/appellantId/aiReviewId/reason(String)/status(pending/resolved/rejected)/moderatorId?/resolution?(Json: {decision, note})/createdAt/resolvedAt
- versionId → aiReview 关联（稳定记录）
- 迁移 17：表 + FK + rollback

### 申诉流程（Q2）

- `createAppeal(deps, {versionId, userId, reason}, ctx)`：版本存在 + RO 成员 + aiReview 已存在（blocked 才可申诉）+ 幂等（同 version 未决申诉去重）+ appeal.created 通知 + 审计
- `listAppeals`：按角色隔离——appellant 看自己的；moderator/platform_admin 看队列（全部 pending）
- `resolveAppeal(deps, {userId, appealId, decision, note}, ctx)`：仅 moderator/platform_admin（§3.3）+ pending→resolved + 审计（§11.3 人工结果与理由）

### 角色隔离（Q3）

- platformRole ∈ {moderator, platform_admin} 可处理队列 + resolve
- 普通用户仅自己申诉

### 事件（Q4）

- appeal.created → Notification（P1C-9 通道，通知 moderator？——通知 platform admins：查询 platformRole=moderator 用户发通知。简化：通知 appellant 确认已提交 + 登记 moderator 通知后续）

### 重审 vs 申诉（Q5）

- 重审：用户修改后重新 POST /versions/:id/review（P1D-5 管线，幂等 upsert 覆盖硬阻断）
- 申诉：createAppeal（本任务）；两者并存，UI 提供选择

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | Appeal 迁移？ | 迁移 17：appeals 表（versionId + aiReviewId + reason + status + resolution Json） | 复用 AIReview 加字段（申诉多对一，需独立表） |
| Q2 | 申诉前提？ | aiReview 存在且 blocked（§11.3 审核失败后）才可申诉 | 任意版本可申诉（无审核记录，违 §11.3） |
| Q3 | 队列角色隔离？ | platformRole ∈ {moderator, platform_admin} 看全部 pending；appellant 仅自己 | 仅 workspace owner（申诉是平台级） |
| Q4 | 事件通知？ | appeal.created → 通知 appellant 已提交 + 登记 moderator 通知 | 通知全部 moderator（P1D-9 前端精化） |
| Q5 | 重审与申诉并存？ | 重审走 P1D-5 管线（upsert 覆盖）；申诉独立 createAppeal；UI 选择 | 申诉即重审（无法表达争议） |

---

## 测试策略

- **单测**（domain）：角色隔离（appellant 仅自己 / moderator 看队列）、幂等去重、非 blocked 不可申诉、resolve 仅 moderator
- **集成测试**（云上）：申诉创建 → 队列可见性按角色 → 人工处理落审计日志 + 通知
- 既有 95/95 不回退

---

## 涉及模块

- 迁移 17：appeals + rollback
- `packages/domain/src/appeal/appeals.ts`（新）+ errors.ts
- `apps/api/src/routes/appeals.ts`（新）+ app.ts 注册
- 无新依赖

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 迁移 + domain + API + 测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.7 done + 文档同步
