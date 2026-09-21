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

// Final source review also emits atomic Claims. Its 65k output allowance needs
// a longer bounded request window; a real review hit the former 300s cutoff.
// This changes neither ordinary generation nor the number of paid attempts.
export const SCIENTIFIC_REVIEW_OPTIONS: Readonly<TextGenerationOptions> = {
  ...SCIENTIFIC_SYNTHESIS_OPTIONS, maxTokens: 65_536, timeoutMs: 600_000,
};
