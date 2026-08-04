# P1D-3 SDF Extractor 建议式提取与确认写入 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.3（六字段提取建议 + §5.4 确认写入）
- 依据：Spec §2.1-2、§5.1、§5.4、§9.2、§9.3
- 现状：ai-gateway 就绪（completeStructured）；agent-worker handler 注册表（demo.echo）；sdf-schema coreSchema JSON Schema；编辑器 SuggestionsPanel 已支持 source: 'extractor'（P1B-8 占位通路）

---

## 需求基线

1. SDF Extractor 从正文提取六字段与关系草案（§9.2）
2. 提取结果以建议/差异形式展示，用户确认后才写入 SDF（§5.4 MUST）
3. 输出必须经 Gateway Schema 校验（六字段对应 sdf-schema JSON Schema，§5.1/§5.3）
4. 禁止直接覆盖用户正文（§9.2 禁止事项）
5. 编辑器右栏逐字段 diff，逐字段或整批接受/拒绝（§5.4）
6. 接受动作走 R1 级审批（P1D-4 统一 diff 批量批准——本期建议落草稿，R1 挂接 P1D-4）
7. 提取为长任务，走 P1D-2 异步通道 + 进度（§9.3）
8. 验收步骤 4/5：输入正文 → AI 提取六字段 → 审核并接受建议

## 架构决策（拟）

### Extractor handler（Q1，agent-worker）

- `sdf.extract` handler：
  1. 读 payload {researchObjectId, manuscriptText}
  2. `aiGateway.completeStructured(sdfCoreGuard, prompt)`：提取六字段 JSON
  3. sdfCoreGuard：基于 sdf-schema coreSchema 的类型守卫（六字段 string + schemaVersion）
  4. 返回 {core: {六字段}} → markTaskProgress result
- 不写 SDF（§9.2 禁止直接覆盖正文）——提取只产出建议

### 建议 API（Q2）

- 复用 P1D-2 任务通道：前端 POST /agent/tasks (kind='sdf.extract') → 轮询 GET /agent/tasks/:id → result.core 建议
- 前端把 result.core 转 AiSuggestion[]（source: 'extractor'）→ SuggestionsPanel 现成通路展示
- 无需新表（建议是任务 result，非持久化实体）

### 确认写入（Q3，§5.4）

- 前端 applySuggestion 已实现：仅写草稿（localStorage），不直接写 SDF（P1B-8 editor-state）
- 用户点「保存到 SDF」→ updateSdf（乐观锁）→ 落库（既有流程）
- R1 批量批准挂接：P1D-4 实现时把「整批接受」动作升级为统一 diff 审批（本期保留现前逐字段 apply）

### 进度显示（Q4）

- 编辑器右栏在提取中显示任务进度（轮询 task.progress）+ 完成显示建议

### 鉴权（Q5）

- 提取任务提交走 /agent/tasks（已有配额 + 权限校验）；建议读取 task result 需归属（getAgentTask 已校验）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | Extractor 落点？ | agent-worker `sdf.extract` handler（调 ai-gateway completeStructured + sdfCoreGuard） | API 同步提取（非异步，§9.3 违） |
| Q2 | 建议存储？ | 任务 result 承载（无新表），前端轮询转 AiSuggestion | 建议表持久化（重，建议生命周期短） |
| Q3 | 确认写入？ | 复用 P1B-8 applySuggestion 草稿 + updateSdf 落库（§5.4）；R1 挂接 P1D-4 | 新写建议确认 UI（重复） |
| Q4 | 进度显示？ | 右栏轮询 task.progress + 完成渲染建议 | 无进度（§18.3 违） |
| Q5 | 前端触发？ | 编辑器右栏「AI 提取」按钮 → POST /agent/tasks (kind=sdf.extract) | 自动触发（打扰） |

---

## 测试策略

- **单测**（ai-gateway/worker）：
  - sdfCoreGuard 校验（合法六字段通过；非法拒绝）
  - extract handler 调 completeStructured + 不写 SDF（无 prisma.write）
- **集成测试**（云上）：
  - 提交 sdf.extract 任务（mock gateway 注入）→ 完成 → result.core 六字段
  - 前端转换：result.core → AiSuggestion[]（field/before/suggestion/source='extractor'）
- 既有 88/88 不回退

---

## 涉及模块

- `apps/agent-worker/src/extractor.ts`：sdfCoreGuard + extract handler
- `apps/agent-worker/src/index.ts`：注册 'sdf.extract'
- `apps/web/lib/api.ts`：submitExtractTask（POST /agent/tasks）+ 轮询
- `apps/web/lib/suggestions.ts`：coreToSuggestions（result → AiSuggestion[]）
- `apps/web/components/editor/SuggestionsPanel.tsx`：AI 提取按钮 + 进度（增强现有）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. worker handler + 前端通路 + 测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.3 done + 文档同步
