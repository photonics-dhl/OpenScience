import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';

import {
  ASSET_INTERACTION_LIMITS,
  createAssetInteractionState,
  injectAssetInteraction,
  stepAssetInteraction,
  type AssetInteractionInput,
  type AssetInteractionState,
} from '../asset-interaction-model';
import { OPTICAL_QUALITY_BUDGETS, OPTICAL_WEBGL2_CONTEXT_ATTRIBUTES } from '../runtime-policy';
import { createAssetFlowPass, type AssetFlowPass } from './asset-flow-pass';
import { createOpticalOglResourceLedger, type OpticalOglResourceCounts } from './resources';
import { OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER } from './shaders/asset-composite';
import { OPTICAL_ASSET_OVERLAY_FRAGMENT_SHADER } from './shaders/asset-overlay';
import { OPTICAL_FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen';

export interface AssetInteractionSnapshot {
  activeRaf: boolean;
  ambientStrength: number;
  apertureX: .58;
  causticGain: number;
  contextStatus: 'ready' | 'unavailable' | 'disposed';
  follow: number;
  patchFollowPx: number;
  pointerX: number;
  pointerY: number;
  refractionPx: { x: number; y: number };
  resourceCounts: OpticalOglResourceCounts;
  suspended: boolean;
}

export interface AssetInteractionRenderer {
  captureNextFrame(): Promise<AssetInteractionFrameCapture>;
  dispose(): void;
  resize(): void;
  setSuspended(suspended: boolean): void;
  updatePointer(input: AssetInteractionInput, now: number): void;
}

export interface AssetInteractionFrameCapture {
  base64: string;
  capturedAt: number;
  height: number;
  nonZeroAlpha: number;
  nonZeroRgb: number;
  width: number;
}

const ASSET_AMBIENT_STRENGTH = .05;

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

async function loadImage(source: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  if (typeof image.decode === 'function') await image.decode();
  else await new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error(`Unable to load ${source}`)), { once: true });
  });
  return image;
}

export async function createAssetInteractionRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  onSnapshot: (snapshot: AssetInteractionSnapshot) => void,
): Promise<AssetInteractionRenderer> {
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
  if (!renderer.isWebgl2) throw new Error('The accepted asset interaction requires WebGL2');

  const ledger = createOpticalOglResourceLedger(renderer.gl as WebGL2RenderingContext);
  let flowPass: AssetFlowPass | null = null;
  let disposed = false;
  let activeRaf = false;
  let suspended = false;
  let rafId: number | null = null;
  let state: AssetInteractionState = createAssetInteractionState(performance.now());
  let lastSample = stepAssetInteraction(state, performance.now());
  let localFlowActive = false;
  let pendingCapture: {
    reject: (reason: Error) => void;
    resolve: (capture: AssetInteractionFrameCapture) => void;
  } | null = null;

  const rejectPendingCapture = (message: string) => {
    const capture = pendingCapture;
    pendingCapture = null;
    capture?.reject(new Error(message));
  };

  const captureRenderedFrame = () => {
    const capture = pendingCapture;
    if (!capture) return;
    pendingCapture = null;
    try {
      const gl = renderer.gl as WebGL2RenderingContext;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      let nonZeroAlpha = 0;
      let nonZeroRgb = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 0) nonZeroAlpha += 1;
        if (pixels[offset] > 0 || pixels[offset + 1] > 0 || pixels[offset + 2] > 0) nonZeroRgb += 1;
      }

      const image = new ImageData(width, height);
      const rowBytes = width * 4;
      for (let sourceY = 0; sourceY < height; sourceY += 1) {
        const targetY = height - sourceY - 1;
        image.data.set(
          pixels.subarray(sourceY * rowBytes, (sourceY + 1) * rowBytes),
          targetY * rowBytes,
        );
      }
      const copy = document.createElement('canvas');
      copy.width = width;
      copy.height = height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('Unable to create the interaction frame capture context');
      context.putImageData(image, 0, 0);
      const base64 = copy.toDataURL('image/png').split(',')[1] ?? '';
      capture.resolve({
        base64,
        capturedAt: performance.now(),
        height,
        nonZeroAlpha,
        nonZeroRgb,
        width,
      });
    } catch (error) {
      capture.reject(error instanceof Error ? error : new Error('Interaction frame capture failed'));
      throw error;
    }
  };

  const report = (contextStatus: AssetInteractionSnapshot['contextStatus']) => onSnapshot({
    activeRaf,
    ambientStrength: activeRaf && !suspended ? ASSET_AMBIENT_STRENGTH : 0,
    apertureX: ASSET_INTERACTION_LIMITS.apertureX,
    causticGain: lastSample.causticGain,
    contextStatus,
    follow: lastSample.follow,
    patchFollowPx: lastSample.patchFollowPx,
    pointerX: lastSample.pointerX,
    pointerY: lastSample.pointerY,
    refractionPx: lastSample.refractionPx,
    resourceCounts: disposed
      ? emptyResourceCounts()
      : mergeResourceCounts(ledger.counts(), flowPass?.resourceCounts() ?? emptyResourceCounts()),
    suspended,
  });

  const cancelFrame = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    activeRaf = false;
  };

  const clear = () => {
    renderer.gl.bindFramebuffer(renderer.gl.FRAMEBUFFER, null);
    renderer.gl.clearColor(0, 0, 0, 0);
    renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT);
  };

  try {
    const [targetImage, energyImage] = await Promise.all([
      loadImage('/optical-lab/target-reference.png'),
      loadImage('/optical-lab/energy-plate-black-alpha-v1.png'),
    ]);
    if (disposed) throw new Error('Asset interaction renderer was disposed while loading');
    const targetTexture = new Texture(renderer.gl, {
      generateMipmaps: false,
      image: targetImage,
      magFilter: renderer.gl.LINEAR,
      minFilter: renderer.gl.LINEAR,
      wrapS: renderer.gl.CLAMP_TO_EDGE,
      wrapT: renderer.gl.CLAMP_TO_EDGE,
    });
    const energyTexture = new Texture(renderer.gl, {
      generateMipmaps: false,
      image: energyImage,
      magFilter: renderer.gl.LINEAR,
      minFilter: renderer.gl.LINEAR,
      wrapS: renderer.gl.CLAMP_TO_EDGE,
      wrapT: renderer.gl.CLAMP_TO_EDGE,
    });
    ledger.trackTexture(targetTexture);
    ledger.trackTexture(energyTexture);
    const geometry = new Triangle(renderer.gl);
    ledger.trackGeometry(geometry);
    const program = new Program(renderer.gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_ASSET_COMPOSITE_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        tEnergy: { value: energyTexture },
        tFlow: { value: null },
        tTarget: { value: targetTexture },
        uCausticGain: { value: 0 },
        uPatchFollowPx: { value: 0 },
        uRefractionPx: { value: [0, 0] },
        uViewport: { value: [1, 1] },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    ledger.trackProgram(program);
    const mesh = new Mesh(renderer.gl, { geometry, program });
    const overlayProgram = new Program(renderer.gl, {
      cullFace: false,
      depthTest: false,
      depthWrite: false,
      fragment: OPTICAL_ASSET_OVERLAY_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        tFlow: { value: null },
      },
      vertex: OPTICAL_FULLSCREEN_VERTEX_SHADER,
    });
    ledger.trackProgram(overlayProgram);
    const overlayMesh = new Mesh(renderer.gl, { geometry, program: overlayProgram });
    flowPass = createAssetFlowPass(renderer.gl);

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height));
      program.uniforms.uViewport.value = [Math.max(1, bounds.width), Math.max(1, bounds.height)];
    };

    const failRuntime = () => {
      if (disposed) return;
      rejectPendingCapture('Interaction renderer became unavailable before frame capture');
      cancelFrame();
      clear();
      flowPass?.dispose();
      flowPass = null;
      ledger.dispose();
      disposed = true;
      suspended = true;
      lastSample = stepAssetInteraction(createAssetInteractionState(), performance.now());
      report('unavailable');
    };

    const draw = (now: number) => {
      if (disposed || suspended || !activeRaf) return;
      try {
        lastSample = stepAssetInteraction(state, now);
        const visuallyActive = lastSample.active;
        if (localFlowActive && !visuallyActive) flowPass?.reset();
        localFlowActive = visuallyActive;
        const velocity: [number, number] = [
          lastSample.refractionPx.x / ASSET_INTERACTION_LIMITS.localRefractionPx,
          -lastSample.refractionPx.y / ASSET_INTERACTION_LIMITS.localRefractionPx,
        ];
        if (!flowPass?.render({
          ambientPhase: (now % 8_000) / 8_000,
          aspect: Math.max(1, stage.clientWidth) / Math.max(1, stage.clientHeight),
          localStrength: visuallyActive ? lastSample.follow : 0,
          pointer: [lastSample.pointerX, 1 - lastSample.pointerY],
          radius: ASSET_INTERACTION_LIMITS.localRadiusUv,
          velocity,
        })) {
          failRuntime();
          return;
        }
        program.uniforms.tFlow.value = flowPass.texture();
        overlayProgram.uniforms.tFlow.value = flowPass.texture();
        program.uniforms.uCausticGain.value = visuallyActive ? lastSample.causticGain : 0;
        program.uniforms.uPatchFollowPx.value = visuallyActive ? lastSample.patchFollowPx : 0;
        program.uniforms.uRefractionPx.value = visuallyActive
          ? [lastSample.refractionPx.x, -lastSample.refractionPx.y]
          : [0, 0];
        renderer.gl.clearColor(0, 0, 0, 0);
        renderer.render({ clear: true, frustumCull: false, scene: mesh, sort: false });
        if (visuallyActive) {
          renderer.render({ clear: false, frustumCull: false, scene: overlayMesh, sort: false });
        }
        captureRenderedFrame();
        report('ready');
        rafId = requestAnimationFrame(draw);
      } catch {
        failRuntime();
      }
    };

    resize();
    clear();
    activeRaf = true;
    report('ready');
    rafId = requestAnimationFrame(draw);

    return {
      captureNextFrame() {
        if (disposed || suspended || !activeRaf) {
          return Promise.reject(new Error('Interaction renderer is not producing frames'));
        }
        if (pendingCapture) {
          return Promise.reject(new Error('An interaction frame capture is already pending'));
        }
        return new Promise<AssetInteractionFrameCapture>((resolve, reject) => {
          pendingCapture = { reject, resolve };
        });
      },
      dispose() {
        if (disposed) return;
        rejectPendingCapture('Interaction renderer was disposed before frame capture');
        disposed = true;
        suspended = true;
        cancelFrame();
        flowPass?.dispose();
        flowPass = null;
        ledger.dispose();
        lastSample = stepAssetInteraction(createAssetInteractionState(), performance.now());
        report('disposed');
      },
      resize,
      setSuspended(nextSuspended) {
        if (disposed || suspended === nextSuspended) return;
        suspended = nextSuspended;
        if (suspended) {
          rejectPendingCapture('Interaction renderer was suspended before frame capture');
          cancelFrame();
          clear();
          flowPass?.reset();
          localFlowActive = false;
          state = createAssetInteractionState(performance.now());
          lastSample = stepAssetInteraction(state, performance.now());
          report('ready');
          return;
        }
        flowPass?.reset();
        localFlowActive = false;
        activeRaf = true;
        report('ready');
        rafId = requestAnimationFrame(draw);
      },
      updatePointer(input, now) {
        if (disposed) return;
        state = injectAssetInteraction(state, input, now);
        if (!activeRaf && !suspended) {
          activeRaf = true;
          report('ready');
          rafId = requestAnimationFrame(draw);
        }
      },
    };
  } catch (error) {
    cancelFrame();
    flowPass?.dispose();
    ledger.dispose();
    clear();
    disposed = true;
    report('unavailable');
    throw error;
  }
}
