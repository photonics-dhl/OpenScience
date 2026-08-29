import {
  OcrProviderError,
  type OcrCostEstimate,
  type OcrProvider,
  type OcrProviderPageRequest,
  type OcrProviderResult,
  validateProviderPageRequest,
} from './ocr';

/** AI Provider 抽象（§9.3：Provider SDK 只存在于 ai-gateway 包内）。 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult {
  text: string;
  usage: Usage;
  model: string;
}

export interface ProviderConfig {
  /** §24 待确认：MiniMax-M3 及回退模型具体 API（OpenAI 兼容 /chat/completions）。 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  complete(opts: CompleteOptions): Promise<ProviderResult>;
}

/**
 * OpenAI 兼容 Provider（fetch 直连，Q1 决策：零 SDK 依赖 + 可 mock）。
 * MiniMax 提供 OpenAI 兼容端点（§24 待确认具体版本，按标准 /chat/completions 实现）。
 */
export class OpenAiCompatProvider implements Provider {
  constructor(
    readonly name: string,
    private readonly cfg: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  get model(): string {
    return this.cfg.model;
  }

  async complete(opts: CompleteOptions): Promise<ProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000); // 60s 超时（§9.3 长任务异步）
    try {
      const res = await this.fetcher(`${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Provider ${this.name} HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error(`Provider ${this.name} 空响应`);
      return {
        text,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        model: data.model ?? opts.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Anthropic Messages 兼容 Provider；MiniMax Token Plan Subscription Key 使用该协议。 */
export class AnthropicCompatProvider implements Provider {
  constructor(
    readonly name: string,
    private readonly cfg: ProviderConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  get model(): string {
    return this.cfg.model;
  }

  async complete(opts: CompleteOptions): Promise<ProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const system = opts.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n');
      const messages = opts.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: message.content }));
      const res = await this.fetcher(`${this.cfg.baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: opts.model,
          system: system || undefined,
          messages,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens ?? 4096,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Provider ${this.name} HTTP ${res.status}`);
      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
      };
      const text = data.content
        ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n') ?? '';
      if (!text) throw new Error(`Provider ${this.name} 空响应`);
      return {
        text,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
        model: data.model ?? opts.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface MiniMaxVisionPricing {
  usdMicrosPerPage: number;
  version: string;
  effectiveDate: string;
  serviceTier: string;
}

export interface MiniMaxVisionConfig extends ProviderConfig {
  pricing?: MiniMaxVisionPricing;
  maxPageBytes?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

const OFFICIAL_MINIMAX_VISION_ORIGINS = new Set(['https://api.minimax.io', 'https://api.minimaxi.com']);
const MAX_VISION_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_VISION_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_VISION_TIMEOUT_MS = 120_000;

/**
 * MiniMax Coding Plan VLM transport. This is intentionally separate from text
 * chat: MiniMax's official MCP uses POST /v1/coding_plan/vlm for one image.
 */
export class MiniMaxCodingPlanVisionProvider implements OcrProvider {
  private readonly maxPageBytes: number;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(
    readonly name: string,
    private readonly cfg: MiniMaxVisionConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {
    this.maxPageBytes = cfg.maxPageBytes ?? 4 * 1024 * 1024;
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
    this.maxResponseBytes = cfg.maxResponseBytes ?? 2 * 1024 * 1024;
    if (!cfg.apiKey || !cfg.model || !validLimit(this.maxPageBytes, MAX_VISION_PAGE_BYTES) ||
      !validLimit(this.maxResponseBytes, MAX_VISION_RESPONSE_BYTES) || !validLimit(this.timeoutMs, MAX_VISION_TIMEOUT_MS)) {
      throw new OcrProviderError('provider_error', 'MiniMax vision configuration limit is invalid');
    }
    const url = new URL(cfg.baseUrl);
    if (!OFFICIAL_MINIMAX_VISION_ORIGINS.has(url.origin) || url.username || url.password ||
      (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) {
      throw new OcrProviderError('provider_error', 'MiniMax vision base URL must be an exact official origin');
    }
  }

  get model(): string {
    return this.cfg.model;
  }

  estimate(): OcrCostEstimate {
    return {
      inputTokens: null,
      outputTokens: null,
      costUsdMicros: this.cfg.pricing?.usdMicrosPerPage ?? null,
      currency: 'USD',
      pricingVersion: this.cfg.pricing?.version ?? 'unconfigured',
      effectiveDate: this.cfg.pricing?.effectiveDate ?? null,
      serviceTier: this.cfg.pricing?.serviceTier ?? 'unknown',
    };
  }

  async recognize(request: OcrProviderPageRequest): Promise<OcrProviderResult> {
    validateProviderPageRequest(request, this.maxPageBytes);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetcher(`${this.cfg.baseUrl.replace(/\/$/, '')}/v1/coding_plan/vlm`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.cfg.apiKey}`,
          },
          body: JSON.stringify({
            prompt: request.prompt,
            image_url: `data:${request.mediaType};base64,${Buffer.from(request.bytes).toString('base64')}`,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw new OcrProviderError('provider_timeout', 'MiniMax vision timeout');
        throw new OcrProviderError('provider_error', 'MiniMax vision request failed');
      }
      if (!response.ok) throw new OcrProviderError('provider_http', `MiniMax vision HTTP ${response.status}`);
      const raw = await readBoundedResponse(response, this.maxResponseBytes);
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new OcrProviderError('provider_response_invalid', 'MiniMax vision returned invalid JSON');
      }
      if (!isMiniMaxVisionResponse(data)) throw new OcrProviderError('provider_response_invalid', 'MiniMax vision response shape invalid');
      const status = data.base_resp?.status_code ?? 0;
      if (status !== 0) throw new OcrProviderError('provider_status', `MiniMax vision status ${status}`);
      if (typeof data.content !== 'string' || data.content.trim().length === 0) {
        throw new OcrProviderError('provider_response_invalid', 'MiniMax vision returned empty content');
      }
      return {
        text: data.content,
        usage: { inputTokens: null, outputTokens: null },
        actualCostUsdMicros: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function validLimit(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

async function readBoundedResponse(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > limit) throw new OcrProviderError('provider_response_invalid', 'MiniMax vision response too large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new OcrProviderError('provider_response_invalid', 'MiniMax vision response too large');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function isMiniMaxVisionResponse(value: unknown): value is {
  content?: unknown;
  base_resp?: { status_code?: number };
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as { content?: unknown; base_resp?: unknown };
  if (candidate.base_resp !== undefined && (typeof candidate.base_resp !== 'object' || candidate.base_resp === null || Array.isArray(candidate.base_resp))) return false;
  const status = (candidate.base_resp as { status_code?: unknown } | undefined)?.status_code;
  return status === undefined || (typeof status === 'number' && Number.isSafeInteger(status));
}
