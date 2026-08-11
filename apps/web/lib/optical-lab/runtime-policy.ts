export type OpticalRuntime = 'webgl2-full' | 'static-fallback' | 'dom-only';

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
