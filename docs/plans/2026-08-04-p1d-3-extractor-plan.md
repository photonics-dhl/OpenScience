# P1D-3 SDF Extractor 建议式提取与确认写入 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.3
- 依据：`docs/specs/2026-08-04-p1d-3-extractor-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | agent-worker `sdf.extract` handler（completeStructured + sdfCoreGuard） |
| Q2 | 建议存任务 result（无新表） |
| Q3 | 复用 P1B-8 applySuggestion 草稿 + updateSdf 落库；R1 挂 P1D-4 |
| Q4 | 右栏轮询 task.progress |
| Q5 | 「AI 提取」按钮显式触发 |

## TDD 步骤

1. **agent-worker `extractor.ts`**：
   - `sdfCoreGuard`：六字段 string 类型守卫（对齐 sdf-schema SDF_CORE_FIELDS + schemaVersion）
   - `extractHandler(gateway, deps, task)`：读 payload {manuscriptText} → completeStructured(sdfCoreGuard, prompt) → 返回 {core}
2. **agent-worker `index.ts`**：注册 'sdf.extract'（用注入 gateway）
3. **前端 `lib/api.ts`**：`submitExtractTask(roId, manuscriptText)` → POST /agent/tasks（session + kind='sdf.extract'）+ 轮询 getAgentTask
4. **前端 `lib/suggestions.ts`**：`coreToSuggestions(core)` → AiSuggestion[]（field/before/suggestion/source='extractor'，仅非空建议）
5. **前端 `SuggestionsPanel.tsx`**：加「AI 提取」按钮 + 进度显示（轮询）→ 完成 coreToSuggestions 注入
6. **单测**：sdfCoreGuard（合法/非法）、extractHandler 不写 SDF、coreToSuggestions
7. **集成测试**（云上）：sdf.extract 任务（mock gateway）→ 完成 → result.core 六字段
8. **本地门禁**（next build）
9. **云上集成测试**
10. **文档同步** + task-master 5.3 done

## 验收对照

- §5.4：建议/差异展示 + 确认后才写入 ✅
- §9.2：提取不覆盖正文 ✅
- §9.3：异步长任务 + 进度 ✅
- §5.1/§5.3：输出经 Schema 校验 ✅
- §21.2 步骤 4/5 ✅
- 既有 88/88 不回退

## 风险

- gateway 注入 worker：worker main 构造 gateway（env.ai）；handler 依赖 gateway
- 前端 SuggestionsPanel 需加 state（extracting/progress）
