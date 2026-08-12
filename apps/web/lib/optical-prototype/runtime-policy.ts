export type CentralParticleMode = 'dynamic' | 'static';

export const CENTRAL_PARTICLE_WEBGL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
  premultipliedAlpha: false,
};

export function probeCentralParticleWebGl2(canvas: Pick<HTMLCanvasElement, 'getContext'>): boolean {
  const context = canvas.getContext('webgl2', CENTRAL_PARTICLE_WEBGL_ATTRIBUTES);
  if (!context) return false;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

export function selectCentralParticleMode(input: {
  reducedMotion: boolean;
  webgl2: boolean;
  width: number;
}): CentralParticleMode {
  return input.width > 480 && !input.reducedMotion && input.webgl2 ? 'dynamic' : 'static';
}

type PolicyEventSource = {
  innerWidth: number;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
};

type MotionEventSource = {
  matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
};

export function observeCentralParticlePolicy(input: {
  motion: MotionEventSource;
  onMode(mode: CentralParticleMode): void;
  source: PolicyEventSource;
  webgl2: boolean;
}): () => void {
  const publish = () => input.onMode(selectCentralParticleMode({
    reducedMotion: input.motion.matches,
    webgl2: input.webgl2,
    width: input.source.innerWidth,
  }));
  input.source.addEventListener('resize', publish);
  input.motion.addEventListener('change', publish);
  publish();
  return () => {
    input.source.removeEventListener('resize', publish);
    input.motion.removeEventListener('change', publish);
  };
}
