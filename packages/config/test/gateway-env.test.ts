import { describe, expect, it } from 'vitest';
import { loadGatewayConfig, loadGatewayImageConfig, sceneImageConfigured } from '../src/gateway-env';
import { loadApiEnv } from '../src/api-env';

describe('shared Gateway environment', () => {
  it('retains default text placeholder and exact key deduplication separately from image-key trimming', () => {
    expect(loadGatewayConfig({}).text).toMatchObject({ keys: [''], models: ['MiniMax-M3'], apiMode: 'auto' });
    const parsed = loadGatewayConfig({ MINIMAX_API_KEY: '   ', MINIMAX_API_KEY_2: ' backup ', AI_FALLBACK_MODELS: ' MiniMax-M3.1-Flash-Preview, ' });
    expect(parsed.text.keys).toEqual(['   ', ' backup ']); expect(parsed.image.minimax.apiKey).toBe('backup');
    expect(loadGatewayConfig({ MINIMAX_API_KEY: 'same', MINIMAX_API_KEY_2: 'same' }).text.keys).toEqual(['same']);
  });

  it('does not validate dormant executor settings while deriving API admission and recovery', () => {
    const env = { MINIMAX_IMAGE_REGION: 'invalid', MINIMAX_VISION_REGION: 'invalid', LLM_OCR_MAX_PAGES: 'invalid' };
    expect(sceneImageConfigured(loadGatewayImageConfig(env))).toBe(false);
    expect(loadApiEnv(env).ai.sceneImageEnabled).toBe(false);
    expect(() => loadGatewayConfig(env)).toThrow('LLM_OCR_MAX_PAGES');
    expect(() => loadGatewayConfig({ MINIMAX_IMAGE_REGION: 'invalid' })).not.toThrow();
  });

  it.each([
    [{ AI_ENABLED: 'true', MINIMAX_IMAGE_ENABLED: 'true', MINIMAX_API_KEY: 'fixture', MINIMAX_IMAGE_REGION: 'invalid' }, 'MINIMAX_IMAGE_REGION'],
    [{ AI_ENABLED: 'true', MINIMAX_VISION_ENABLED: 'true', MINIMAX_API_KEY: 'fixture', MINIMAX_VISION_REGION: 'invalid' }, 'MINIMAX_VISION_REGION'],
    [{ AI_ENABLED: 'true', MINIMAX_VISION_ENABLED: 'true', MINIMAX_API_KEY: 'fixture', MINIMAX_VISION_USD_MICROS_PER_PAGE: '1' }, 'pricing metadata'],
    [{ LLM_OCR_MAX_TOTAL_BYTES: '0' }, 'LLM_OCR_MAX_TOTAL_BYTES'],
  ])('preserves activated executor validation (%j)', (env, error) => {
    expect(() => loadGatewayConfig(env)).toThrow(error);
  });

  it('keeps CN vision origin, validated pricing and the distinct backup key on the original role', () => {
    expect(loadGatewayConfig({ AI_ENABLED: 'true', MINIMAX_API_KEY: ' primary ', MINIMAX_API_KEY_2: ' backup ',
      MINIMAX_VISION_ENABLED: 'true', MINIMAX_TOKEN_PLAN_BASE_URL: 'https://api.minimaxi.com/anthropic',
      MINIMAX_VISION_USD_MICROS_PER_PAGE: '450', MINIMAX_VISION_PRICING_VERSION: 'operator-2026-08',
      MINIMAX_VISION_PRICING_EFFECTIVE_DATE: '2026-08-01', MINIMAX_VISION_SERVICE_TIER: 'token-plan' }).vision).toEqual({
      baseUrl: 'https://api.minimaxi.com', apiKey: 'primary', backupApiKey: 'backup', model: 'coding-plan-vlm', timeoutMs: 120_000,
      maxPageBytes: 4 * 1024 * 1024, pricing: { usdMicrosPerPage: 450, version: 'operator-2026-08', effectiveDate: '2026-08-01', serviceTier: 'token-plan' },
    });
  });
});
