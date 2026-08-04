# P1D-6 发布审核警告层与结构化审核报告 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.6（§11.2 七类警告 + 结构化报告）
- 依据：Spec §2.3-5、§9.2、§11.2、§15 AIReview
- 现状：ai_reviews 表迁移 16 已建（warnings Json 列现成）；ai-gateway completeStructured 就绪；agent-worker handler 通路就绪

---

## 需求基线

1. 警告项覆盖 §11.2 全部七类：方法逻辑疑点 / 统计合理性 / 图表规范 / 数据一致性 / 可复现性不足 / 潜在引用缺失 / 结论过度外推
2. AI 报告必须提供证据位置 + 不确定性说明，不得只输出单一分数（§11.2）
3. Research Reviewer 不裁定研究一定正确/错误；Citation Checker 不伪造来源（§9.2 禁止事项）
4. 警告不阻断发布，随版本存档 + 公开页 AI 审核摘要展示（P1D-9 用，§4.3）
5. 报告结构化存 AIReview 实体（§15）
6. 验收步骤 7：含警告版本仍可发布 + 警告随审核记录可查

## 架构决策（拟）

### 警告报告 Schema（Q1）

```ts
AiWarning {
  id: string;
  category: 'method_logic'|'statistical'|'figure_spec'|'data_consistency'|'reproducibility'|'missing_citation'|'overreach';
  evidence: string;    // 证据位置（§11.2 必须）
  uncertainty: string; // 不确定性说明（§11.2 必须）
  suggestion: string;  // 建议（不替代作者判断 §2.3-5）
}
```

### 分析 handler（Q2，agent-worker）

- `review.analyze` handler：payload {versionId, coreText, artifacts?}
  - 调 ai-gateway completeStructured(AiWarningGuard, prompt) → 生成 warnings
  - 结果写 AIReview.warnings（upsert by versionId，复用 P1D-5 runPublicationReview 的 upsert 或独立函数）
  - 不阻断（仅 warnings 更新，status 不变）
- AiWarningGuard：结构化校验（category 枚举 + evidence/uncertainty/suggestion 非空字符串）

### 存储（Q3）

- `saveWarnings(deps, {versionId, warnings})`：AIReview upsert warnings（若 review 不存在 → 建 status='passed' 占位？—— 不，需结合硬阻断。简化：warning 分析独立 upsert warnings 字段，不动 status/hardBlocks）
- 复用 P1D-5 runPublicationReview：它建/更新 AIReview。P1D-6 在其后调用分析，更新 warnings

### 不阻断 + 可查（Q4）

- warnings 更新不触发 blocked（status 独立）
- `GET /versions/:versionId/review` 返回 warnings（P1D-5 已有，扩展返回 warnings 非空）
- P1D-9 公开页读 warnings 渲染 AI 审核摘要

### 触发方式（Q5）

- 前端「AI 审核」按钮 → POST /agent/tasks (kind='review.analyze') → 轮询 → warnings 落库
- 或并入 POST /versions/:id/review（硬阻断 + 分析串联）——**串联更顺**：runPublicationReview 后自动触发分析（异步任务？同步慢）。推荐：POST /versions/:id/review 同步做硬阻断 + 异步入队 review.analyze；GET 返回既有 warnings（异步完成后）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 警告 Schema？ | AiWarning {category 七类枚举, evidence, uncertainty, suggestion} | 自由文本（无法结构化展示/校验） |
| Q2 | 分析落点？ | agent-worker `review.analyze` handler（completeStructured + AiWarningGuard） | API 同步分析（慢，阻塞） |
| Q3 | 存储？ | 更新 AIReview.warnings（upsert warnings 字段，独立于 status） | 新表（§15 AIReview 已有 warnings 列，零迁移） |
| Q4 | 不阻断？ | warnings 更新不动 status（硬阻断独立） | warnings 也算阻断（违 §11.2 不阻断） |
| Q5 | 触发？ | POST /versions/:id/review 同步硬阻断 + 异步入队 analyze；GET 返回 warnings | 前端单独按钮（两处入口） |

---

## 测试策略

- **单测**（ai-gateway/worker）：
  - AiWarningGuard 校验（category 枚举 + evidence/uncertainty 非空；缺失拒绝）
  - review.analyze handler 调 completeStructured + 写 warnings
  - 不阻断：warnings 更新后 status 不变
- **集成测试**（云上）：
  - 提交 review.analyze（mock gateway）→ 完成 → AIReview.warnings 有结构化报告（evidence + uncertainty，无单一分数）
  - 含警告版本 status 仍 passed（可发布）
- 既有 94/94 不回退

---

## 涉及模块

- `apps/agent-worker/src/reviewer.ts`：AiWarningGuard + reviewAnalyzeHandler
- `apps/agent-worker/src/index.ts`：注册 'review.analyze'
- `packages/domain/src/review/publish-review.ts`：加 saveWarnings + getPublicationReview 返回 warnings
- `apps/api/src/routes/reviews.ts`：POST /versions/:id/review 后异步入队 analyze
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. handler + 存储 + 触发 + 测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.6 done + 文档同步
