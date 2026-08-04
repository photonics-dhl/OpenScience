# P1D-5 发布审核硬阻断检查管线 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.5（七类硬阻断 + AIReview 实体 + 事件）
- 依据：Spec §2.3-5、§11.1、§15 AIReview、§16、§17、§7 存储模型
- 现状：ai-gateway + agent-worker（sdf.extract handler 通路）就绪；Publication/Identifier 迁移 6 已建；发布状态机 P1D-8 推进

---

## 需求基线

1. 七类硬阻断（§11.1）：缺字段 / 恶意代码 / 隐私泄露 / 违法内容 / 权限无法确认 / 缺许可 / 哈希校验失败
2. 任一命中 → 发布请求被拒 + AIReview 记录（§15）
3. 审核完成发 ai_review.completed 事件（§16）
4. Safety Reviewer 类检查不替代申诉人工（§9.2）
5. 审核未通过禁止发布（§2.3-4）
6. 验收步骤 7：缺许可/缺字段版本被拒；正常版本通过

## 架构决策（拟）

### AIReview 实体（Q1，迁移 16）

- `ai_reviews`：id/versionId(@unique 每版本一次)/researchObjectId/status(passed/blocked)/hardBlocks(Json)/warnings(Json)/verdict(String)/createdAt
- 稳定可引用（§11.3 申诉复用）
- 迁移 16：表 + rollback

### 七类硬阻断管线（Q2，纯函数 + domain）

`runHardBlockChecks(deps, {versionId, userId})` → `{passed: boolean, blocks: HardBlock[]}`

| # | 阻断 | 判定 |
|---|------|------|
| 1 | 缺字段 | version manifest core 六字段非空（§5.1） |
| 2 | 恶意代码 | artifacts 扫描结果（P1B-8 病毒扫描占位 → 本期读 artifact.scanStatus？—— 无此字段。用 artifact.mimeType/扩展名黑名单占位 + 登记 P1B-8 实装联动） |
| 3 | 隐私泄露 | 正则扫 core/manifest（身份证/密钥/令牌，§17 MUST） |
| 4 | 违法/禁止内容 | 关键词黑名单（登记：真实审核 P1D-9 AI 层；本期确定性黑名单） |
| 5 | 权限无法确认 | userId 是 RO workspace 成员 + RO.createdBy 或作者（§17） |
| 6 | 缺许可 | getEffectiveLicenses 三类齐全（P1C-4） |
| 7 | 哈希校验失败 | version manifest entries blobSha256 vs 源 artifact（rebuildVersion 复用 P1B-4） |

- 纯函数 `checkCoreCompleteness(core)` / `checkSensitiveContent(text)` 可单测
- domain `runPublicationReview(deps, {versionId, userId}, ctx)`：七类执行 + 任一命中 → AIReview(blocked) + 审计；全过 → AIReview(passed) + ai_review.completed 通知（§16）

### 事件（Q3）

- 审核完成发 Notification（type='ai_review.completed'，复用 P1C-9 通知通道）
- P1D-8 发布状态机消费：blocked → 拒绝发布

### 权限（Q4）

- 仅 RO workspace 成员可触发审核（requireMembership）；owner/author 确认发布者权限

### API（Q5）

- `POST /research-objects/:id/versions/:versionId/review`：触发硬阻断审核 → 返回 AIReview（passed/blocked + blocks 详情）
- `GET /research-objects/:id/versions/:versionId/review`：查既有审核（稳定记录 §11.3）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | AIReview 迁移？ | 迁移 16：ai_reviews 表（versionId @unique + status + hardBlocks/warnings Json） | 复用现有表（无 AIReview，§15 违） |
| Q2 | 恶意代码判定？ | 本期扩展名/mimeType 黑名单（可执行危险类）+ 登记 P1B-8 病毒扫描实装联动 | 无判定（§11.1 缺失） |
| Q3 | 事件？ | Notification（type='ai_review.completed'，P1C-9 通道） | 跳过（§16 违） |
| Q4 | 审核权限？ | RO workspace 成员触发；发布者权限 = membership + author 校验 | 任意用户（越权） |
| Q5 | 审核 API？ | POST /versions/:id/review + GET /versions/:id/review（稳定记录） | 仅 POST（§11.3 稳定记录缺失） |

---

## 测试策略

- **单测**（domain）：七类各命中/放行、checkCoreCompleteness/checkSensitiveContent 纯函数
- **集成测试**（云上）：缺许可版本 → blocked；正常版本（有许可 + 完整 core + commit）→ passed；AIReview 记录 + 审计
- 既有 92/92 不回退

---

## 涉及模块

- 迁移 16：ai_reviews + rollback
- `packages/domain/src/review/blocking.ts`（纯函数）+ `publish-review.ts`（管线）
- `apps/api/src/routes/reviews.ts`（加 /versions/:id/review）或新 publications 模块
- 无新依赖

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 迁移 + domain + API + 测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.5 done + 文档同步
