export type OpticalRuntime = 'webgl2-full' | 'static-fallback' | 'dom-only';

export const OPTICAL_LAB_RENDER_PHASE = 'task-4-msdf-glyph-v1' as const;

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
