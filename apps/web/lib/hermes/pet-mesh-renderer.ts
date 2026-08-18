import type { HermesPetVisualState, HermesMotionSample } from './pet-motion';
import { sampleHermesMotion } from './pet-motion';
import type { HermesActionId, HermesEffect } from './action-catalog';
import { shouldContinueHermesAnimation } from './motion-mixer';
import type { OpticalOglResourceLedger } from '../optical-lab/ogl/resources';

export interface HermesPetMeshInput {
  action?: HermesActionId;
  actionStartedAtMs?: number;
  engaged: boolean;
  motionTimeMs?: number;
  pointer: { x: number; y: number };
  state: HermesPetVisualState;
}

export interface HermesPetMeshSnapshot {
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

const VERTEX_SHADER = /* glsl */ `#version 300 es
  precision highp float;
  in vec3 position;
  in vec2 uv;
  uniform vec2 uViewport;
  uniform vec3 uHead;
  uniform vec4 uTorso;
  uniform vec3 uTail;
  uniform float uCrown;
  out vec2 vUv;

  vec2 rotateAt(vec2 point, vec2 pivot, float degreesValue, vec2 translation, float weight) {
    float angle = radians(degreesValue * weight);
    float cosine = cos(angle);
    float sine = sin(angle);
    vec2 local = point - pivot;
    vec2 rotated = vec2(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
    vec2 transformed = pivot + rotated + translation / max(uViewport, vec2(1.0)) * weight;
    return mix(point, transformed, weight);
  }

  void main() {
    vec2 point = uv;
    float torsoWeight = smoothstep(.18, .36, uv.y) * (1.0 - smoothstep(.70, .84, uv.y));
    torsoWeight *= smoothstep(.10, .28, uv.x) * (1.0 - smoothstep(.86, .98, uv.x));
    float tailWeight = smoothstep(.48, .75, uv.x) * (1.0 - smoothstep(.58, .78, uv.y));
    tailWeight = max(tailWeight, smoothstep(.52, .72, uv.x) * (1.0 - smoothstep(.15, .42, uv.y)));
    float headWeight = smoothstep(.48, .68, uv.y) * (1.0 - smoothstep(.52, .68, uv.x));
    float crownWeight = smoothstep(.73, .88, uv.y) * (1.0 - smoothstep(.58, .72, uv.x));

    vec2 torsoPivot = vec2(.43, .43);
    vec2 torsoLocal = point - torsoPivot;
    vec2 torsoScaled = torsoPivot + vec2(torsoLocal.x, torsoLocal.y * uTorso.w);
    point = mix(point, torsoScaled, torsoWeight * .82);
    point = rotateAt(point, torsoPivot, uTorso.z, uTorso.xy, torsoWeight);

    point.y += sin(clamp((uv.x - .48) * 2.25, 0.0, 1.0) * 3.14159265) * uTail.z * tailWeight;
    point = rotateAt(point, vec2(.60, .39), uTail.x, vec2(0.0), tailWeight);
    point = rotateAt(point, vec2(.36, .54), uHead.z, uHead.xy, headWeight);
    point = rotateAt(point, vec2(.35, .67), uCrown, vec2(0.0), crownWeight);

    vUv = uv;
    gl_Position = vec4(point * 2.0 - 1.0, position.z, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
  precision highp float;
  uniform sampler2D tIdle;
  uniform sampler2D tBlink;
  uniform sampler2D tWorking;
  uniform vec2 uGaze;
  uniform float uBlink;
  uniform float uWorking;
  uniform vec4 uEffect;
  in vec2 vUv;
  out vec4 outColor;

  void main() {
    float leftEye = 1.0 - smoothstep(.045, .095, distance(vUv, vec2(.205, .705)));
    float rightEye = 1.0 - smoothstep(.045, .105, distance(vUv, vec2(.365, .705)));
    float gazeMask = max(leftEye, rightEye);
    vec2 sampledUv = vUv - uGaze * .009 * gazeMask;
    vec4 idle = texture(tIdle, sampledUv);
    vec4 blink = texture(tBlink, sampledUv);
    vec4 working = texture(tWorking, sampledUv);
    vec4 resting = mix(idle, blink, clamp(uBlink, 0.0, 1.0));
    outColor = mix(resting, working, clamp(uWorking, 0.0, 1.0));
    vec3 effectTint = uEffect.x * vec3(.16, .52, .70)
      + uEffect.y * vec3(.48, .64, .42)
      + uEffect.z * vec3(.64, .42, .18)
      + uEffect.w * vec3(.58, .36, .70);
    float inkEdge = smoothstep(.025, .22, outColor.a) * (1.0 - smoothstep(.70, .98, outColor.a));
    outColor.rgb += effectTint * inkEdge * .18;
  }
`;

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
  if (!ownedContext) throw new Error('Hermes articulated mesh requires WebGL2');
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
        loadImage('/hermes/pet/hermes-pet-idle.png'),
        loadImage('/hermes/pet/hermes-pet-blink.png'),
        loadImage('/hermes/pet/hermes-pet-working.png'),
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
    if (!renderer.isWebgl2) throw new Error('Hermes articulated mesh requires WebGL2');
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
    fragment: FRAGMENT_SHADER,
    transparent: true,
    uniforms: {
      tBlink: { value: textures[1] },
      tIdle: { value: textures[0] },
      tWorking: { value: textures[2] },
      uBlink: { value: 0 },
      uCrown: { value: 0 },
      uEffect: { value: [0, 0, 0, 0] },
      uGaze: { value: [0, 0] },
      uHead: { value: [0, 0, 0] },
      uTail: { value: [0, 0, 0] },
      uTorso: { value: [0, 0, 0, 1] },
      uViewport: { value: [1, 1] },
      uWorking: { value: 0 },
    },
    vertex: VERTEX_SHADER,
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
    program.uniforms.uBlink.value = current.blink;
    program.uniforms.uCrown.value = current.crownAngle;
    program.uniforms.uEffect.value = effectUniform(current.effect);
    program.uniforms.uGaze.value = [current.gaze.x, current.gaze.y];
    program.uniforms.uHead.value = [current.head.x, current.head.y, current.head.angle];
    program.uniforms.uTail.value = [current.tail.angle, 0, current.tail.curl];
    program.uniforms.uTorso.value = [current.torso.x, current.torso.y, current.torso.angle, current.torso.scale];
    program.uniforms.uWorking.value = current.working ? 1 : 0;
    renderer.render({ clear: true, frustumCull: false, scene: mesh, sort: false });
    canvas.dataset.hermesGesture = current.gesture;
    canvas.dataset.hermesHead = `${current.head.x.toFixed(3)},${current.head.y.toFixed(3)},${current.head.angle.toFixed(3)}`;
    canvas.dataset.hermesTorso = `${current.torso.x.toFixed(3)},${current.torso.y.toFixed(3)},${current.torso.angle.toFixed(3)},${current.torso.scale.toFixed(4)}`;
    canvas.dataset.hermesTail = `${current.tail.angle.toFixed(3)},${current.tail.curl.toFixed(4)}`;
    if (!firstFrame || current.gesture !== previousGesture) {
      firstFrame = true;
      previousGesture = current.gesture;
      onSnapshot({
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
      onSnapshot({ firstFrame, gesture: previousGesture, headAngle: current.head.angle, status: 'disposed', tailAngle: current.tail.angle, torsoScale: current.torso.scale });
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
