import { Renderer } from 'ogl';

import {
  hasOpticalLayoutParity,
  measureOpticalLayout,
  serializeOpticalBounds,
  type OpticalLayout,
} from '../layout';
import { createOpticalOglResourceLedger, type OpticalOglResourceCounts } from './resources';
import { OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES } from '../runtime-policy';

export interface OpticalOglRendererSnapshot {
  activeRaf: boolean;
  contextStatus: 'initializing' | 'ready' | 'unavailable' | 'disposed';
  firstCompleteFrame: boolean;
  frameCount: number;
  layoutStable: boolean;
  mode: 'webgl2-full';
  qualityTier: 'shell';
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

  const gl = renderer.gl as WebGL2RenderingContext;
  const ledger = createOpticalOglResourceLedger(gl);
  let acceptedLayout: OpticalLayout | null = null;
  let activeRaf = false;
  let disposed = false;
  let frameCount = 0;
  let rafId: number | null = null;
  let stableBounds = 'pending';

  const report = (
    contextStatus: OpticalOglRendererSnapshot['contextStatus'],
    layoutStable = acceptedLayout !== null,
  ) => onSnapshot({
    activeRaf,
    contextStatus,
    firstCompleteFrame: false,
    frameCount,
    layoutStable,
    mode: 'webgl2-full',
    qualityTier: 'shell',
    resourceCounts: disposed ? emptyResourceCounts() : ledger.counts(),
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    frameCount += 1;
    report('ready', layoutStable);
    rafId = requestAnimationFrame(draw);
  };

  const resize = () => {
    void readLayout().then((layout) => {
      if (disposed) return;
      acceptedLayout = layout;
      stableBounds = serializeOpticalBounds(layout.title);
      renderer.setSize(layout.viewport.width, layout.viewport.height);
      report(frameCount > 0 ? 'ready' : 'initializing');
    }).catch(() => {
      if (disposed) return;
      activeRaf = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      ledger.dispose();
      report('unavailable', false);
    });
  };

  report('initializing', false);
  void readLayout().then(async (layout) => {
    if (disposed) return;
    acceptedLayout = layout;
    stableBounds = serializeOpticalBounds(layout.title);
    renderer.setSize(layout.viewport.width, layout.viewport.height);

    // The shell deliberately keeps DOM ink. This parity re-read is the publication
    // guard Task 4 must satisfy before any GPU title can replace semantic ink.
    const publicationLayout = await readLayout();
    if (disposed) return;
    const layoutStable = hasOpticalLayoutParity(layout, publicationLayout);
    if (!layoutStable) {
      ledger.dispose();
      report('unavailable', false);
      return;
    }
    activeRaf = true;
    rafId = requestAnimationFrame(draw);
  }).catch(() => {
    if (disposed) return;
    ledger.dispose();
    report('unavailable', false);
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      activeRaf = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      ledger.dispose();
      report('disposed', false);
    },
    resize,
  };
}
