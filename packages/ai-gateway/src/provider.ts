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
