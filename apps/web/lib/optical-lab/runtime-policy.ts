export type OpticalRuntime = 'webgl2-full' | 'static-fallback' | 'dom-only';
export type OpticalQualityTier = 'full' | 'reduced-particles' | 'reduced-bloom';

export const OPTICAL_QUALITY_BUDGETS = Object.freeze({
  maxDpr: 2,
  reducedBloomScale: .125,
  reducedParticleRatio: .55,
});

export interface OpticalQualityState {
  fastDurationMs: number;
  slowWindows: number;
  tier: OpticalQualityTier;
}

export function createOpticalQualityState(tier: OpticalQualityTier = 'full'): OpticalQualityState {
  return { fastDurationMs: 0, slowWindows: 0, tier };
}

export function sampleOpticalQuality(
  state: OpticalQualityState,
  sample: { durationMs: number; fps: number },
): OpticalQualityState {
  if (sample.fps < 45 && sample.durationMs >= 2_000) {
    const slowWindows = state.slowWindows + 1;
    if (slowWindows < 2) return { ...state, fastDurationMs: 0, slowWindows };
    const tier = state.tier === 'full' ? 'reduced-particles' : 'reduced-bloom';
    return { fastDurationMs: 0, slowWindows: 1, tier };
  }
  if (sample.fps > 55) {
    const fastDurationMs = state.fastDurationMs + sample.durationMs;
    if (fastDurationMs < 10_000) return { ...state, fastDurationMs, slowWindows: 0 };
    const tier = state.tier === 'reduced-bloom' ? 'reduced-particles' : 'full';
    return { fastDurationMs: 0, slowWindows: 0, tier };
  }
  return { ...state, fastDurationMs: 0, slowWindows: 0 };
}

export const OPTICAL_LAB_RENDER_PHASE = 'task-7-accepted-fallback-v1' as const;

export const OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: true,
  antialias: false,
  depth: true,
  powerPreference: 'default' as WebGLPowerPreference,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  stencil: false,
});

export interface OpticalRuntimeCapabilities {
  canvas: boolean;
  initializationFailed: boolean;
  lowPower: boolean;
  reducedMotion: boolean;
  webgl2: boolean;
}

export function chooseOpticalRuntime(capabilities: OpticalRuntimeCapabilities): OpticalRuntime {
  if (!capabilities.canvas) return 'dom-only';
  if (
    capabilities.initializationFailed
    || capabilities.lowPower
    || capabilities.reducedMotion
    || !capabilities.webgl2
  ) return 'static-fallback';
  return 'webgl2-full';
}

export function acquireOpticalWebGL2Context(canvas: HTMLCanvasElement) {
  return Boolean(canvas.getContext('webgl2', OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES));
}
