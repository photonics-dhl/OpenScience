# P1D-1 AI Gateway 统一路由与调用日志 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.1
- 依据：`docs/specs/2026-08-04-p1d-1-ai-gateway-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | fetch 直连 OpenAI 兼容端点（零依赖 + 可 mock） |
| Q2 | 配置化 fallbacks 列表（env），逐级回退记录原因 |
| Q3 | deps.audit 调用日志（ai.gateway.call）+ 脱敏 |
| Q4 | 手写 schema 守卫 + 重试上限 2 |
| Q5 | stream() 接口 + 占位 |

## TDD 步骤

1. **ai-gateway `errors.ts`**：AiGatewayError + 错误码（ALL_PROVIDERS_FAILED/SCHEMA_VALIDATION/NO_PROVIDER_CONFIG）
2. **ai-gateway `provider.ts`**：
   - `Provider` 接口：`complete({model, messages, temperature?, maxTokens?}) → {text, usage, model}`
   - `OpenAiCompatProvider`：fetch 直连 baseUrl/chat/completions，Bearer key；超时（AbortController）
   - `createProviderFromConfig(cfg)`：从 env 构造
3. **ai-gateway `gateway.ts`**：
   - `AiGateway` 类：`constructor({providers, primaryIndex?, audit?, logger?})`
   - `complete(messages, opts)`：primary → 失败逐级 fallback（fallbackReason 记录）→ 全败抛错 → audit log
   - `completeStructured(schema, prompt, opts)`：complete → parse → 手写守卫 → 失败重试 ≤2
   - `stream(messages, opts)`：接口 + 占位（5.3 实装）
   - 脱敏：audit 只记元数据（model/token/latency/error/fallbackReason），不记 prompt
4. **config api-env 扩展**：MINIMAX_BASE_URL/MINIMAX_API_KEY/MINIMAX_MODEL/FALLBACK_MODELS/AI_ENABLED
5. **单测**（ai-gateway/test/gateway.test.ts，mock fetch）：路由/回退/全败/结构化重试/脱敏
6. **集成测试**（apps/api/test/ai-gateway.integration.test.ts）：mock provider 注入 gateway → 审计行字段完整 + 无密钥
7. **本地门禁**
8. **云上集成测试**
9. **文档同步** + task-master 5.1 done

## 验收对照

- §9.3：统一 Gateway + 回退配置 + 调用日志 + Schema 校验重试 + 流式/结构化独立通道 + SDK 只在 ai-gateway ✅
- §17：密钥仅 env + 日志脱敏 ✅
- §24：MiniMax 配置占位 ✅
- 既有 84/84 不回退

## 风险

- fetch mock：global fetch 注入；超时测试
- config 无 MINIMAX env 时：AI_ENABLED=false，Gateway 懒加载不炸（占位模式）
