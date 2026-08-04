# P1C-9 协作通知、事件投递与审计 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.9（Notification 实体 + 事件通知 + 已读 + 渠道抽象）
- 依据：Spec §18.1 Dashboard 通知、§15 Notification、§16 事件、§17 审计/限流
- 现状：Notification 实体迁移 12 已建；PR opened/merged 事件已落 Notification 行（P1C-6/8）；全部协作写操作已审计

---

## 需求基线

1. 消费 pull_request.opened/merged 等事件生成 Notification（§15/§16）
2. 事件必须可重试、消费者幂等（以事件 ID 去重，§16）
3. 通知含已读/未读状态与跳转链接
4. 全部协作写操作落 AuditLog（§17，已做）
5. 通知与协作接口限流（§17，已做）
6. 生产日志不记录论文全文（§17，已做）
7. 站内通知 MVP；邮件 §24 待确认，预留渠道抽象不写死

## 现状约束

- Notification：`userId/type/payload(Json)/read/createdAt`，`@@index([userId, read])`
- PR opened/merged 已发通知（事务内创建）
- 无渠道抽象；无通知查询 API
- 事件源幂等：PR idempotencyKey（迁移 14）保证 PR 单次 → 通知单次

## 架构决策（拟）

### 消费者幂等（Q1）

- **依赖事件源幂等**：PR opened/merged 通知在 PR 创建/merge 事务内生成——PR idempotencyKey 唯一保证同 PR 不重复通知（重发同 key → 返回既有 PR，不重建通知）
- 不引入 Notification.eventId 列（零迁移）；事件重试时幂等由上游保证
- 登记：若未来外部事件（P1D-2 队列）需独立去重 → 加 eventId 唯一列（迁移时）

### 通知渠道抽象（Q4）

- `NotificationChannel` 接口：`deliver(notification): Promise<void>`
- `InAppChannel`：Notification 行（已实现，当前唯一渠道）
- `EmailChannel`：§24 待确认——仅接口预留，不实现不写死
- domain 提供 `createNotification(deps, {userId, type, payload, link?}, ctx)` 帮助函数（供 P1C-6/8 复用，统一 channel 分发）

### 跳转链接（Q3）

- Notification payload 加 `link`（如 `/research-objects/:id/pull-requests/:prId`）
- 既有 PR 通知 payload {prId, researchObjectId} → 前端可拼链接；本期 domain 帮助函数加 link

### 通知查询/已读（Q5）

- `GET /notifications`：当前用户，未读优先 + 分页（limit/offset）
- `POST /notifications/:id/read`：仅本人（他人 → 404）；幂等（已读 → 成功）
- 可见性：通知是用户私有（非 RO 共享），无 canAccessRo；只查 userId=current

### 事件 → 通知补全（Q2）

- Issue 创建/评论：发 issue.updated 通知（任务「Issue 动态」）——P1C-3 补
- Review 请求：本期无 assignee → 跳过（登记，Review 创建者自己已知）

### 审计核对（task 要求）

- 逐项核对既有协作写操作审计：Issue create/status_changed/comment ✓、PR opened/merged ✓、Review ✓、Fork ✓、作者 set ✓、许可 upsert ✓——全在
- 本任务补：notification.read 审计

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 通知消费者幂等？ | 依赖事件源幂等（PR idempotencyKey → 通知单次），零迁移 | 加 Notification.eventId 唯一列（迁移 15，防外部事件重复） |
| Q2 | Issue 动态通知？ | P1C-3 补 issue.updated（创建/评论时发通知给 RO 相关用户） | 本期跳过（Dashboard 通知空泛） |
| Q3 | 跳转链接？ | payload 加 link 字段（帮助函数统一拼） | 前端拼（payload 无 link，耦合） |
| Q4 | 渠道抽象？ | NotificationChannel 接口 + InApp 实现 + Email 占位（§24 不写死） | 仅 InApp（无扩展点） |
| Q5 | 已读 API？ | GET /notifications + POST /notifications/:id/read（仅本人 + 幂等） | PATCH /notifications/:id（语义弱） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - 消费者幂等：同 PR 重发（同 idempotencyKey）→ 通知不重复（PR 幂等保证）
  - 渠道抽象：InAppChannel deliver 写行；Email 占位不实现
  - 已读：markRead 仅本人 + 幂等
  - Issue 动态：issue create/comment → issue.updated 通知
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - 事件→通知链路：建 PR → 通知落行（pull_request.opened）→ GET /notifications 可见 → markRead
  - Issue 动态：建 issue → 通知
  - 审计：notification.read 落 audit_logs
- 既有 82/82 不回退

---

## 涉及模块

- `packages/domain/src/notification/notifications.ts`（新）+ `errors.ts`（新）+ `channels.ts`（新）
- `packages/domain/src/issue/issues.ts`（补 issue.updated 通知）
- `apps/api/src/routes/notifications.ts`（新）+ `app.ts` 注册
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 4.9 done + 文档同步
