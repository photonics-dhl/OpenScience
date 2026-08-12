import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';

import {
  createParticleGrid,
  fitParticleViewport,
  mapParticlePointer,
  type OpticalParticleGeometry,
  type ParticleViewportFit,
} from './particle-grid';
import { CENTRAL_PARTICLE_WEBGL_ATTRIBUTES } from './runtime-policy';
import {
  CENTRAL_PARTICLE_FRAGMENT_SHADER,
  CENTRAL_PARTICLE_VERTEX_SHADER,
} from './shaders/particle';
import { createTouchTexture } from './touch-texture';

export type CentralParticleRenderer = {
  dispose(): void;
  pause(): void;
  render(): void;
  renderDebugFrame(state: { pointer: [number, number]; timeMs: number }): void;
  resize(bounds: DOMRectReadOnly): Promise<void>;
  resume(): void;
  setPointer(pointer: { velocity: number; x: number; y: number }): void;
};

type CreateThreeRenderer = (
  parameters: ConstructorParameters<typeof WebGLRenderer>[0],
) => WebGLRenderer;

type TouchTexture = ReturnType<typeof createTouchTexture>;

type RendererDependencies = {
  clearLoadTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
  createTouchTexture?: () => TouchTexture;
  loadGeometry?: (signal: AbortSignal) => Promise<OpticalParticleGeometry>;
  scheduleLoadTimeout?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
};

const DESIGN_VIEWPORT = { height: 935, width: 1672 } as const;
const GEOMETRY_LOAD_TIMEOUT_MS = 8_000;

async function loadOpticalGeometry(signal: AbortSignal) {
  const response = await fetch('/optical-prototype/title-geometry.json', { signal });
  if (!response.ok) throw new Error(`Unable to load optical title geometry (${response.status}).`);
  return response.json() as Promise<OpticalParticleGeometry>;
}

export function createCentralParticleRenderer(
  canvas: HTMLCanvasElement,
  createThreeRenderer: CreateThreeRenderer = (parameters) => new WebGLRenderer(parameters),
  dependencies: RendererDependencies = {},
): CentralParticleRenderer {
  const context = canvas.getContext('webgl2', CENTRAL_PARTICLE_WEBGL_ATTRIBUTES);
  if (!context) throw new Error('WebGL2 is required for the central particle prototype.');

  let renderer: WebGLRenderer;
  try {
    renderer = createThreeRenderer({ canvas, context });
  } catch (error) {
    context.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
  let camera!: OrthographicCamera;
  let scene!: Scene;
  let touch: TouchTexture | null = null;
  let pointer!: Vector2;
  let material: ShaderMaterial | null = null;
  let abortController: AbortController | null = null;
  let ready!: Promise<void>;
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  let geometry: PlaneGeometry | null = null;
  let particles: InstancedMesh | null = null;
  let disposed = false;
  let loadFailure: Error | null = null;
  let frame = 0;
  let lastFrameAt = performance.now();
  let lastPointerAt = lastFrameAt;
  let lastPointer = { x: 0.573, y: 0.5 };
  let running = false;
  let sized = false;
  let viewportFit: ParticleViewportFit = fitParticleViewport(DESIGN_VIEWPORT, { height: 1, width: 1 });
  let designViewport: { height: number; width: number } = { ...DESIGN_VIEWPORT };
  let uniforms: {
    uDesignOffset: { value: Vector2 };
    uDesignScale: { value: number };
    uDesignViewport: { value: Vector2 };
    uPointer: { value: Vector2 };
    uTouch: { value: TouchTexture['texture'] };
  };

  const clearLoadTimeout = dependencies.clearLoadTimeout ?? clearTimeout;
  const scheduleLoadTimeout = dependencies.scheduleLoadTimeout ?? setTimeout;
  try {
    renderer.setClearColor(0x000000, 0);
    camera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
    scene = new Scene();
    touch = (dependencies.createTouchTexture ?? createTouchTexture)();
    pointer = new Vector2(lastPointer.x, lastPointer.y);
    uniforms = {
      uDesignOffset: { value: new Vector2(0, 0) },
      uDesignScale: { value: 1 },
      uDesignViewport: { value: new Vector2(DESIGN_VIEWPORT.width, DESIGN_VIEWPORT.height) },
      uPointer: { value: pointer },
      uTouch: { value: touch.texture },
    };
    material = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: CENTRAL_PARTICLE_FRAGMENT_SHADER,
      side: DoubleSide,
      transparent: true,
      uniforms,
      vertexShader: CENTRAL_PARTICLE_VERTEX_SHADER,
    });
    abortController = new AbortController();
    const loadGeometry = dependencies.loadGeometry ?? loadOpticalGeometry;
    const pendingGeometry = loadGeometry(abortController.signal);
    loadTimer = scheduleLoadTimeout(() => {
      abortController!.abort(new Error('Central particle geometry load timed out.'));
    }, GEOMETRY_LOAD_TIMEOUT_MS);
    ready = Promise.resolve(pendingGeometry)
      .then((titleGeometry) => {
        if (disposed) return;
        const grid = createParticleGrid(titleGeometry, 'high');
        const nextGeometry = new PlaneGeometry(1, 1);
        try {
          nextGeometry.setAttribute('aHome', new InstancedBufferAttribute(grid.homes, 2));
          nextGeometry.setAttribute(
            'aGroup',
            new InstancedBufferAttribute(Float32Array.from(grid.groups), 1),
          );
          const nextParticles = new InstancedMesh(nextGeometry, material!, grid.count);
          nextParticles.frustumCulled = false;
          designViewport = { ...grid.viewport };
          uniforms.uDesignViewport.value.set(grid.viewport.width, grid.viewport.height);
          geometry = nextGeometry;
          particles = nextParticles;
          scene.add(nextParticles);
        } catch (error) {
          nextGeometry.dispose();
          throw error;
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          loadFailure = abortController!.signal.reason instanceof Error
            ? abortController!.signal.reason
            : error instanceof Error ? error : new Error(String(error));
        }
      })
      .finally(() => {
        if (loadTimer !== null) clearLoadTimeout(loadTimer);
        loadTimer = null;
      });
  } catch (error) {
    if (loadTimer !== null) clearLoadTimeout(loadTimer);
    abortController?.abort();
    material?.dispose();
    touch?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }

  function publishPointer(next: { velocity: number; x: number; y: number }) {
    const normalized = {
      velocity: Math.min(1, Math.max(0, next.velocity)),
      x: Math.min(1, Math.max(0, next.x)),
      y: Math.min(1, Math.max(0, next.y)),
    };
    pointer.set(normalized.x, normalized.y);
    touch!.addPointer(normalized);
  }

  const onPointerMove = (event: PointerEvent) => {
    const now = performance.now();
    const bounds = canvas.getBoundingClientRect();
    const mapped = mapParticlePointer(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewportFit,
      designViewport,
    );
    const { x, y } = mapped;
    const elapsed = Math.max(1, now - lastPointerAt);
    const distance = Math.hypot(x - lastPointer.x, y - lastPointer.y);
    publishPointer({ velocity: Math.min(1, distance * 800 / elapsed), x, y });
    lastPointer = { x, y };
    lastPointerAt = now;
  };
  const onPointerCancel = () => touch!.clear();
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointercancel', onPointerCancel);

  function draw() {
    if (disposed || !particles || !sized) return;
    renderer.render(scene, camera);
  }

  function schedule() {
    if (!running || disposed || !particles || !sized || frame) return;
    lastFrameAt = performance.now();
    frame = window.requestAnimationFrame(tick);
  }

  function tick(now: number) {
    if (!running || disposed) return;
    touch!.update(Math.min(50, Math.max(0, now - lastFrameAt)));
    lastFrameAt = now;
    draw();
    frame = window.requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function resume() {
    if (disposed) return;
    running = true;
    schedule();
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      abortController!.abort(new Error('Central particle renderer disposed.'));
      if (loadTimer !== null) clearLoadTimeout(loadTimer);
      loadTimer = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointercancel', onPointerCancel);
      if (particles) scene.remove(particles);
      geometry?.dispose();
      material!.dispose();
      touch!.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
    pause,
    render() {
      draw();
      resume();
    },
    renderDebugFrame(state) {
      publishPointer({ velocity: 0.5, x: state.pointer[0], y: state.pointer[1] });
      touch!.update(0);
      draw();
    },
    async resize(bounds) {
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      await ready;
      if (disposed) throw new Error('Central particle renderer was disposed.');
      if (loadFailure) throw loadFailure;
      if (!particles) throw new Error('Central particle geometry did not initialize.');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      viewportFit = fitParticleViewport(designViewport, { height, width });
      uniforms.uDesignOffset.value.set(viewportFit.offsetX, viewportFit.offsetY);
      uniforms.uDesignScale.value = viewportFit.scale;
      camera.left = 0;
      camera.right = width;
      camera.top = 0;
      camera.bottom = height;
      camera.updateProjectionMatrix();
      sized = true;
      draw();
      schedule();
    },
    resume,
    setPointer: publishPointer,
  };
}
