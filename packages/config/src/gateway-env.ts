export interface GatewayImageConfig {
  enabled: boolean;
  primary: string;
  fallback?: string;
  disabledProviders: string[];
  minimax: { enabled: boolean; apiKey?: string; region: string };
  codex: { inboxDir?: string; resultsDir?: string };
  synclip: { enabled: boolean; inboxDir?: string; resultsDir?: string };
  illustrationReview: { enabled: boolean; inboxDir?: string; resultsDir?: string };
}

export interface GatewayConfig {
  image: GatewayImageConfig;
  text: { keys: string[]; models: string[]; apiMode: string; baseUrl: string; tokenPlanBaseUrl: string; imageReviewModel?: string };
  imageOrigin?: string;
  vision?: { baseUrl: string; apiKey: string; backupApiKey?: string; model: string; timeoutMs: number; maxPageBytes: number;
    pricing?: { usdMicrosPerPage: number; version: string; effectiveDate: string; serviceTier: string } };
  ocrLimits: { maxPages: number; maxPageBytes: number; maxTotalBytes: number };
}

/** Admission and recovery read the same image selection without validating unrelated executors. */
export function loadGatewayImageConfig(env: NodeJS.ProcessEnv): GatewayImageConfig {
  const primary = env.HERMES_SCENE_IMAGE_PROVIDER?.trim() || 'minimax';
  return {
    enabled: env.AI_ENABLED === 'true', primary,
    fallback: primary === 'synclip' ? undefined : env.HERMES_SCENE_IMAGE_FALLBACK_PROVIDER?.trim() || undefined,
    disabledProviders: (env.AI_DISABLED_PROVIDERS ?? '').split(',').map(value => value.trim()).filter(Boolean),
    minimax: { enabled: env.MINIMAX_IMAGE_ENABLED === 'true',
      apiKey: [env.MINIMAX_API_KEY, env.MINIMAX_API_KEY_2].map(key => key?.trim()).find(Boolean),
      region: env.MINIMAX_IMAGE_REGION ?? 'global' },
    codex: { inboxDir: env.CODEX_IMAGE_INBOX_DIR?.trim(), resultsDir: env.CODEX_IMAGE_RESULTS_DIR?.trim() },
    synclip: { enabled: env.SYNCLIP_IMAGE_ENABLED === 'true',
      inboxDir: env.SYNCLIP_IMAGE_INBOX_DIR?.trim(), resultsDir: env.SYNCLIP_IMAGE_RESULTS_DIR?.trim() },
    illustrationReview: { enabled: env.CODEX_SOL_IMAGE_REVIEW_ENABLED === 'true',
      inboxDir: env.CODEX_SOL_REVIEW_INBOX_DIR?.trim(), resultsDir: env.CODEX_SOL_REVIEW_RESULTS_DIR?.trim() },
  };
}

export function sceneImageConfigured(config: GatewayImageConfig): boolean {
  if (!config.enabled) return false;
  if (config.primary === 'synclip') return config.synclip.enabled && Boolean(config.synclip.inboxDir && config.synclip.resultsDir)
    && !config.disabledProviders.includes('synclip');
  if (config.primary === 'codex') return Boolean(config.codex.inboxDir && config.codex.resultsDir)
    && !config.disabledProviders.includes('codex-image');
  return config.primary === 'minimax' && config.minimax.enabled && Boolean(config.minimax.apiKey)
    && !config.disabledProviders.includes('minimax-image');
}

/** Preserve the executor's activation/validation scope and its key-major text pool. */
export function loadGatewayConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  const image = loadGatewayImageConfig(env);
  const keys = [env.MINIMAX_API_KEY, env.MINIMAX_API_KEY_2].filter(
    (key, index, all): key is string => Boolean(key) && all.indexOf(key) === index,
  );
  const visionPrimaryKey = env.MINIMAX_API_KEY?.trim();
  const visionBackupKey = env.MINIMAX_API_KEY_2?.trim();
  const hasMinimaxImage = image.enabled && image.minimax.enabled && image.minimax.apiKey
    && (image.primary === 'minimax' || image.fallback === 'minimax' && image.fallback !== image.primary);
  return {
    image,
    text: { keys: keys.length ? keys : [''], models: [env.MINIMAX_MODEL ?? 'MiniMax-M3',
      ...(env.AI_FALLBACK_MODELS ?? '').split(',').map(value => value.trim()).filter(Boolean)],
    apiMode: env.MINIMAX_API_MODE ?? 'auto', baseUrl: env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1',
    tokenPlanBaseUrl: env.MINIMAX_TOKEN_PLAN_BASE_URL ?? 'https://api.minimax.io/anthropic',
    imageReviewModel: env.MINIMAX_IMAGE_REVIEW_MODEL?.trim() || undefined },
    ...(hasMinimaxImage ? { imageOrigin: imageOrigin(image.minimax.region) } : {}),
    ...(image.enabled && env.MINIMAX_VISION_ENABLED === 'true' && visionPrimaryKey ? { vision: {
      baseUrl: visionOrigin(env), apiKey: visionPrimaryKey,
      ...(visionBackupKey && visionBackupKey !== visionPrimaryKey ? { backupApiKey: visionBackupKey } : {}),
      model: env.MINIMAX_VISION_MODEL ?? 'coding-plan-vlm', timeoutMs: 120_000,
      pricing: visionPricing(env),
      maxPageBytes: optionalBoundedInteger(env.MINIMAX_VISION_MAX_PAGE_BYTES, 4 * 1024 * 1024, 'MINIMAX_VISION_MAX_PAGE_BYTES'),
    } } : {}),
    ocrLimits: {
      maxPages: optionalBoundedInteger(env.LLM_OCR_MAX_PAGES, 4, 'LLM_OCR_MAX_PAGES'),
      maxPageBytes: optionalBoundedInteger(env.LLM_OCR_MAX_PAGE_BYTES, 4 * 1024 * 1024, 'LLM_OCR_MAX_PAGE_BYTES'),
      maxTotalBytes: optionalBoundedInteger(env.LLM_OCR_MAX_TOTAL_BYTES, 8 * 1024 * 1024, 'LLM_OCR_MAX_TOTAL_BYTES'),
    },
  };
}

function imageOrigin(region: string): string {
  if (region === 'global') return 'https://api.minimax.io';
  if (region === 'cn') return 'https://api.minimaxi.com';
  throw new Error('MINIMAX_IMAGE_REGION must be global or cn');
}

function visionOrigin(env: NodeJS.ProcessEnv): string {
  let textOrigin: string | undefined;
  try { textOrigin = new URL(env.MINIMAX_TOKEN_PLAN_BASE_URL ?? '').origin; } catch { /* default global */ }
  const region = env.MINIMAX_VISION_REGION ?? (textOrigin === 'https://api.minimaxi.com' ? 'cn' : 'global');
  if (region === 'global') return 'https://api.minimax.io';
  if (region === 'cn') return 'https://api.minimaxi.com';
  throw new Error('MINIMAX_VISION_REGION must be global or cn');
}

function visionPricing(env: NodeJS.ProcessEnv): NonNullable<GatewayConfig['vision']>['pricing'] {
  const rawCost = env.MINIMAX_VISION_USD_MICROS_PER_PAGE;
  if (rawCost === undefined || rawCost.trim() === '') return undefined;
  const usdMicrosPerPage = Number(rawCost);
  if (!Number.isSafeInteger(usdMicrosPerPage) || usdMicrosPerPage < 0 || usdMicrosPerPage > 1_000_000_000)
    throw new Error('MINIMAX_VISION_USD_MICROS_PER_PAGE must be a non-negative integer');
  const version = env.MINIMAX_VISION_PRICING_VERSION ?? '';
  const effectiveDate = env.MINIMAX_VISION_PRICING_EFFECTIVE_DATE ?? '';
  const serviceTier = env.MINIMAX_VISION_SERVICE_TIER ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(serviceTier))
    throw new Error('MiniMax vision pricing metadata is incomplete or invalid');
  return { usdMicrosPerPage, version, effectiveDate, serviceTier };
}

function optionalBoundedInteger(raw: string | undefined, maximum: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return maximum;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  return value;
}
