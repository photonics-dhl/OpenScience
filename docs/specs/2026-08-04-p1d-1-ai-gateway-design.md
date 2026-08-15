# P1D-1 AI Gateway 统一路由与调用日志 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.1（MiniMax-M3 主模型 + 回退策略 + 调用日志）
- 依据：Spec §2.4-6、§9.3、§17、§24
- 现状：packages/ai-gateway 空壳；config api-env 模式现成

---

## 需求基线

1. 主模型 MiniMax-M3（§24 待确认具体 API/ID），回退策略 Gateway 配置管理（§9.3）
2. Provider SDK 只在 ai-gateway 包内，禁止散落业务代码（§9.3）
3. 每次调用记录：模型、版本、token、费用、延迟、错误、回退原因（§9.3）
4. 日志脱敏：不记录密钥与 Prompt 敏感附件（§17）
5. JSON 结构化输出经 Schema 校验，失败有限重试（§9.3）
6. 流式响应与结构化输出独立通道（§9.3）
7. 主模型失败按配置回退策略切换并记录回退原因（§9.3）
8. 密钥仅环境变量（§17）；AI 接口限流（§17）
9. §24：MiniMax-M3 具体配置先占位不写死

## 架构决策（拟）

### Provider 抽象（Q1）

- `Provider` 接口：`complete(opts: {model, messages, temperature?, maxTokens?}): Promise<ProviderResult>`
- `ProviderResult`：`{text, usage: {inputTokens, outputTokens}, model}`
- `MiniMaxProvider`：普通 API Key 调用 MiniMax OpenAI 兼容 API；Token Plan Subscription Key 按 ADR-008 调用 Anthropic Messages 兼容 API。baseUrl/modelId 从 env 注入，协议实现仅在 ai-gateway 内
- 无第三方 SDK 依赖（用 fetch 直连 OpenAI 兼容端点，避免 SDK 版本锁定）——**选 fetch 而非 SDK**（零依赖 + 可 mock）

### 路由与回退（Q2）

- `GatewayConfig`：`{primary: ProviderConfig, fallbacks: ProviderConfig[]}` 从 env 读取（MINIMAX_BASE_URL/MINIMAX_API_KEY/MINIMAX_MODEL 等，§24 配置位）
- `complete()`：primary 失败 → 逐个 fallback（记录回退原因）+ 全部失败 → 抛错
- 回退判定：网络错误/非 2xx/超时（结构化解析失败不走回退，走重试）

### 调用日志（Q3）

- `CallLog`：`{provider, model, inputTokens, outputTokens, latencyMs, error?, fallbackReason?, retryCount, ts}`
- 写 AuditSink（deps.audit，action='ai.gateway.call'）+ 日志（console/logger，脱敏）
- **脱敏**：log 只记元数据（token/延迟/错误码），**绝不记 prompt/附件/密钥**（§17）

### 结构化输出（Q4）

- `completeStructured(schema, prompt, opts)`：complete → JSON.parse → ajv/手写 schema 校验 → 失败重试（上限 N=2）
- Schema 校验用轻量手写 validate 函数（sdf-schema 模式，避免 ajv 依赖）——**或复用已有 ajv？** 查依赖。先手写类型守卫（P1B-1 sdf-schema 已手写 JSON Schema + ajv？）——若 ajv 已依赖可复用
- 流式 `stream()`：独立通道（§9.3 独立通道），返回 ReadableStream；本期实现接口 + 占位（实际流式消费在 5.3 Extractor）

### 密钥 + 限流（Q5）

- 密钥仅 env（MINIMAX_API_KEY），config loadApiEnv 扩展
- 限流：RATE_LIMIT_ROUTES 加 AI 端点（5.2 建 /agent 时挂接）——本期 Gateway 内部限流（token 桶，防单用户打爆）可选，登记

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | Provider SDK vs fetch？ | fetch 直连 OpenAI 兼容端点（零依赖 + 可 mock；MiniMax 兼容 OpenAI API） | 官方 SDK（版本锁定 + mock 难） |
| Q2 | 回退策略形态？ | 配置化 fallbacks 列表（env：PRIMARY_MODEL + FALLBACK_MODELS 逗号分隔），primary 失败逐级回退 | 业务代码硬编码（违反 §9.3） |
| Q3 | 调用日志去向？ | deps.audit（AuditSink，action='ai.gateway.call'）+ 脱敏 console | 仅 console（审计缺失 §17） |
| Q4 | 结构化校验/重试？ | 手写 schema 守卫（复用 sdf-schema 模式）+ 重试上限 2 | ajv 依赖（重） |
| Q5 | 流式通道？ | stream() 接口 + 占位实现（5.3 消费时实装） | 本期不做（独立通道 §9.3 MUST 需接口） |

---

## 测试策略

- **单测**（ai-gateway，mock fetch）：
  - 路由：primary 成功 → 无回退
  - 回退：primary 失败 → fallback 调用 + fallbackReason 记录
  - 全失败 → 抛错
  - Schema 校验失败 → 重试上限 2 → 超过抛错
  - 脱敏：日志无 prompt/密钥
- **集成测试**（云上，mock provider 注入）：
  - 调用日志字段完整（模型/token/延迟）
  - 密钥不落日志
- 既有 84/84 不回退

---

## 涉及模块

- `packages/ai-gateway/src/provider.ts`（Provider 接口 + MiniMax fetch 实现）
- `packages/ai-gateway/src/gateway.ts`（路由/回退/日志/结构化/流式）
- `packages/ai-gateway/src/errors.ts`
- `packages/config/src/api-env.ts`（MINIMAX_* env 扩展）
- `apps/api/test/`（集成测试）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.1 done + 文档同步
