# P1D-6 发布审核警告层与结构化审核报告 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.6
- 依据：`docs/specs/2026-08-04-p1d-6-warnings-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | AiWarning {category 七类, evidence, uncertainty, suggestion} |
| Q2 | agent-worker review.analyze handler（completeStructured + AiWarningGuard） |
| Q3 | 更新 AIReview.warnings（独立 status） |
| Q4 | warnings 不阻断 |
| Q5 | POST /versions/:id/review 同步硬阻断 + 异步入队 analyze |

## TDD 步骤

1. **agent-worker `reviewer.ts`**：
   - `WARNING_CATEGORIES` 七类常量 + `AiWarningGuard`（category 枚举 + evidence/uncertainty/suggestion 非空）
   - `reviewAnalyzeHandler(gateway, deps, task)`：payload {versionId, coreText} → completeStructured(AiWarningGuard) → saveWarnings
2. **domain `review/publish-review.ts` 扩展**：
   - `saveWarnings(deps, {versionId, warnings})`：AIReview upsert warnings（不触 status）
   - `getPublicationReview` 返回 warnings（已有）
3. **agent-worker `index.ts`**：注册 'review.analyze'
4. **API `routes/reviews.ts`**：POST /versions/:id/review 后异步入队 review.analyze（createAgentSession + submitAgentTask）
5. **单测**：AiWarningGuard 校验/handler 调 completeStructured/saveWarnings 不阻断
6. **集成测试**（云上）：review.analyze 任务（mock gateway）→ warnings 落库；GET review 返回 warnings；status 仍 passed
7. **本地门禁**
8. **云上集成测试**
9. **文档同步** + task-master 5.6 done

## 验收对照

- §11.2：七类警告 + 证据位置 + 不确定性 + 无单一分数 ✅
- §9.2：不裁定对错/不伪造来源（prompt 约束 + 登记）✅
- 警告不阻断 + 随版本存档 ✅
- §15：AIReview.warnings 结构化 ✅
- §21.2 步骤 7 ✅
- 既有 94/94 不回退

## 风险

- 异步入队需 session（review session）；analyze 触发在 review 后
- saveWarnings upsert：AIReview 可能不存在（直接 analyze）→ create 占位
