# P1D-5 发布审核硬阻断检查管线 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.5
- 依据：`docs/specs/2026-08-04-p1d-5-publish-review-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 迁移 16 ai_reviews（versionId @unique + status + hardBlocks/warnings Json） |
| Q2 | 恶意代码：扩展名/mimeType 黑名单 + 登记 P1B-8 联动 |
| Q3 | Notification ai_review.completed |
| Q4 | RO workspace 成员触发 + 发布者权限校验 |
| Q5 | POST/GET /versions/:id/review |

## TDD 步骤

1. **迁移 16**：ai_reviews 表 + rollback；schema.prisma model AiReview
2. **domain `review/blocking.ts`**（纯函数）：
   - `checkCoreCompleteness(core)`：六字段非空（§5.1）
   - `checkSensitiveContent(text)`：身份证/密钥/令牌正则（§17）
   - `checkMaliciousArtifact(logicalPath, mimeType)`：扩展名/mimeType 黑名单
   - `checkProhibitedContent(text)`：违法/禁止关键词
   - `DANGEROUS_EXTENSIONS` / `SENSITIVE_PATTERNS` 常量
3. **domain `review/publish-review.ts`**：
   - `runPublicationReview(deps, {versionId, userId}, ctx)`：七类执行 + 任一命中 → AIReview(blocked) + 审计 + Notification(ai_review.completed)；全过 → passed
   - `getPublicationReview(deps, {versionId, userId})`：稳定记录（§11.3）
4. **API `routes/reviews.ts`**：POST/GET /versions/:versionId/review
5. **单测**（domain）：七类各命中/放行
6. **集成测试**（云上）：缺许可 → blocked；正常版本 → passed
7. **本地门禁**
8. **云上集成测试**
9. **文档同步** + task-master 5.5 done

## 验收对照

- §11.1：七类硬阻断 ✅
- §15：AIReview 实体 ✅
- §16：ai_review.completed 事件 ✅
- §2.3-4：未通过禁止发布（P1D-8 状态机消费 blocked）✅
- §9.2：Safety Reviewer 不替代人工（登记）✅
- §21.2 步骤 7 ✅
- 既有 92/92 不回退

## 风险

- 哈希校验：rebuildVersion 复用（P1B-4 已实现 blob 校验）
- 恶意代码黑名单需平衡误报（仅危险扩展名 + 可执行 mimeType）
- 敏感正则需覆盖身份证/密钥/令牌常见形态
