import { sceneImageConfigured, type GatewayConfig, type GatewayImageConfig } from '@openscience/config';
import { AiGateway, type AiGatewayOptions } from './gateway';
import { AnthropicCompatProvider, OpenAiCompatProvider, MiniMaxCodingPlanVisionProvider } from './provider';
import { MiniMaxImageProvider, type ImageProvider, type ImageRecoveryState } from './image';
import { CodexSpoolImageProvider, SynclipSpoolImageProvider, type CodexSpoolImageConfig } from './codex-image';
import { CodexSolImageReviewProvider, type CodexSolReviewConfig } from './codex-sol-review';
import { MutableProviderKillSwitch, type ProviderCapabilityPolicy } from './ocr';

export type GatewayImageSubmission = NonNullable<CodexSpoolImageConfig['withSubmission']>;
export type GatewayIllustrationSubmission = NonNullable<CodexSolReviewConfig['withIllustrationSubmission']>;
export interface GatewayFactoryCallbacks {
  fetcher?: typeof fetch;
  audit?: AiGatewayOptions['audit'];
  logger?: AiGatewayOptions['logger'];
  externalProcessingPolicy?: AiGatewayOptions['externalProcessingPolicy'];
  runtimeCapabilityPolicy?: ProviderCapabilityPolicy;
  imageSubmission?: GatewayImageSubmission;
  illustrationSubmission?: GatewayIllustrationSubmission;
  nativeImageReviewSubmission?: AiGatewayOptions['nativeImageReviewSubmission'];
  illustrationReviewPolicy?: AiGatewayOptions['illustrationReviewPolicy'];
}

function spoolImageProvider(config: GatewayImageConfig, kind: string, withSubmission?: GatewayImageSubmission) {
  const paths = kind === 'synclip' ? config.synclip : kind === 'codex' ? config.codex : undefined;
  if (!paths?.inboxDir || !paths.resultsDir) return undefined;
  const options = { inboxDir: paths.inboxDir, resultsDir: paths.resultsDir, withSubmission };
  return kind === 'synclip' ? new SynclipSpoolImageProvider(options) : new CodexSpoolImageProvider(options);
}

/** Provider construction is shared; live task/source authority is injected by the Worker. */
export function createConfiguredGateway(config: GatewayConfig, callbacks: GatewayFactoryCallbacks = {}): AiGateway {
  const fetcher = callbacks.fetcher ?? globalThis.fetch;
  const logger = callbacks.logger ?? console;
  const image = config.image;
  const buildProvider = (apiKey: string, keyIndex: number, model: string, modelIndex: number) => {
    const tokenPlan = config.text.apiMode === 'anthropic' || config.text.apiMode === 'auto' && apiKey.startsWith('sk-cp-');
    const providerConfig = { baseUrl: tokenPlan ? config.text.tokenPlanBaseUrl : config.text.baseUrl, apiKey, model };
    const name = `minimax-key-${keyIndex + 1}-model-${modelIndex + 1}`;
    return tokenPlan ? new AnthropicCompatProvider(name, providerConfig, fetcher) : new OpenAiCompatProvider(name, providerConfig, fetcher);
  };
  const providers = config.text.keys.flatMap((key, keyIndex) => config.text.models.map((model, modelIndex) => buildProvider(key, keyIndex, model, modelIndex)));
  const nativeImageReviewProvider = config.text.imageReviewModel
    ? buildProvider(config.text.keys[0]!, 0, config.text.imageReviewModel, 0) : undefined;
  const buildImageProvider = (kind: string): ImageProvider | undefined => {
    if (!image.enabled) return undefined;
    if (kind === 'synclip') return image.synclip.enabled && !image.disabledProviders.includes('synclip')
      ? spoolImageProvider(image, kind, callbacks.imageSubmission) : undefined;
    if (kind === 'codex') return !image.disabledProviders.includes('codex-image')
      ? spoolImageProvider(image, kind, callbacks.imageSubmission) : undefined;
    if (kind === 'minimax' && image.minimax.enabled && image.minimax.apiKey)
      return new MiniMaxImageProvider('minimax-image', { baseUrl: config.imageOrigin!, apiKey: image.minimax.apiKey, model: 'image-01' }, fetcher);
    return undefined;
  };
  const imageProviders = [buildImageProvider(image.primary), image.fallback && image.fallback !== image.primary
    ? buildImageProvider(image.fallback) : undefined].filter((provider): provider is ImageProvider => provider !== undefined);
  if (image.fallback && imageProviders.length < 2)
    logger.warn?.(`image fallback provider '${image.fallback}' is configured but unavailable or disabled; running with ${imageProviders.length} provider(s)`);
  if (image.fallback && imageProviders.length > 1)
    logger.warn?.(`image fallback is configured but primary '${image.primary}' cannot report a definitive non-submission; the fallback will not trigger`);
  const review = image.illustrationReview;
  const illustrationImageReviewProvider = image.enabled && review.enabled && review.inboxDir && review.resultsDir && callbacks.illustrationSubmission
    ? new CodexSolImageReviewProvider({ inboxDir: review.inboxDir, resultsDir: review.resultsDir, withIllustrationSubmission: callbacks.illustrationSubmission }) : undefined;
  if (image.enabled && review.enabled && !illustrationImageReviewProvider)
    throw new Error('CODEX_SOL_IMAGE_REVIEW_ENABLED requires authorized image review spool paths');
  const runtimeCapabilityPolicy = callbacks.runtimeCapabilityPolicy ?? new MutableProviderKillSwitch();
  return new AiGateway({ providers, imageProviders,
    ocrProviders: config.vision ? [new MiniMaxCodingPlanVisionProvider('minimax-vision', config.vision, fetcher)] : [],
    nativeImageReviewProvider, illustrationImageReviewProvider, audit: callbacks.audit, logger,
    killSwitch: { async isEnabled(provider, capability) {
      if (image.disabledProviders.includes(provider)) return { enabled: false, reason: 'operator_disabled' };
      return runtimeCapabilityPolicy.isEnabled(provider, capability);
    } },
    externalProcessingPolicy: callbacks.externalProcessingPolicy ?? (async () => false),
    illustrationReviewPolicy: callbacks.illustrationReviewPolicy, ocrLimits: config.ocrLimits,
    authorizeIllustrationReview: callbacks.illustrationSubmission ? input => callbacks.illustrationSubmission!(input, async () => undefined) : undefined,
    nativeImageReviewSubmission: callbacks.nativeImageReviewSubmission,
  });
}

export interface GatewayRecoveryReaders {
  canResumeImageBeforeSubmission?: (requestId: string) => Promise<boolean>;
  inspectImageRecoveryState?: (requestId: string) => Promise<ImageRecoveryState>;
  canResumeImageReviewFromCompletedResult?: (requestId: string) => Promise<boolean>;
}

/** API gets read-only evidence, never a generator or submission callback. */
export function createGatewayRecoveryReaders(config: GatewayImageConfig, options: {
  logger?: Pick<Console, 'warn'>;
} = {}): GatewayRecoveryReaders {
  const logger = options.logger ?? console;
  const sceneImageEnabled = sceneImageConfigured(config);
  const payer = sceneImageEnabled ? spoolImageProvider(config, config.primary) : undefined;
  const spare = sceneImageEnabled && config.fallback && config.fallback !== config.primary
    ? spoolImageProvider(config, config.fallback) : undefined;
  if (config.fallback && !payer)
    logger.warn?.(`image fallback '${config.fallback}' is configured but primary '${config.primary}' has no spool; an interrupted attempt needs an explicitly charged new generation`);
  const review = config.illustrationReview;
  const reader = review.inboxDir && review.resultsDir
    ? new CodexSolImageReviewProvider({ inboxDir: review.inboxDir, resultsDir: review.resultsDir }) : undefined;
  const inspect = async (provider: CodexSpoolImageProvider | SynclipSpoolImageProvider, requestId: string): Promise<ImageRecoveryState> => {
    try { return await provider.inspectRecoveryState(requestId); } catch (cause) {
      logger.warn?.(`image recovery inspection failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      return 'unsafe';
    }
  };
  return {
    ...(payer ? {
      canResumeImageBeforeSubmission: async (requestId: string) => payer.canResumeBeforeSubmission(requestId),
      inspectImageRecoveryState: async (requestId: string): Promise<ImageRecoveryState> => {
        // A spare may witness saved bytes; all other verdicts belong to the original payer.
        if (spare && await inspect(spare, requestId) === 'completed') return 'completed';
        return inspect(payer, requestId);
      },
    } : {}),
    ...(reader ? { canResumeImageReviewFromCompletedResult: (requestId: string) => reader.canResumeFromCompletedResult(requestId) } : {}),
  };
}
