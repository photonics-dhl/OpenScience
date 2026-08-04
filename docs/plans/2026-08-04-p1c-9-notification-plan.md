# P1C-9 协作通知、事件投递与审计 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.9
- 依据：`docs/specs/2026-08-04-p1c-9-notification-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 消费者幂等依赖事件源幂等（PR idempotencyKey），零迁移 |
| Q2 | P1C-3 补 issue.updated 通知 |
| Q3 | payload 加 link 字段 |
| Q4 | NotificationChannel 接口 + InApp 实现 + Email 占位（§24） |
| Q5 | GET /notifications + POST /:id/read（仅本人+幂等） |

## TDD 步骤

1. **domain `notification/channels.ts`**：NotificationChannel 接口 + InAppChannel（写行）+ EmailChannel 占位
2. **domain `notification/errors.ts`**：NotificationError（NOTIFICATION_NOT_FOUND）
3. **domain `notification/notifications.ts`**：
   - `notify(deps, {userId, type, payload, link?}, ctx?)`：帮助函数（channel.deliver + 可选审计）
   - `listNotifications(deps, {userId, limit?, offset?, unreadOnly?})`：分页 + 未读优先
   - `markNotificationRead(deps, {userId, notificationId}, ctx)`：仅本人（他人 → 404）+ 幂等 + 审计 notification.read
4. **domain `issue/issues.ts` 补**：createIssue + createComment 发 issue.updated 通知（payload 含 link）
5. **domain index** 导出
6. **API `routes/notifications.ts`**：GET /notifications + POST /notifications/:id/read
7. **fake prisma**：notification findMany/findFirst/update 扩展
8. **单测**（`test/notification/notifications.test.ts`）：幂等/渠道/已读
9. **集成测试**（collab 追加 P1C-9 describe）：事件→通知链路 + 已读 + Issue 动态
10. **本地门禁**
11. **云上集成测试**
12. **文档同步** + task-master 4.9 done

## 验收对照

- §15/§16：事件→Notification + 幂等 ✅
- §18.1：Dashboard 通知数据 ✅
- §17：写操作审计核对全绿 + notification.read 审计 ✅
- 渠道抽象（§24 邮件待确认）✅
- 既有 82/82 不回退

## 风险

- fake notification findMany 需支持 where + orderBy + skip/take
- issue 通知给谁：RO 作者 + 贡献者 + 空间成员？——简化：通知 RO 创建者（后续 P1C-10 前端精化）
