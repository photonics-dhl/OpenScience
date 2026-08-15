import {
  Camera,
  GLTFLoader,
  Mesh,
  Program,
  Renderer,
  Transform,
} from 'ogl';

import type { HermesVisualState } from '@/components/hermes/hermes-state';

import { hermesActionForState, type HermesActionName } from './hermes-action-map';

export interface Hermes3DSnapshot {
  action: HermesActionName;
  contextStatus: 'loading' | 'ready' | 'failed' | 'disposed';
  dpr: number;
  drawCalls: number;
  firstFrameMs: number;
  frameCount: number;
  materialPrograms: number;
  pointerX: number;
  pointerY: number;
  visible: boolean;
}

export interface Hermes3DRendererHandle {
  captureBounds(): Promise<Hermes3DSubjectBounds>;
  dispose(): void;
  resize(): void;
  setPointer(x: number, y: number): void;
  setState(state: HermesVisualState): void;
  setVisible(visible: boolean): void;
}

export interface Hermes3DSubjectBounds {
  heightRatio: number;
  nonTransparentPixels: number;
  pixelHash: number;
  widthRatio: number;
}

export interface Hermes3DRendererOptions {
  assetUrl: string;
  canvas: HTMLCanvasElement;
  onFailure(): void;
  onFirstFrame(): void;
  onSnapshot?(snapshot: Hermes3DSnapshot): void;
  state: HermesVisualState;
}

const vertex = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  uniform sampler2D boneTexture;
  uniform float boneTextureSize;
  varying vec3 vNormal;
  varying vec3 vLocalPosition;
  varying vec3 vViewPosition;

  mat4 getBoneMatrix(float index) {
    float texel = index * 4.0;
    float x = mod(texel, boneTextureSize);
    float y = floor(texel / boneTextureSize);
    float unit = 1.0 / boneTextureSize;
    y = unit * (y + 0.5);
    return mat4(
      texture2D(boneTexture, vec2(unit * (x + 0.5), y)),
      texture2D(boneTexture, vec2(unit * (x + 1.5), y)),
      texture2D(boneTexture, vec2(unit * (x + 2.5), y)),
      texture2D(boneTexture, vec2(unit * (x + 3.5), y))
    );
  }

  void main() {
    mat4 skinMatrix =
      skinWeight.x * getBoneMatrix(skinIndex.x) +
      skinWeight.y * getBoneMatrix(skinIndex.y) +
      skinWeight.z * getBoneMatrix(skinIndex.z) +
      skinWeight.w * getBoneMatrix(skinIndex.w);
    vec4 skinnedPosition = skinMatrix * vec4(position, 1.0);
    vec3 skinnedNormal = mat3(skinMatrix) * normal;
    vec4 viewPosition = modelViewMatrix * skinnedPosition;
    vLocalPosition = skinnedPosition.xyz;
    vViewPosition = viewPosition.xyz;
    vNormal = normalize(normalMatrix * skinnedNormal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform vec4 uBaseColor;
  uniform vec3 uEmissive;
  uniform float uMaterialRole;
  uniform float uStateMode;
  uniform float uTime;
  varying vec3 vLocalPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 keyDirection = normalize(vec3(-0.45, 0.72, 0.55));
    float diffuse = max(dot(normal, keyDirection), 0.0);
    float fill = 0.42 + diffuse * 0.68;
    float rim = pow(1.0 - max(dot(normal, normalize(-vViewPosition)), 0.0), 3.0);
    float guidingPulse = 0.76 + 0.24 * sin(uTime * 4.2);
    float scanningSweep = exp(-pow(vLocalPosition.y - (1.16 + 0.58 * sin(uTime * 2.4)), 2.0) * 18.0);
    float emissiveGain = 1.0;
    if (uStateMode < 0.5) {
      emissiveGain = 0.92 + 0.08 * sin(uTime * 1.35 + uMaterialRole);
    } else if (uStateMode < 1.5) {
      emissiveGain = uMaterialRole > 2.5 ? 1.08 * guidingPulse : 0.92;
    } else if (uStateMode < 2.5) {
      emissiveGain = uMaterialRole > 1.5 && uMaterialRole < 2.5 ? 0.68 + 0.92 * scanningSweep : 0.72;
    } else if (uStateMode < 3.5) {
      emissiveGain = uMaterialRole > 1.5 ? 1.12 + 0.10 * sin(uTime * 2.0) : 0.96;
    } else if (uStateMode < 4.5) {
      emissiveGain = uMaterialRole > 2.5 ? 1.34 : 0.78;
    } else {
      emissiveGain = uMaterialRole > 0.5 ? 0.28 : 0.72;
    }
    vec3 color = uBaseColor.rgb * fill + uEmissive * (0.72 * emissiveGain) + rim * vec3(0.07, 0.13, 0.15);
    gl_FragColor = vec4(color, uBaseColor.a);
  }
`;

type LoadedGltf = Awaited<ReturnType<typeof GLTFLoader.load>>;

const stateMode = (state: HermesVisualState) => ({
  awaiting_approval: 4,
  failed: 5,
  guiding: 1,
  idle: 0,
  scanning: 2,
  suggesting: 3,
})[state];

const materialRole = (nodeName: string) => {
  if (nodeName.includes('EyeIvory')) return 1;
  if (nodeName.includes('IndexCyan')) return 2;
  if (nodeName.includes('AnnotationCoral')) return 3;
  return 0;
};

function collectGltfMeshes(gltf: LoadedGltf): InstanceType<typeof Mesh>[] {
  const meshes = new Set<InstanceType<typeof Mesh>>();
  gltf.scene.forEach((root) => root.traverse((node) => {
    if (node instanceof Mesh) meshes.add(node);
  }));
  return [...meshes];
}

function removeProgram(program: InstanceType<typeof Mesh>['program']) {
  program.remove();
  program.gl.deleteShader(program.vertexShader);
  program.gl.deleteShader(program.fragmentShader);
}

function disposeGltf(gltf: LoadedGltf | null) {
  if (!gltf) return;
  const meshes = collectGltfMeshes(gltf);
  const geometries = new Set<InstanceType<typeof Mesh>['geometry']>();
  const programs = new Set<InstanceType<typeof Mesh>['program']>();
  meshes.forEach((node) => {
    geometries.add(node.geometry);
    programs.add(node.program);
  });
  geometries.forEach((geometry) => geometry.remove());
  programs.forEach(removeProgram);
  const boneTextures = new Set<WebGLTexture>();
  meshes.forEach((mesh) => {
    const boneTexture = (mesh as typeof mesh & { boneTexture?: { texture?: WebGLTexture } }).boneTexture?.texture;
    if (boneTexture) boneTextures.add(boneTexture);
  });
  boneTextures.forEach((texture) => meshes[0]?.gl.deleteTexture(texture));
  gltf.textures?.forEach((texture) => {
    if (texture.texture) texture.gl.deleteTexture(texture.texture);
  });
}

export function createHermes3DRenderer({
  assetUrl,
  canvas,
  onFailure,
  onFirstFrame,
  onSnapshot,
  state: initialState,
}: Hermes3DRendererOptions): Hermes3DRendererHandle {
  const startedAt = performance.now();
  const displayDpr = () => Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1 : 1.5);
  const renderer = new Renderer({
    alpha: true,
    antialias: true,
    canvas,
    dpr: displayDpr(),
    powerPreference: 'high-performance',
  });
  const { gl } = renderer;
  gl.clearColor(0, 0, 0, 0);

  const camera = new Camera(gl, { fov: 27, near: .1, far: 30 });
  camera.position.set(0, 1.24, 5.0);
  camera.lookAt([0, 1.22, 0]);

  const scene = new Transform();
  let actionName = hermesActionForState(initialState);
  let activeAction: LoadedGltf['animations'][number] | null = null;
  let currentState = initialState;
  let disposed = false;
  let firstFrame = false;
  let firstFrameMs = 0;
  let frameCount = 0;
  let gltf: LoadedGltf | null = null;
  let materialPrograms = 0;
  const statefulPrograms: InstanceType<typeof Program>[] = [];
  let pendingCapture: {
    reject(error: Error): void;
    resolve(bounds: Hermes3DSubjectBounds): void;
  } | null = null;
  let lastDrawAt = 0;
  let lastTimestamp = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let pointerActiveUntil = 0;
  let rafId: number | null = null;
  let visible = true;

  const publish = (contextStatus: Hermes3DSnapshot['contextStatus']) => onSnapshot?.({
    action: actionName,
    contextStatus,
    dpr: renderer.dpr,
    drawCalls: gltf ? collectGltfMeshes(gltf).length : 0,
    firstFrameMs,
    frameCount,
    materialPrograms,
    pointerX,
    pointerY,
    visible,
  });

  const cancelFrame = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.dpr = displayDpr();
    renderer.setSize(width, height);
    camera.perspective({ aspect: width / height });
  };

  const selectAction = (state: HermesVisualState) => {
    actionName = hermesActionForState(state);
    activeAction = gltf?.animations.find(({ name }) => name === actionName) ?? null;
    if (!activeAction && gltf) throw new Error(`Hermes action is absent: ${actionName}`);
    if (activeAction) {
      activeAction.animation.elapsed = 0;
      activeAction.animation.loop = state !== 'awaiting_approval' && state !== 'failed';
      activeAction.animation.update(1, true);
    }
  };

  const schedule = () => {
    if (disposed || !visible || !gltf || rafId !== null || currentState === 'awaiting_approval') return;
    rafId = requestAnimationFrame(draw);
  };

  const renderFrame = (timestamp: number) => {
    if (!gltf || disposed) return;
    const deltaSeconds = lastTimestamp ? Math.min(.05, (timestamp - lastTimestamp) / 1_000) : 0;
    lastTimestamp = timestamp;
    if (activeAction && currentState !== 'awaiting_approval') {
      activeAction.animation.elapsed += deltaSeconds;
      activeAction.animation.update(1, true);
    }
    const pointerEase = Math.min(1, deltaSeconds * 9);
    pointerX += (pointerTargetX - pointerX) * pointerEase;
    pointerY += (pointerTargetY - pointerY) * pointerEase;
    scene.rotation.y = pointerX * .095;
    scene.rotation.x = pointerY * .055;
    statefulPrograms.forEach((program) => {
      program.uniforms.uStateMode.value = stateMode(currentState);
      program.uniforms.uTime.value = activeAction?.animation.elapsed ?? timestamp / 1_000;
    });
    renderer.render({ scene, camera, sort: true, frustumCull: false });
    if (pendingCapture) {
      const capture = pendingCapture;
      pendingCapture = null;
      const width = canvas.width;
      const height = canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let left = width;
      let right = -1;
      let top = height;
      let bottom = -1;
      let nonTransparentPixels = 0;
      let pixelHash = 2_166_136_261;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          pixelHash = Math.imul(pixelHash ^ pixels[offset], 16_777_619);
          pixelHash = Math.imul(pixelHash ^ pixels[offset + 1], 16_777_619);
          pixelHash = Math.imul(pixelHash ^ pixels[offset + 2], 16_777_619);
          pixelHash = Math.imul(pixelHash ^ pixels[offset + 3], 16_777_619);
          if (pixels[offset + 3] < 8 || Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 64) continue;
          nonTransparentPixels += 1;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      capture.resolve({
        heightRatio: bottom >= top ? (bottom - top + 1) / height : 0,
        nonTransparentPixels,
        pixelHash: pixelHash >>> 0,
        widthRatio: right >= left ? (right - left + 1) / width : 0,
      });
    }
    frameCount += 1;
    if (!firstFrame) {
      firstFrame = true;
      firstFrameMs = Math.max(0, performance.now() - startedAt);
      onFirstFrame();
    }
    publish('ready');
  };

  function draw(timestamp: number) {
    rafId = null;
    if (disposed || !visible || !gltf) return;
    const activePointer = timestamp < pointerActiveUntil;
    const cadence = activePointer ? 1_000 / 60 : 1_000 / 30;
    if (timestamp - lastDrawAt >= cadence) {
      lastDrawAt = timestamp;
      renderFrame(timestamp);
    }
    schedule();
  }

  resize();
  publish('loading');
  void GLTFLoader.load(gl, assetUrl).then((loaded) => {
    if (disposed) {
      disposeGltf(loaded);
      return;
    }
    gltf = loaded;
    const meshes = collectGltfMeshes(loaded);
    meshes.forEach((node) => {
      const oldProgram = node.program;
      const material = (oldProgram as typeof oldProgram & {
        gltfMaterial?: { baseColorFactor?: [number, number, number, number]; emissiveFactor?: [number, number, number] };
      }).gltfMaterial;
      node.program = new Program(gl, {
        cullFace: false,
        fragment,
        uniforms: {
          uBaseColor: { value: material?.baseColorFactor ?? [0.72, 0.69, 0.63, 1] },
          uEmissive: { value: material?.emissiveFactor ?? [0, 0, 0] },
          uMaterialRole: { value: materialRole(node.name ?? '') },
          uStateMode: { value: stateMode(currentState) },
          uTime: { value: 0 },
        },
        vertex,
      });
      statefulPrograms.push(node.program);
      removeProgram(oldProgram);
    });
    materialPrograms = meshes.length;
    loaded.scene.forEach((node) => node.setParent(scene));
    selectAction(currentState);
    if (visible) {
      renderFrame(performance.now());
      schedule();
    } else {
      publish('ready');
    }
  }).catch(() => {
    if (disposed) return;
    publish('failed');
    onFailure();
  });

  return {
    captureBounds() {
      if (disposed || !gltf) return Promise.reject(new Error('Hermes renderer is not ready'));
      if (pendingCapture) return Promise.reject(new Error('Hermes subject capture is already pending'));
      return new Promise<Hermes3DSubjectBounds>((resolve, reject) => {
        pendingCapture = { reject, resolve };
        if (currentState === 'awaiting_approval') renderFrame(performance.now());
        else schedule();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      pendingCapture?.reject(new Error('Hermes renderer was disposed'));
      pendingCapture = null;
      disposeGltf(gltf);
      gltf = null;
      publish('disposed');
      const loseContext = gl.getExtension('WEBGL_lose_context');
      loseContext?.loseContext();
    },
    resize,
    setPointer(x, y) {
      pointerTargetX = Math.max(-1, Math.min(1, x));
      pointerTargetY = Math.max(-1, Math.min(1, y));
      pointerActiveUntil = performance.now() + 900;
      schedule();
    },
    setState(state) {
      if (disposed || state === currentState) return;
      currentState = state;
      try {
        selectAction(state);
        if (gltf) renderFrame(performance.now());
        schedule();
      } catch {
        publish('failed');
        onFailure();
      }
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      if (!visible) {
        cancelFrame();
        lastTimestamp = 0;
      } else if (gltf) {
        renderFrame(performance.now());
        schedule();
      }
      publish(gltf ? 'ready' : 'loading');
    },
  };
}
