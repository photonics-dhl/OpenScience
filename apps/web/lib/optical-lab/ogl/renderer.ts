import { Renderer } from 'ogl';

import {
  hasOpticalLayoutParity,
  measureOpticalLayout,
  serializeOpticalBounds,
  type OpticalLayout,
} from '../layout';
import { OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES } from '../runtime-policy';
import {
  createCompositePass,
  OPTICAL_RESTING_PASS_ENERGIES,
  type OpticalCompositePass,
} from './composite-pass';
import { createGlyphPass, loadOpticalGlyphAtlases, type OpticalGlyphPass } from './glyph-pass';
import { createParticlePass, type OpticalParticlePass } from './particle-pass';
import type { OpticalOglResourceCounts } from './resources';

export interface OpticalOglRendererSnapshot {
  activeRaf: boolean;
  contextStatus: 'initializing' | 'ready' | 'unavailable' | 'disposed';
  firstCompleteFrame: boolean;
  frameCount: number;
  layoutStable: boolean;
  mode: 'webgl2-full';
  apertureX: .58;
  particleCount: number;
  passEnergies: typeof OPTICAL_RESTING_PASS_ENERGIES;
  precision: 'rgba16f' | 'rgba8' | 'pending';
  qualityTier: 'resting-material';
  resourceCounts: OpticalOglResourceCounts;
  stableBounds: string;
}

export interface OpticalOglRenderer {
  dispose(): void;
  resize(): void;
}

const emptyResourceCounts = (): OpticalOglResourceCounts => ({
  buffers: 0,
  framebuffers: 0,
  programs: 0,
  renderbuffers: 0,
  shaders: 0,
  textures: 0,
  vertexArrays: 0,
});

const mergeResourceCounts = (...counts: OpticalOglResourceCounts[]): OpticalOglResourceCounts => (
  counts.reduce<OpticalOglResourceCounts>((total, current) => ({
    buffers: total.buffers + current.buffers,
    framebuffers: total.framebuffers + current.framebuffers,
    programs: total.programs + current.programs,
    renderbuffers: total.renderbuffers + current.renderbuffers,
    shaders: total.shaders + current.shaders,
    textures: total.textures + current.textures,
    vertexArrays: total.vertexArrays + current.vertexArrays,
  }), emptyResourceCounts())
);

export function createOpticalOglRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  onSnapshot: (snapshot: OpticalOglRendererSnapshot) => void,
): OpticalOglRenderer {
  const inheritedGetContext = canvas.getContext.bind(canvas);
  const webgl2OnlyGetContext = ((contextId: string, ...options: unknown[]) => {
    if (contextId === 'webgl' || contextId === 'experimental-webgl') return null;
    return inheritedGetContext(contextId as 'webgl2', ...options as [WebGLContextAttributes]);
  }) as typeof canvas.getContext;
  canvas.getContext = webgl2OnlyGetContext;
  let renderer: Renderer;
  try {
    renderer = new Renderer({
      canvas,
      webgl: 2,
      ...OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES,
      dpr: Math.min(devicePixelRatio, 2),
    });
  } finally {
    Reflect.deleteProperty(canvas, 'getContext');
  }
  if (!renderer.isWebgl2) throw new Error('The Optical Lab dynamic runtime requires WebGL2');

  let acceptedLayout: OpticalLayout | null = null;
  let activeRaf = false;
  let compositePass: OpticalCompositePass | null = null;
  let disposed = false;
  let firstCompleteFrame = false;
  let frameCount = 0;
  let generation = 0;
  let glyphPass: OpticalGlyphPass | null = null;
  let glyphAtlases: ReturnType<typeof loadOpticalGlyphAtlases> | null = null;
  let rafId: number | null = null;
  let particlePass: OpticalParticlePass | null = null;
  let stableBounds = 'pending';

  const report = (
    contextStatus: OpticalOglRendererSnapshot['contextStatus'],
    layoutStable = acceptedLayout !== null,
  ) => onSnapshot({
    activeRaf,
    apertureX: .58,
    contextStatus,
    firstCompleteFrame,
    frameCount,
    layoutStable,
    mode: 'webgl2-full',
    particleCount: particlePass?.particleCount ?? 0,
    passEnergies: OPTICAL_RESTING_PASS_ENERGIES,
    precision: compositePass?.precision ?? 'pending',
    qualityTier: 'resting-material',
    resourceCounts: disposed
      ? emptyResourceCounts()
      : mergeResourceCounts(
          glyphPass?.resourceCounts() ?? emptyResourceCounts(),
          particlePass?.resourceCounts() ?? emptyResourceCounts(),
          compositePass?.resourceCounts() ?? emptyResourceCounts(),
        ),
    stableBounds,
  });

  const readLayout = async () => {
    const science = stage.querySelector<HTMLElement>('[data-optical-lab-science="true"]');
    const evolves = stage.querySelector<HTMLElement>('[data-optical-lab-evolves="true"]');
    if (!science || !evolves) throw new Error('Optical Lab semantic word bounds are unavailable');
    return measureOpticalLayout(stage, science, evolves);
  };

  const cancelFrame = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    activeRaf = false;
  };

  const disposeMaterialPasses = () => {
    compositePass?.dispose();
    compositePass = null;
    particlePass?.dispose();
    particlePass = null;
  };

  const disposeAllPasses = () => {
    disposeMaterialPasses();
    glyphPass?.dispose();
    glyphPass = null;
  };

  const draw = (ownedGeneration: number) => {
    if (disposed || ownedGeneration !== generation || !activeRaf || acceptedLayout === null) return;
    const layoutStable = acceptedLayout !== null;
    try {
      const parityWord = stage.dataset.opticalLabGlyphParityProbe;
      const glyphParityWord = parityWord === 'science' || parityWord === 'evolves' ? parityWord : null;
      const glyphParityProbe = parityWord === 'all' || glyphParityWord !== null;
      if (!glyphPass?.render(null, glyphParityWord)) throw new Error('Optical Lab MSDF color+mask frame is incomplete');
      if (glyphParityProbe) {
        frameCount += 1;
        firstCompleteFrame = layoutStable;
        report('ready', layoutStable);
        rafId = requestAnimationFrame(() => draw(ownedGeneration));
        return;
      }
      if (!particlePass?.render()) throw new Error('Optical Lab mask-derived particle frame is incomplete');
      if (!compositePass?.render()) throw new Error('Optical Lab resting composite frame is incomplete');
      if (disposed || ownedGeneration !== generation || acceptedLayout === null) return;
      frameCount += 1;
      firstCompleteFrame = layoutStable;
      report('ready', layoutStable);
      rafId = requestAnimationFrame(() => draw(ownedGeneration));
    } catch {
      if (ownedGeneration !== generation) return;
      cancelFrame();
      firstCompleteFrame = false;
      disposeAllPasses();
      report('unavailable', false);
    }
  };

  const beginLayoutGeneration = () => {
    const ownedGeneration = ++generation;
    cancelFrame();
    firstCompleteFrame = false;
    acceptedLayout = null;
    disposeMaterialPasses();
    report(frameCount > 0 ? 'ready' : 'initializing');
    void (async () => {
      const layout = await readLayout();
      if (disposed || ownedGeneration !== generation) return;
      glyphAtlases ??= loadOpticalGlyphAtlases();
      const atlases = await glyphAtlases;
      if (disposed || ownedGeneration !== generation) return;
      const publicationLayout = await readLayout();
      if (disposed || ownedGeneration !== generation) return;
      if (!hasOpticalLayoutParity(layout, publicationLayout)) {
        report('unavailable', false);
        return;
      }
      renderer.setSize(publicationLayout.viewport.width, publicationLayout.viewport.height);
      if (glyphPass) glyphPass.resize(publicationLayout);
      else glyphPass = createGlyphPass(renderer.gl, publicationLayout, atlases);
      particlePass = createParticlePass(renderer.gl, publicationLayout, glyphPass.maskTexture);
      compositePass = createCompositePass(renderer.gl, publicationLayout, {
        glyphColor: glyphPass.colorTexture,
        glyphMask: glyphPass.maskTexture,
        particles: particlePass.texture,
      });
      if (disposed || ownedGeneration !== generation) return;
      acceptedLayout = publicationLayout;
      stableBounds = serializeOpticalBounds(publicationLayout.title);
      activeRaf = true;
      report(frameCount > 0 ? 'ready' : 'initializing', true);
      rafId = requestAnimationFrame(() => draw(ownedGeneration));
    })().catch(() => {
      if (disposed || ownedGeneration !== generation) return;
      cancelFrame();
      firstCompleteFrame = false;
      disposeAllPasses();
      report('unavailable', false);
    });
  };

  report('initializing', false);
  beginLayoutGeneration();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      firstCompleteFrame = false;
      cancelFrame();
      disposeAllPasses();
      report('disposed', false);
    },
    resize: beginLayoutGeneration,
  };
}
