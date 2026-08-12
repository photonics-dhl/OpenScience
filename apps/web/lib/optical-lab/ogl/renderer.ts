import { Renderer } from 'ogl';

import {
  hasOpticalLayoutParity,
  measureOpticalLayout,
  serializeOpticalBounds,
  type OpticalLayout,
} from '../layout';
import {
  createOpticalQualityState,
  OPTICAL_QUALITY_BUDGETS,
  OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES,
  sampleOpticalQuality,
  type OpticalQualityState,
} from '../runtime-policy';
import { stepOpticalResponse, type OpticalLabPointer } from '../model';
import {
  createCompositePass,
  OPTICAL_RESTING_PASS_ENERGIES,
  type OpticalCompositePass,
} from './composite-pass';
import { createGlyphPass, loadOpticalGlyphAtlases, type OpticalGlyphPass } from './glyph-pass';
import { createParticlePass, type OpticalParticlePass } from './particle-pass';
import type { OpticalOglResourceCounts } from './resources';
import { createFlowPass, type OpticalFlowPass } from './flow-pass';

export interface OpticalOglRendererSnapshot {
  activeRaf: boolean;
  bloomScale: number;
  contextStatus: 'initializing' | 'ready' | 'unavailable' | 'disposed';
  cpuFrameMs: number;
  firstCompleteFrame: boolean;
  frameCount: number;
  fps: number;
  gpuFrameMs: 'unavailable';
  gpuTiming: 'unavailable';
  layoutStable: boolean;
  mode: 'webgl2-full';
  apertureX: .58;
  particleCount: number;
  passEnergies: typeof OPTICAL_RESTING_PASS_ENERGIES;
  precision: 'rgba16f' | 'rgba8' | 'pending';
  qualityTier: OpticalQualityState['tier'];
  flowTexture: '96x54-ping-pong';
  resourceCounts: OpticalOglResourceCounts;
  stableBounds: string;
}

export interface OpticalOglRenderer {
  dispose(): void;
  resize(): void;
  updatePointer(pointer: OpticalLabPointer): void;
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
      dpr: Math.min(devicePixelRatio, OPTICAL_QUALITY_BUDGETS.maxDpr),
    });
  } finally {
    Reflect.deleteProperty(canvas, 'getContext');
  }
  if (!renderer.isWebgl2) throw new Error('The Optical Lab dynamic runtime requires WebGL2');

  let acceptedLayout: OpticalLayout | null = null;
  let activeRaf = false;
  let compositePass: OpticalCompositePass | null = null;
  let cpuFrameMs = 0;
  let disposed = false;
  let firstCompleteFrame = false;
  let frameCount = 0;
  let generation = 0;
  let glyphPass: OpticalGlyphPass | null = null;
  let flowPass: OpticalFlowPass | null = null;
  let pointer: OpticalLabPointer | null = null;
  let glyphAtlases: ReturnType<typeof loadOpticalGlyphAtlases> | null = null;
  let rafId: number | null = null;
  let particlePass: OpticalParticlePass | null = null;
  let qualityState = createOpticalQualityState();
  let measuredFps = 0;
  let qualityWindowFrame = 0;
  let qualityWindowStartedAt = 0;
  let stableBounds = 'pending';

  const report = (
    contextStatus: OpticalOglRendererSnapshot['contextStatus'],
    layoutStable = acceptedLayout !== null,
  ) => onSnapshot({
    activeRaf,
    apertureX: .58,
    bloomScale: compositePass?.bloomScale ?? .25,
    contextStatus,
    cpuFrameMs,
    firstCompleteFrame,
    flowTexture: '96x54-ping-pong',
    frameCount,
    fps: measuredFps,
    gpuFrameMs: 'unavailable',
    gpuTiming: 'unavailable',
    layoutStable,
    mode: 'webgl2-full',
    particleCount: particlePass?.particleCount ?? 0,
    passEnergies: OPTICAL_RESTING_PASS_ENERGIES,
    precision: compositePass?.precision ?? 'pending',
    qualityTier: qualityState.tier,
    resourceCounts: disposed
      ? emptyResourceCounts()
      : mergeResourceCounts(
          glyphPass?.resourceCounts() ?? emptyResourceCounts(),
          particlePass?.resourceCounts() ?? emptyResourceCounts(),
          compositePass?.resourceCounts() ?? emptyResourceCounts(),
          flowPass?.resourceCounts() ?? emptyResourceCounts(),
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
    flowPass?.dispose();
    flowPass = null;
  };

  const disposeAllPasses = () => {
    disposeMaterialPasses();
    glyphPass?.dispose();
    glyphPass = null;
  };

  const draw = (ownedGeneration: number, timestamp = performance.now()) => {
    if (disposed || ownedGeneration !== generation || !activeRaf || acceptedLayout === null) return;
    const layoutStable = acceptedLayout !== null;
    const cpuStartedAt = performance.now();
    try {
      if (qualityWindowStartedAt === 0) qualityWindowStartedAt = timestamp;
      qualityWindowFrame += 1;
      const qualityDurationMs = timestamp - qualityWindowStartedAt;
      if (qualityDurationMs >= 2_000) {
        const previousTier = qualityState.tier;
        measuredFps = qualityWindowFrame * 1_000 / qualityDurationMs;
        qualityState = sampleOpticalQuality(qualityState, {
          durationMs: qualityDurationMs,
          fps: measuredFps,
        });
        qualityWindowFrame = 0;
        qualityWindowStartedAt = timestamp;
        if (qualityState.tier !== previousTier && acceptedLayout && glyphPass && particlePass) {
          particlePass.setQualityTier(qualityState.tier);
          compositePass?.dispose();
          compositePass = createCompositePass(renderer.gl, acceptedLayout, {
            glyphColor: glyphPass.colorTexture,
            glyphMask: glyphPass.maskTexture,
            particles: particlePass.texture,
          }, qualityState.tier);
        }
      }
      const parityWord = stage.dataset.opticalLabGlyphParityProbe;
      const glyphParityWord = parityWord === 'science' || parityWord === 'evolves' ? parityWord : null;
      const glyphParityProbe = parityWord === 'all' || glyphParityWord !== null;
      const response = stepOpticalResponse(pointer, acceptedLayout.viewport, timestamp);
      const pointerSample = pointer ?? { x: acceptedLayout.apertureX, y: acceptedLayout.viewport.height * .5, velocityX: 0, velocityY: 0 };
      if (!flowPass?.render({
        follow: response.follow,
        pointer: [pointerSample.x / acceptedLayout.viewport.width, 1 - pointerSample.y / acceptedLayout.viewport.height],
        velocity: [pointerSample.velocityX, -pointerSample.velocityY],
      })) throw new Error('Optical Lab flow frame is incomplete');
      if (!glyphPass?.render(flowPass.texture(), glyphParityWord, response)) throw new Error('Optical Lab MSDF color+mask frame is incomplete');
      if (glyphParityProbe) {
        frameCount += 1;
        firstCompleteFrame = layoutStable;
        report('ready', layoutStable);
        rafId = requestAnimationFrame((nextTimestamp) => draw(ownedGeneration, nextTimestamp));
        return;
      }
      if (!particlePass?.render(flowPass.texture(), response.follow)) throw new Error('Optical Lab mask-derived particle frame is incomplete');
      if (!compositePass?.render(response.causticGain)) throw new Error('Optical Lab resting composite frame is incomplete');
      if (disposed || ownedGeneration !== generation || acceptedLayout === null) return;
      frameCount += 1;
      firstCompleteFrame = layoutStable;
      cpuFrameMs = Math.max(0, performance.now() - cpuStartedAt);
      report('ready', layoutStable);
      rafId = requestAnimationFrame((nextTimestamp) => draw(ownedGeneration, nextTimestamp));
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
      particlePass.setQualityTier(qualityState.tier);
      flowPass = createFlowPass(renderer.gl);
      compositePass = createCompositePass(renderer.gl, publicationLayout, {
        glyphColor: glyphPass.colorTexture,
        glyphMask: glyphPass.maskTexture,
        particles: particlePass.texture,
      }, qualityState.tier);
      if (disposed || ownedGeneration !== generation) return;
      acceptedLayout = publicationLayout;
      stableBounds = serializeOpticalBounds(publicationLayout.title);
      activeRaf = true;
      report(frameCount > 0 ? 'ready' : 'initializing', true);
      rafId = requestAnimationFrame((timestamp) => draw(ownedGeneration, timestamp));
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
    updatePointer(nextPointer) { pointer = nextPointer; },
  };
}
