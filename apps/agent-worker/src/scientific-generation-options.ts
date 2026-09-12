import type { TextGenerationOptions } from '@openscience/ai-gateway';

// MiniMax-M3 Anthropic compatibility defaults to thinking off. These limits
// apply to scientific work only; they are ceilings, not target answer lengths.
export const SCIENTIFIC_READING_OPTIONS: Readonly<TextGenerationOptions> = {
  thinking: 'adaptive', temperature: 1, topP: 0.95,
  maxTokens: 16_384, timeoutMs: 180_000,
};

export const SCIENTIFIC_SYNTHESIS_OPTIONS: Readonly<TextGenerationOptions> = {
  ...SCIENTIFIC_READING_OPTIONS, maxTokens: 32_768, timeoutMs: 300_000,
};
