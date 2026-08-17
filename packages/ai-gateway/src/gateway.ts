import type { AuditSink } from '@openscience/observability';
import { AiGatewayError } from './errors';
import type { ChatMessage, Provider, ProviderResult } from './provider';

/** 调用日志（§9.3 + §17 脱敏：只记元数据，绝不记 prompt/附件/密钥）。 */
export interface GatewayCallLog {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  error?: string;
  fallbackReason?: string;
  retryCount: number;
}

export interface AiGatewayOptions {
  /** 按序尝试的 providers（primary 在前）。 */
  providers: Provider[];
  /** 缺省：第一条为 primary。 */
  primaryIndex?: number;
  /** §17 审计：调用日志落 AuditSink（action='ai.gateway.call'）；缺省 no-op。 */
  audit?: AuditSink;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/** 结构化输出 Schema 校验器（§9.3：JSON 输出必须经 Schema 校验）。 */
export type SchemaGuard<T> = (value: unknown) => value is T;

const MAX_STRUCTURED_RETRIES = 2; // §9.3 失败有限重试

function parseStructuredJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
  try { return JSON.parse(cleaned); } catch { /* providers may append a short explanation */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('structured output is not JSON');
}

/**
 * AI Gateway 统一入口（§9.3）：
 * - complete：primary 失败逐级回退（fallbackReason 记录）→ 全败抛错
 * - completeStructured：Schema 校验 + 有限重试
 * - stream：流式独立通道接口（5.3 实装）
 */
export class AiGateway {
  private readonly providers: Provider[];
  private readonly primaryIndex: number;
  private readonly audit?: AuditSink;
  private readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(opts: AiGatewayOptions) {
    if (opts.providers.length === 0) {
      throw new AiGatewayError('NO_PROVIDER_CONFIG', '未配置 AI Provider（§24 待确认）');
    }
    this.providers = opts.providers;
    this.primaryIndex = opts.primaryIndex ?? 0;
    this.audit = opts.audit;
    this.logger = opts.logger;
  }

  /** 文本补全：primary → fallbacks 逐级回退（§9.3 回退策略配置管理）。 */
  async complete(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<ProviderResult> {
    const start = Date.now();
    let lastError: unknown;
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const isPrimary = i === this.primaryIndex;
      try {
        const result = await provider.complete({
          model: provider.model,
          messages,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        });
        await this.record({
          provider: provider.name,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          latencyMs: Date.now() - start,
          fallbackReason: isPrimary ? undefined : `主模型 ${this.providers[this.primaryIndex].name} 失败回退`,
          retryCount: i,
        });
        return result;
      } catch (e) {
        lastError = e;
        await this.record({
          provider: provider.name,
          model: provider.model,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - start,
          error: e instanceof Error ? e.message.slice(0, 200) : String(e),
          retryCount: i,
        });
        this.logger?.warn?.(`AI provider ${provider.name} 失败，尝试回退: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    throw new AiGatewayError('ALL_PROVIDERS_FAILED', '全部 AI Provider 失败', lastError);
  }

  /** 结构化输出：complete → JSON.parse → Schema 校验 → 失败重试（上限 2）。 */
  async completeStructured<T>(
    guard: SchemaGuard<T>,
    messages: ChatMessage[],
    opts: { temperature?: number } = {},
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_STRUCTURED_RETRIES; attempt++) {
      try {
        const result = await this.complete(messages, { temperature: opts.temperature, maxTokens: 4096 });
        const parsed: unknown = parseStructuredJson(result.text);
        if (!guard(parsed)) {
          throw new AiGatewayError('SCHEMA_VALIDATION', `结构化输出未通过 Schema 校验（第 ${attempt + 1} 次）`);
        }
        return parsed;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_STRUCTURED_RETRIES) {
          this.logger?.warn?.(`结构化输出校验失败，重试 ${attempt + 1}/${MAX_STRUCTURED_RETRIES}`);
        }
      }
    }
    throw new AiGatewayError('SCHEMA_VALIDATION', '结构化输出超过重试上限', lastError);
  }

  /** 流式独立通道（§9.3）：接口预留，5.3 SDF Extractor 实装。 */
  async stream(messages: ChatMessage[], opts: { temperature?: number } = {}): Promise<ReadableStream<Uint8Array>> {
    void messages;
    void opts;
    throw new AiGatewayError('STREAM_NOT_IMPLEMENTED', '流式通道在 P1D-3 实装（§9.3 独立通道）');
  }

  /** 调用日志（§17 脱敏：仅元数据）；审计故障不得重放已计费的 provider 调用。 */
  private async record(log: GatewayCallLog): Promise<void> {
    try {
      await this.audit?.record({
        actorId: null,
        action: 'ai.gateway.call',
        targetType: 'ai_gateway',
        metadata: { ...log, ts: new Date().toISOString() },
      });
    } catch (error) {
      this.logger?.error?.(`ai.gateway.audit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.logger?.info?.(`ai.gateway.call provider=${log.provider} model=${log.model} in=${log.inputTokens} out=${log.outputTokens} ms=${log.latencyMs}`);
  }
}
