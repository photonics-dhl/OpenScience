# P1C-3 Issue 与评论基础交互 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.3（Issue 创建/回复/状态流转 + Comment 多态复用）
- 依据：Spec §8 概念表、§2.5 决策 4、§4.2、§15 Issue/Comment 实体、§16 /issues、§17 审计/限流、§19 禁止项
- 现状：迁移 12（P1C-1）已建 Issue/Comment/IssueKind——本任务**无迁移**

---

## 需求基线

1. Issue = 科学问题、方法质疑、复现失败、错误报告或改进建议（§8 概念表，五类 = IssueKind 枚举已建）
2. Comment 挂接 Issue/PR/Review（§15 三可空外键多态，一处实现多处复用）
3. Issue 默认继承 RO 可见性（§4.2）
4. 写操作记审计日志 + 限流（§17）
5. 禁止提前实现 §19 的点赞、投票、Top Questions
6. MVP 社区范围限于 RO 评论、Issue、PR 和 Review（§2.5 决策 4）

## 现状约束

- Issue 模型（迁移 12）：`title/body/kind(IssueKind)/status(String "open"/"closed")/authorId`，`@@index([researchObjectId])`
- Comment 模型：`issueId/prId/reviewId` 三可空 FK（多态），`body/authorId`；Issue/PR/Review 均 Cascade
- IssueKind 枚举（5）：question/method_repro/failure/bug_report/suggestion（对齐 §8 五类语义）
- P1B-7 可见性：`canAccessRo`（读）/`requireMembership`（写）
- P1A-8 限流：`RATE_LIMIT_ROUTES` 声明表，key=完整路径

## 架构决策（拟）

### 状态机（open/closed）

- `open` → `closed`：作者本人 或 空间成员（§3.3 Maintainer/Contributor 管理 Issue 语义）
- `closed` → `open`（reopen）：同权限
- 状态变化记录 `issue.status_changed` 审计 + 更新 updatedAt
- 无中间态（MVP 最小集；assignee/labels 延期 P1C-10 前端或后续）

### 权限矩阵（§4.2 继承 + §17 越权）

| 操作 | 门禁 |
|---|---|
| 读 Issue 列表/详情/评论 | `canAccessRo`（public 匿名可读；private/invite_only 成员或 grant） |
| 写 Issue（create/comment/close/reopen） | `requireMembership`（仅空间成员，非成员 404） |

- Issue 无自有 visibility，继承语义与 P1C-2 Branch 相同零存储
- Comment 归属校验：issueId/prId/reviewId 三选一，且属于**同一 RO**（防跨 RO 挂靠）

### API 形态

- 嵌套（与 P1B/P1C-2 一致）：
  - `POST /research-objects/:id/issues`（创建，body: title/kind/body?）
  - `GET /research-objects/:id/issues`（列表，?kind=&status= 过滤 + 评论数）
  - `GET /research-objects/:id/issues/:issueId`（详情 + 评论）
  - `PATCH /research-objects/:id/issues/:issueId`（状态流转：status open/closed）
  - `POST /research-objects/:id/issues/:issueId/comments`（回复）
  - `POST /research-objects/:id/comments`（通用评论：body: issueId?/prId?/reviewId? 多态，P1C-6/8 复用）——**但 pr/review 未实现，先仅支持 issueId**，多态层为 PR/Review 预留
- 乐观锁：Issue 更新用 version 字段？——Issue 无 RO.version 语义，状态流转用 `status` 幂等（同状态重复 → 直接成功 + 审计），不引入版本号

### 限流（§17 + 任务要求）

- `RATE_LIMIT_ROUTES` 加 2 行（写作档位，key=完整路径）：
  - `POST /research-objects/:id/issues` → 20/60s
  - `POST /research-objects/:id/comments` → 30/60s
- 复用 P1A-8 registerRateLimit 中间件零改动

### §19 禁止项登记

- 不实现：点赞、投票、Top Questions、Issue labels 富集（kind 即最小标签）、assignee
- 数据模型已留扩展路径（Issue 表可加列，不加）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | Issue 关闭/重开权限？ | 作者本人 或 空间成员（§3.3 Maintainer/Contributor 语义）；状态变化审计 | 仅作者（无协作关闭，成员无法处理已死 issue） |
| Q2 | 通用评论多态本期范围？ | 先支持 issueId（PR/Review 未实现）；domain 层三 FK 全支持，API 层 prId/reviewId 校验属 P1C-6/8 | API 层现在就暴露 prId/reviewId（空实现，误导） |
| Q3 | 状态流转幂等/并发？ | 幂等（同状态重复成功 + 审计）；无版本号（Issue 非 RO.version 推进） | 乐观锁 version（过度设计） |
| Q4 | 限流档位？ | 写 2 行声明表：issues 20/60s、comments 30/60s（复用 P1A-8 中间件） | 不限期流（违反任务描述 §17） |
| Q5 | 评论编辑/删除？ | 本期仅创建 + 列表；编辑/删除延期（§3.4 不可抹除语义：评论属贡献，禁删是规范方向，P1C-10 前端时定） | 本期实现编辑/删除（超 MVP，§3.4 冲突） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - 状态机：open→closed→open 合法流转；非法状态拒绝；非权限用户关 issue → 404
  - 权限：public 匿名读列表；private 非成员读 → 404；非成员写 → 404
  - Comment 多态：issueId 归属同 RO；跨 RO 挂靠拒绝；三 FK 全空拒绝
  - kind 校验：5 类枚举合法，非法拒绝
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - Issue 全生命周期：创建 → 列表（kind 过滤）→ 评论 → 关闭 → 重开 → 详情含评论
  - 权限：非成员创建 → 404；public 匿名读列表可见
  - 审计：issue.create / comment.create / issue.status_changed 落 audit_logs
- 既有 63/63 不回退

---

## 涉及模块

- `packages/domain/src/issue/issues.ts`（新）+ `errors.ts`（新）
- `apps/api/src/routes/issues.ts`（新）+ `app.ts` 注册 + `RATE_LIMIT_ROUTES` 加行
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- `apps/api/test/helpers/fakes.ts`（issue/comment 假实现）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档（TDD 步骤 + 权限/状态机/限流说明）
3. 代码 + 单测 + 集成测试
4. 本地门禁（build/typecheck/lint/audit）
5. 云上集成测试全绿
6. task-master 4.3 done + 文档同步
