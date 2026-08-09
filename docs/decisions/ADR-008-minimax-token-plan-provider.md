# ADR-008 — MiniMax Token Plan provider 与双 Subscription Key 回退

- 状态：Accepted
- 日期：2026-08-10
- 关联：Baseline §9.3、ADR-002、`docs/specs/2026-08-04-p1d-1-ai-gateway-design.md`

## Context

生产 ingestion 已证明 Artifact 上传、SeaweedFS Blob、Redis dispatch 与 worker claim 可达，但 Hermes SDF 提取进入 `failed_retryable`。脱敏检查发现 worker 未配置 AI；进一步核对 MiniMax 最新官方文档后确认：Token Plan 的 Subscription Key 与普通 pay-as-you-go API Key 不可互换，Token Plan Quick Start 使用 Anthropic Messages 协议与 `https://api.minimax.io/anthropic`，而既有 Gateway 只实现 OpenAI `/chat/completions`。

官方依据：

- [Token Plan Quick Start](https://platform.minimax.io/docs/token-plan/quickstart)
- [Token Plan FAQ](https://platform.minimax.io/docs/token-plan/faq)
- [OpenAI-compatible Chat Completions](https://platform.minimax.io/docs/api-reference/text-chat-openai)

## Decision

1. Provider SDK/HTTP 仍只存在于 `packages/ai-gateway`；worker 不直接调用 MiniMax。
2. 新增 Anthropic Messages 兼容 provider：`POST /v1/messages`、`x-api-key`、`anthropic-version`，system message 与 text blocks 显式转换，日志不含 prompt、响应正文或 key。
3. `MINIMAX_API_MODE=auto` 时，`sk-cp-` Subscription Key 自动选择 Token Plan provider；普通 API Key 继续使用 OpenAI-compatible provider。也可显式指定 `anthropic` 或 `openai`。
4. key1 使用 `MINIMAX_API_KEY`，key2 使用 `MINIMAX_API_KEY_2`；Provider 链按 key1→key2 排序，网络、HTTP 非 2xx 或 provider 错误由 Gateway 统一回退。
5. Provider 的审计名称与实际 model ID 分离，避免为了标识 key 槽位而把错误名称发送给模型端点。
6. 生产 Secret 仅从服务器环境注入；仓库只登记空模板。Token Plan 官方说明其更适合个人交互开发，正式多用户生产需迁移到 pay-as-you-go 或独立商业额度。

## Consequences

- 当前 Token Plan 可用于受控内测与已同意的异步 Hermes 任务，key1 配额/限流失败可回退 key2。
- Subscription Key 不能被当作普通 API Key 复用；切换计费形态时必须同时核对协议、base URL 与模型覆盖。
- Token Plan 的滚动窗口和动态限流意味着 provider 失败仍须保持 `failed_retryable`，不能把外部额度不足标为内容永久失败。
