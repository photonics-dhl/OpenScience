import type { AuditSink } from '@openscience/observability';
import { AiGatewayError } from './errors';
import {
  DEFAULT_OCR_LIMITS,
  canonicalizeProviderResult,
  normalizeOcrProviderError,
  ocrPromptFor,
  sha256Text,
  validateAndSnapshotOcrRequest,
  validateCostEstimate,
  type ExternalProcessingPolicy,
  type OcrCostEstimate,
  type OcrLimits,
  type OcrPageOutcome,
  type OcrProvider,
  type OcrProviderPageRequest,
  type OcrRequest,
  type OcrResult,
  type ProviderCapability,
  type ProviderCapabilityDecision,
  type ProviderCapabilityPolicy,
} from './ocr';
import type { ChatMessage, Provider, ProviderResult } from './provider';

/** 调用日志（§9.3 + §17 脱敏：只记元数据，绝不记 prompt/附件/密钥）。 */
export interface GatewayCallLog {
  operation: 'text' | 'ocr';
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedInputTokens: number | null;
  estimatedOutputTokens: number | null;
  estimatedCostUsdMicros: number | null;
  actualCostUsdMicros: number | null;
  currency: 'USD';
  pricingVersion: string | null;
  pricingEffectiveDate: string | null;
  serviceTier: string | null;
  latencyMs: number;
  totalLatencyMs: number;
  promptHash: string;
  inputContentHash: string | null;
  pageNumbers: number[];
  pageCount: number;
  selectionReason: string | null;
  outcome: 'succeeded' | 'failed';
  error: string | null;
  fallbackReason: string | null;
  retryCount: number;
}

export interface AiGatewayOptions {
  /** 按序尝试的 providers（primary 在前）。 */
  providers: Provider[];
  /** Dedicated vision/OCR provider pool; text providers never receive images. */
  ocrProviders?: OcrProvider[];
  /** 缺省：第一条为 primary。 */
  primaryIndex?: number;
  /** §17 审计：调用日志落 AuditSink（action='ai.gateway.call'）；缺省 no-op。 */
  audit?: AuditSink;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  /** Evaluated immediately before every provider attempt. Failure disables that attempt. */
  killSwitch?: ProviderCapabilityPolicy;
  /** Trusted server-side authorization; missing/false/error fails closed before any bytes leave the Worker. */
  externalProcessingPolicy?: ExternalProcessingPolicy;
  ocrLimits?: Partial<OcrLimits>;
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
  private readonly ocrProviders: OcrProvider[];
  private readonly primaryIndex: number;
  private readonly audit?: AuditSink;
  private readonly logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly killSwitch?: ProviderCapabilityPolicy;
  private readonly externalProcessingPolicy?: ExternalProcessingPolicy;
  private readonly ocrLimits: Partial<OcrLimits>;

  constructor(opts: AiGatewayOptions) {
    if (opts.providers.length === 0) {
      throw new AiGatewayError('NO_PROVIDER_CONFIG', '未配置 AI Provider（§24 待确认）');
    }
    assertProviderPool(opts.providers, 'text');
    assertProviderPool(opts.ocrProviders ?? [], 'ocr');
    this.providers = [...opts.providers];
    this.ocrProviders = [...(opts.ocrProviders ?? [])];
    this.primaryIndex = opts.primaryIndex ?? 0;
    this.audit = opts.audit;
    this.logger = opts.logger;
    this.killSwitch = opts.killSwitch;
    this.externalProcessingPolicy = opts.externalProcessingPolicy;
    this.ocrLimits = { ...(opts.ocrLimits ?? {}) };
  }

  /** 文本补全：primary → fallbacks 逐级回退（§9.3 回退策略配置管理）。 */
  async complete(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<ProviderResult> {
    const totalStart = Date.now();
    const promptHash = sha256Text(JSON.stringify(messages));
    let lastError: unknown;
    const fallbackNotes: string[] = [];
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const isPrimary = i === this.primaryIndex;
      const capability = await this.providerEnabled(provider.name, 'text');
      if (!capability.enabled) {
        fallbackNotes.push(`${provider.name}:${capability.reason ?? 'disabled'}`);
        continue;
      }
      const attemptStart = Date.now();
      try {
        const result = await provider.complete({
          model: provider.model,
          messages,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        });
        await this.record({
          operation: 'text',
          provider: provider.name,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          estimatedInputTokens: null,
          estimatedOutputTokens: null,
          estimatedCostUsdMicros: null,
          actualCostUsdMicros: null,
          currency: 'USD',
          pricingVersion: null,
          pricingEffectiveDate: null,
          serviceTier: null,
          latencyMs: Date.now() - attemptStart,
          totalLatencyMs: Date.now() - totalStart,
          promptHash,
          inputContentHash: null,
          pageNumbers: [],
          pageCount: 0,
          selectionReason: null,
          outcome: 'succeeded',
          error: null,
          fallbackReason: isPrimary && fallbackNotes.length === 0 ? null : boundedFallbackReason(fallbackNotes),
          retryCount: i,
        });
        return result;
      } catch (e) {
        lastError = e;
        await this.record({
          operation: 'text',
          provider: provider.name,
          model: provider.model,
          inputTokens: 0,
          outputTokens: 0,
          estimatedInputTokens: null,
          estimatedOutputTokens: null,
          estimatedCostUsdMicros: null,
          actualCostUsdMicros: null,
          currency: 'USD',
          pricingVersion: null,
          pricingEffectiveDate: null,
          serviceTier: null,
          latencyMs: Date.now() - attemptStart,
          totalLatencyMs: Date.now() - totalStart,
          promptHash,
          inputContentHash: null,
          pageNumbers: [],
          pageCount: 0,
          selectionReason: null,
          outcome: 'failed',
          error: 'provider_error',
          fallbackReason: boundedFallbackReason(fallbackNotes),
          retryCount: i,
        });
        fallbackNotes.push(`${provider.name}:provider_error`);
        this.logger?.warn?.(`AI provider ${provider.name} failed; trying configured fallback`);
      }
    }
    throw new AiGatewayError('ALL_PROVIDERS_FAILED', '全部 AI Provider 失败', lastError);
  }

  /** Dedicated provider-neutral LLM OCR route; callers receive candidates, never replacement blocks. */
  async ocr(request: OcrRequest): Promise<OcrResult> {
    const canonical = validateAndSnapshotOcrRequest(request, this.ocrLimits);
    let decision: unknown = false;
    try {
      decision = await this.externalProcessingPolicy?.(Object.freeze({ ...canonical.authorizationContext })) ?? false;
    } catch {
      decision = false;
    }
    if (decision !== true) {
      throw new AiGatewayError('OCR_EXTERNAL_PROCESSING_DENIED', 'external processing denied');
    }

    const pages: OcrPageOutcome[] = [];
    for (const page of canonical.pages) {
      const prompt = ocrPromptFor(page.selectionReason);
      const providerRequest: OcrProviderPageRequest = {
        pageNumber: page.pageNumber,
        mediaType: page.mediaType,
        bytes: Uint8Array.from(page.bytes),
        width: page.width,
        height: page.height,
        selectionReason: page.selectionReason,
        prompt,
        promptHash: sha256Text(prompt),
        inputContentHash: page.contentHash,
      };
      pages.push(await this.routeOcrPage(providerRequest, canonical.source));
    }
    const succeeded = pages.filter((page) => page.status === 'succeeded').length;
    return {
      status: succeeded === pages.length ? 'succeeded' : succeeded === 0 ? 'failed' : 'partial',
      source: { ...canonical.source },
      inputContentHash: canonical.inputContentHash,
      pages,
    };
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
    this.logger?.info?.(`ai.gateway.call operation=${log.operation} provider=${log.provider} model=${log.model} outcome=${log.outcome} in=${log.inputTokens ?? 'unknown'} out=${log.outputTokens ?? 'unknown'} ms=${log.latencyMs}`);
  }

  private async routeOcrPage(
    request: OcrProviderPageRequest,
    source: { artifactId: string; documentSha256: string },
  ): Promise<OcrPageOutcome> {
    const totalStart = Date.now();
    const fallbackNotes: string[] = [];
    for (let index = 0; index < this.ocrProviders.length; index++) {
      const provider = this.ocrProviders[index];
      const capability = await this.providerEnabled(provider.name, 'ocr');
      if (!capability.enabled) {
        const reason = capability.reason ?? 'disabled';
        await this.record(ocrLog({
          request,
          provider: provider.name,
          model: provider.model,
          latencyMs: 0,
          totalLatencyMs: Date.now() - totalStart,
          retryCount: index,
          fallbackReason: boundedFallbackReason(fallbackNotes),
          outcome: 'failed',
          error: 'provider_disabled',
          inputTokens: null,
          outputTokens: null,
          actualCostUsdMicros: null,
        }));
        fallbackNotes.push(`${provider.name}:${reason}`);
        continue;
      }
      const attemptStart = Date.now();
      let estimate: OcrCostEstimate | undefined;
      try {
        estimate = validateCostEstimate(provider.estimate(request));
        const result = canonicalizeProviderResult(await provider.recognize({ ...request, bytes: Uint8Array.from(request.bytes) }), this.ocrLimits.maxOutputChars ?? DEFAULT_OCR_LIMITS.maxOutputChars);
        const fallbackReason = boundedFallbackReason(fallbackNotes);
        await this.record(ocrLog({
          request,
          provider: provider.name,
          model: provider.model,
          estimate,
          latencyMs: Date.now() - attemptStart,
          totalLatencyMs: Date.now() - totalStart,
          retryCount: index,
          fallbackReason,
          outcome: 'succeeded',
          error: null,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          actualCostUsdMicros: result.actualCostUsdMicros,
        }));
        return {
          status: 'succeeded',
          pageNumber: request.pageNumber,
          candidate: {
            text: result.text,
            source: 'llm_ocr_candidate',
            provider: provider.name,
            model: provider.model,
            pageNumber: request.pageNumber,
            bbox: { x: 0, y: 0, width: request.width, height: request.height },
            selectionReason: request.selectionReason,
            promptVersion: 'openscience-ocr-v1',
            promptHash: request.promptHash,
            inputContentHash: request.inputContentHash,
            artifactId: source.artifactId,
            documentSha256: source.documentSha256,
            ...(fallbackReason ? { fallbackReason } : {}),
          },
        };
      } catch (error) {
        const code = normalizeOcrProviderError(error);
        await this.record(ocrLog({
          request,
          provider: provider.name,
          model: provider.model,
          estimate,
          latencyMs: Date.now() - attemptStart,
          totalLatencyMs: Date.now() - totalStart,
          retryCount: index,
          fallbackReason: boundedFallbackReason(fallbackNotes),
          outcome: 'failed',
          error: code,
          inputTokens: null,
          outputTokens: null,
          actualCostUsdMicros: null,
        }));
        fallbackNotes.push(`${provider.name}:${code}`);
        this.logger?.warn?.(`AI OCR provider ${provider.name} failed with ${code}; trying configured fallback`);
      }
    }
    return { status: 'failed', pageNumber: request.pageNumber, code: 'providers_unavailable', retryable: true };
  }

  private async providerEnabled(provider: string, capability: ProviderCapability): Promise<ProviderCapabilityDecision> {
    if (!this.killSwitch) {
      return capability === 'text' ? { enabled: true } : { enabled: false, reason: 'policy_missing' };
    }
    try {
      const decision = await this.killSwitch.isEnabled(provider, capability);
      if (typeof decision !== 'object' || decision === null) return { enabled: false, reason: 'policy_invalid' };
      const enabled: unknown = decision.enabled;
      if (enabled !== true && enabled !== false) return { enabled: false, reason: 'policy_invalid' };
      return enabled === true
        ? { enabled: true }
        : { enabled: false, reason: safePolicyReason(decision.reason) };
    } catch {
      return { enabled: false, reason: 'policy_unavailable' };
    }
  }
}

interface OcrLogInput {
  request: OcrProviderPageRequest;
  provider: string;
  model: string;
  estimate?: OcrCostEstimate;
  latencyMs: number;
  totalLatencyMs: number;
  retryCount: number;
  fallbackReason: string | null;
  outcome: 'succeeded' | 'failed';
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  actualCostUsdMicros: number | null;
}

function ocrLog(input: OcrLogInput): GatewayCallLog {
  return {
    operation: 'ocr',
    provider: input.provider,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    estimatedInputTokens: input.estimate?.inputTokens ?? null,
    estimatedOutputTokens: input.estimate?.outputTokens ?? null,
    estimatedCostUsdMicros: input.estimate?.costUsdMicros ?? null,
    actualCostUsdMicros: input.actualCostUsdMicros,
    currency: 'USD',
    pricingVersion: input.estimate?.pricingVersion ?? null,
    pricingEffectiveDate: input.estimate?.effectiveDate ?? null,
    serviceTier: input.estimate?.serviceTier ?? null,
    latencyMs: input.latencyMs,
    totalLatencyMs: input.totalLatencyMs,
    promptHash: input.request.promptHash,
    inputContentHash: input.request.inputContentHash,
    pageNumbers: [input.request.pageNumber],
    pageCount: 1,
    selectionReason: input.request.selectionReason,
    outcome: input.outcome,
    error: input.error,
    fallbackReason: input.fallbackReason,
    retryCount: input.retryCount,
  };
}

function assertProviderPool(providers: ReadonlyArray<{ name: string; model: string }>, label: string): void {
  const names = new Set<string>();
  for (const provider of providers) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(provider.name) || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(provider.model) || names.has(provider.name)) {
      throw new AiGatewayError('NO_PROVIDER_CONFIG', `invalid or duplicate ${label} provider`);
    }
    names.add(provider.name);
  }
}

function safePolicyReason(reason: unknown): string {
  return typeof reason === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(reason) ? reason : 'disabled';
}

function boundedFallbackReason(notes: string[]): string | null {
  return notes.length === 0 ? null : notes.join(',').slice(0, 400);
}
