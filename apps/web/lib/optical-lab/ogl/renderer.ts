import { Renderer } from 'ogl';

import {
  hasOpticalLayoutParity,
  measureOpticalLayout,
  serializeOpticalBounds,
  type OpticalLayout,
} from '../layout';
import { OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES } from '../runtime-policy';
import { createGlyphPass, loadOpticalGlyphAtlases, type OpticalGlyphPass } from './glyph-pass';
import type { OpticalOglResourceCounts } from './resources';

export interface OpticalOglRendererSnapshot {
  activeRaf: boolean;
  contextStatus: 'initializing' | 'ready' | 'unavailable' | 'disposed';
  firstCompleteFrame: boolean;
  frameCount: number;
  layoutStable: boolean;
  mode: 'webgl2-full';
  qualityTier: 'msdf-glyph';
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
  let disposed = false;
  let firstCompleteFrame = false;
  let frameCount = 0;
  let glyphPass: OpticalGlyphPass | null = null;
  let rafId: number | null = null;
  let stableBounds = 'pending';

  const report = (
    contextStatus: OpticalOglRendererSnapshot['contextStatus'],
    layoutStable = acceptedLayout !== null,
  ) => onSnapshot({
    activeRaf,
    contextStatus,
    firstCompleteFrame,
    frameCount,
    layoutStable,
    mode: 'webgl2-full',
    qualityTier: 'msdf-glyph',
    resourceCounts: disposed ? emptyResourceCounts() : glyphPass?.resourceCounts() ?? emptyResourceCounts(),
    stableBounds,
  });

  const readLayout = async () => {
    const science = stage.querySelector<HTMLElement>('[data-optical-lab-science="true"]');
    const evolves = stage.querySelector<HTMLElement>('[data-optical-lab-evolves="true"]');
    if (!science || !evolves) throw new Error('Optical Lab semantic word bounds are unavailable');
    return measureOpticalLayout(stage, science, evolves);
  };

  const draw = () => {
    if (disposed) return;
    const layoutStable = acceptedLayout !== null;
    try {
      if (!glyphPass?.render(null)) throw new Error('Optical Lab MSDF color+mask frame is incomplete');
      frameCount += 1;
      firstCompleteFrame = layoutStable;
      report('ready', layoutStable);
      rafId = requestAnimationFrame(draw);
    } catch {
      activeRaf = false;
      firstCompleteFrame = false;
      glyphPass?.dispose();
      glyphPass = null;
      report('unavailable', false);
    }
  };

  const resize = () => {
    firstCompleteFrame = false;
    report(frameCount > 0 ? 'ready' : 'initializing');
    void readLayout().then((layout) => {
      if (disposed) return;
      acceptedLayout = layout;
      stableBounds = serializeOpticalBounds(layout.title);
      renderer.setSize(layout.viewport.width, layout.viewport.height);
      glyphPass?.resize(layout);
      report(frameCount > 0 ? 'ready' : 'initializing');
    }).catch(() => {
      if (disposed) return;
      activeRaf = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      glyphPass?.dispose();
      glyphPass = null;
      report('unavailable', false);
    });
  };

  report('initializing', false);
  void readLayout().then(async (layout) => {
    if (disposed) return;
    acceptedLayout = layout;
    stableBounds = serializeOpticalBounds(layout.title);
    renderer.setSize(layout.viewport.width, layout.viewport.height);

    const atlases = await loadOpticalGlyphAtlases();
    if (disposed) return;
    const publicationLayout = await readLayout();
    if (disposed) return;
    const layoutStable = hasOpticalLayoutParity(layout, publicationLayout);
    if (!layoutStable) {
      report('unavailable', false);
      return;
    }
    acceptedLayout = publicationLayout;
    stableBounds = serializeOpticalBounds(publicationLayout.title);
    glyphPass = createGlyphPass(renderer.gl, publicationLayout, atlases);
    activeRaf = true;
    rafId = requestAnimationFrame(draw);
  }).catch(() => {
    if (disposed) return;
    glyphPass?.dispose();
    glyphPass = null;
    report('unavailable', false);
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      activeRaf = false;
      firstCompleteFrame = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      glyphPass?.dispose();
      glyphPass = null;
      report('disposed', false);
    },
    resize,
  };
}
