import type { HermesPetVisualState, HermesMotionSample } from './pet-motion';
import { sampleHermesMotion } from './pet-motion';
import type { HermesActionId, HermesEffect } from './action-catalog';
import { HERMES_ACTION_CATALOG } from './action-catalog';
import { createHermesPartPoses, HERMES_PARTS } from './part-rig';
import { HERMES_PART_FRAGMENT_SHADER, HERMES_PART_VERTEX_SHADER } from './part-rig-shaders';
import { shouldContinueHermesAnimation } from './motion-mixer';
import type { OpticalOglResourceLedger } from '../optical-lab/ogl/resources';
import { HermesPetRendererError } from './hermes-renderer-error';

export { createWankoRendererController } from './wanko-renderer-controller';
export { createWankoLive2DRenderer } from './wanko-live2d-renderer';
export { HermesPetRendererError } from './hermes-renderer-error';
export {
  getWankoModelPlacement,
  resolveWankoPresentationVariant,
  setWankoNativePresentation,
} from './wanko-model-presentation';

export interface HermesPetMeshInput {
  action?: HermesActionId;
  actionStartedAtMs?: number;
  engaged: boolean;
  motionTimeMs?: number;
  pointer: { x: number; y: number };
  state: HermesPetVisualState;
}

export interface HermesPetMeshSnapshot {
  drawnAt: number;
  firstFrame: boolean;
  gesture: HermesMotionSample['gesture'];
  headAngle: number;
  status: 'ready' | 'disposed';
  tailAngle: number;
  torsoScale: number;
}

export interface HermesPetMeshRenderer {
  dispose(): void;
  resize(): void;
  setSuspended(suspended: boolean): void;
  wake(): void;
}

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

const damp = (current: number, target: number, deltaMs: number, responseMs: number) => (
  current + (target - current) * (1 - Math.exp(-Math.max(0, deltaMs) / responseMs))
);

const effectUniform = (effect: { kind: HermesEffect; progress: number }) => {
  const progress = Math.max(0, Math.min(1, effect.progress));
  return [
    effect.kind === 'star-wake' ? progress : 0,
    effect.kind === 'evidence-sequence' ? progress : 0,
    effect.kind === 'citation-arc' ? progress : 0,
    effect.kind === 'particles' ? progress : 0,
  ];
};

export async function createHermesPetMeshRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  getInput: () => HermesPetMeshInput,
  onSnapshot: (snapshot: HermesPetMeshSnapshot) => void,
  signal?: AbortSignal,
): Promise<HermesPetMeshRenderer> {
  if (signal?.aborted) throw new DOMException('Hermes renderer initialization aborted', 'AbortError');
  const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    stencil: false,
  };
  const ownedContext = canvas.getContext('webgl2', contextAttributes);
  if (!ownedContext) throw new HermesPetRendererError('webgl2-unavailable');
  let ledger: OpticalOglResourceLedger | null = null;
  let resourcesDisposed = false;
  const disposeResources = () => {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    ledger?.dispose();
    ownedContext.getExtension('WEBGL_lose_context')?.loseContext();
  };
  const abortError = () => new DOMException('Hermes renderer initialization aborted', 'AbortError');
  let rejectAbort: ((error: DOMException) => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const handleAbort = () => {
    disposeResources();
    rejectAbort?.(abortError());
  };
  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    const pendingResources = Promise.all([
      import('ogl'),
      Promise.all([
        loadImage('/hermes/pet/hermes-pet-idle.png').catch(() => { throw new HermesPetRendererError('asset-load-failed'); }),
        loadImage('/hermes/pet/hermes-pet-blink.png').catch(() => { throw new HermesPetRendererError('asset-load-failed'); }),
        loadImage('/hermes/pet/hermes-pet-working.png').catch(() => { throw new HermesPetRendererError('asset-load-failed'); }),
      ]),
      import('../optical-lab/ogl/resources'),
    ]);
    const [{ Mesh, Plane, Program, Renderer, Texture }, images, { createOpticalOglResourceLedger }] = await Promise.race([
      pendingResources,
      aborted,
    ]);
    if (signal?.aborted) throw abortError();
    const renderer = new Renderer({
      ...contextAttributes,
      canvas,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      webgl: 2,
    });
    if (!renderer.isWebgl2) throw new HermesPetRendererError('webgl2-unavailable');
    const gl = renderer.gl as WebGL2RenderingContext & typeof renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    ledger = createOpticalOglResourceLedger(gl);
    const textures = [];
    for (const image of images) {
      const texture = new Texture(gl, {
        flipY: true,
        generateMipmaps: true,
        image,
        magFilter: gl.LINEAR,
        minFilter: gl.LINEAR_MIPMAP_LINEAR,
        premultiplyAlpha: false,
      });
      ledger.trackTexture(texture);
      textures.push(texture);
    }
  const geometry = new Plane(gl, { height: 1, heightSegments: 28, width: 1, widthSegments: 28 });
  ledger.trackGeometry(geometry);
  const program = new Program(gl, {
    cullFace: false,
    depthTest: false,
    depthWrite: false,
    fragment: HERMES_PART_FRAGMENT_SHADER,
    transparent: true,
    uniforms: {
      tBlink: { value: textures[1] },
      tIdle: { value: textures[0] },
      tWorking: { value: textures[2] },
      uEffect: { value: [0, 0, 0, 0] },
      uEvidenceNodes: { value: [0, 0, 0] },
      uForepaws: { value: [0, 0, 0] },
      uGaze: { value: [0, 0] },
      uHead: { value: [0, 0, 0] },
      uCrown: { value: [0, 0, 0] },
      uTail: { value: [0, 0, 0] },
      uTextureMix: { value: 0 },
      uTorso: { value: [0, 0, 0] },
      uViewport: { value: [1, 1] },
      uWorking: { value: 0 },
    },
    vertex: HERMES_PART_VERTEX_SHADER,
  });
  program.setBlendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  ledger.trackProgram(program);
  const mesh = new Mesh(gl, { geometry, program });
  let disposed = false;
  let firstFrame = false;
  let suspended = false;
  let rafId: number | null = null;
  let startedAt = performance.now();
  let previousAt = startedAt;
  let previousGesture: HermesMotionSample['gesture'] = 'rest';
  let previousSnapshotAt = Number.NEGATIVE_INFINITY;
  let current = sampleHermesMotion({ elapsedMs: 0, engaged: false, pointer: { x: 0, y: 0 }, reducedMotion: false, state: 'idle' });

  const resize = () => {
    if (disposed) return;
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height);
    program.uniforms.uViewport.value = [width, height];
  };

  const schedule = () => {
    if (!disposed && !suspended && rafId === null) rafId = requestAnimationFrame(draw);
  };

  const draw = (now: number) => {
    rafId = null;
    if (disposed || suspended) return;
    const deltaMs = Math.min(50, Math.max(0, now - previousAt));
    previousAt = now;
    const input = getInput();
    const target = sampleHermesMotion({
      action: input.action,
      actionElapsedMs: input.actionStartedAtMs === undefined ? undefined : Math.max(0, now - input.actionStartedAtMs),
      elapsedMs: input.motionTimeMs ?? now - startedAt,
      engaged: input.engaged,
      pointer: input.pointer,
      reducedMotion: false,
      state: input.state,
    });
    current = {
      ...target,
      crownAngle: damp(current.crownAngle, target.crownAngle, deltaMs, input.engaged ? 75 : 120),
      gaze: {
        x: damp(current.gaze.x, target.gaze.x, deltaMs, 58),
        y: damp(current.gaze.y, target.gaze.y, deltaMs, 58),
      },
      head: {
        angle: damp(current.head.angle, target.head.angle, deltaMs, input.engaged ? 70 : 120),
        x: damp(current.head.x, target.head.x, deltaMs, input.engaged ? 70 : 120),
        y: damp(current.head.y, target.head.y, deltaMs, input.engaged ? 70 : 120),
      },
      tail: {
        angle: damp(current.tail.angle, target.tail.angle, deltaMs, input.engaged ? 250 : 185),
        curl: damp(current.tail.curl, target.tail.curl, deltaMs, input.engaged ? 250 : 185),
      },
      torso: {
        angle: damp(current.torso.angle, target.torso.angle, deltaMs, 175),
        scale: damp(current.torso.scale, target.torso.scale, deltaMs, 210),
        x: damp(current.torso.x, target.torso.x, deltaMs, 175),
        y: damp(current.torso.y, target.torso.y, deltaMs, 175),
      },
    };
    program.uniforms.uEffect.value = effectUniform(current.effect);
    program.uniforms.uGaze.value = [current.gaze.x, current.gaze.y];
    program.uniforms.uWorking.value = current.working ? 1 : 0;
    const actionElapsedMs = input.actionStartedAtMs === undefined ? 0 : Math.max(0, now - input.actionStartedAtMs);
    const actionDurationMs = input.action ? HERMES_ACTION_CATALOG[input.action].durationMs : 1;
    const actionProgress = Math.min(1, actionElapsedMs / Math.max(1, actionDurationMs));
    const partPoses = createHermesPartPoses(current, input.action, actionProgress);
    program.uniforms.uTorso.value = [partPoses.torso.x, partPoses.torso.y, partPoses.torso.angle];
    program.uniforms.uTail.value = [partPoses.tail.x, partPoses.tail.y, partPoses.tail.angle];
    program.uniforms.uForepaws.value = [partPoses.forepaws.x, partPoses.forepaws.y, partPoses.forepaws.angle];
    program.uniforms.uHead.value = [partPoses.head.x, partPoses.head.y, partPoses.head.angle];
    program.uniforms.uCrown.value = [partPoses.crown.x, partPoses.crown.y, partPoses.crown.angle];
    program.uniforms.uEvidenceNodes.value = [partPoses.evidenceNodes.x, partPoses.evidenceNodes.y, partPoses.evidenceNodes.angle];
    program.uniforms.uTextureMix.value = partPoses.face.textureMix ?? 0;
    renderer.render({ clear: true, frustumCull: false, scene: mesh, sort: false });
    canvas.dataset.hermesRigParts = String(HERMES_PARTS.length);
    canvas.dataset.hermesGesture = current.gesture;
    canvas.dataset.hermesHead = `${current.head.x.toFixed(3)},${current.head.y.toFixed(3)},${current.head.angle.toFixed(3)}`;
    canvas.dataset.hermesTorso = `${current.torso.x.toFixed(3)},${current.torso.y.toFixed(3)},${current.torso.angle.toFixed(3)},${current.torso.scale.toFixed(4)}`;
    canvas.dataset.hermesTail = `${current.tail.angle.toFixed(3)},${current.tail.curl.toFixed(4)}`;
    if (!firstFrame || current.gesture !== previousGesture || now - previousSnapshotAt >= 500) {
      firstFrame = true;
      previousGesture = current.gesture;
      previousSnapshotAt = now;
      onSnapshot({
        drawnAt: now,
        firstFrame,
        gesture: current.gesture,
        headAngle: current.head.angle,
        status: 'ready',
        tailAngle: current.tail.angle,
        torsoScale: current.torso.scale,
      });
    }
    const continuing = shouldContinueHermesAnimation(current, target);
    canvas.dataset.hermesAnimating = continuing ? 'true' : 'false';
    if (continuing) schedule();
  };

  resize();
  schedule();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      signal?.removeEventListener('abort', handleAbort);
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      disposeResources();
      onSnapshot({ drawnAt: previousAt, firstFrame, gesture: previousGesture, headAngle: current.head.angle, status: 'disposed', tailAngle: current.tail.angle, torsoScale: current.torso.scale });
    },
    resize,
    setSuspended(next) {
      if (disposed || suspended === next) return;
      suspended = next;
      if (suspended && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!suspended) {
        const now = performance.now();
        startedAt += now - previousAt;
        previousAt = now;
        schedule();
      }
    },
    wake() {
      if (disposed || suspended) return;
      previousAt = performance.now();
      schedule();
    },
    };
  } catch (error) {
    signal?.removeEventListener('abort', handleAbort);
    disposeResources();
    throw error;
  }
}
