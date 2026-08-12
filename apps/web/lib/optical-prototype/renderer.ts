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
  createContinuousTitle,
  type ContinuousTitleGeometry,
} from './continuous-title';
import { createCurtainGrid, createFieldParticleAttributes } from './curtain-grid';
import {
  createParticleGrid,
  fitParticleViewport,
  mapParticlePointer,
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
type ContinuousTitle = ReturnType<typeof createContinuousTitle>;

type RendererDependencies = {
  clearLoadTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
  createTouchTexture?: () => TouchTexture;
  fixedTimeMs?: number;
  loadGeometry?: (signal: AbortSignal) => Promise<ContinuousTitleGeometry>;
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
  return response.json() as Promise<ContinuousTitleGeometry>;
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
  if (renderer.debug) {
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      const diagnostics = [
        gl.getProgramInfoLog(program),
        gl.getShaderInfoLog(vertexShader),
        gl.getShaderInfoLog(fragmentShader),
      ].filter(Boolean).join('\n');
      throw new Error(`Central particle shader failed to compile or link.${diagnostics ? `\n${diagnostics}` : ''}`);
    };
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
  let title: ContinuousTitle | null = null;
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
    uFieldCenter: { value: Vector2 };
    uPointer: { value: Vector2 };
    uTimeMs: { value: number };
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
      uFieldCenter: { value: new Vector2(DESIGN_VIEWPORT.width * 0.573, DESIGN_VIEWPORT.height * 0.5) },
      uPointer: { value: pointer },
      uTimeMs: { value: dependencies.fixedTimeMs ?? 1500 },
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
        const glyphGrid = createParticleGrid(titleGeometry, 'high');
        const curtainGrid = createCurtainGrid(titleGeometry.viewport, 'high');
        const grid = createFieldParticleAttributes(glyphGrid, curtainGrid);
        const nextGeometry = new PlaneGeometry(1, 1);
        let nextTitle: ContinuousTitle | null = null;
        try {
          nextTitle = createContinuousTitle(
            titleGeometry,
            Math.min(window.devicePixelRatio || 1, 2),
            { touchTexture: touch!.texture },
          );
          nextGeometry.setAttribute('aHome', new InstancedBufferAttribute(grid.homes, 2));
          nextGeometry.setAttribute('aId', new InstancedBufferAttribute(grid.ids, 1));
          nextGeometry.setAttribute(
            'aGroup',
            new InstancedBufferAttribute(Float32Array.from(grid.groups), 1),
          );
          nextGeometry.setAttribute(
            'aOpacity',
            new InstancedBufferAttribute(Float32Array.from(grid.opacities), 1),
          );
          nextGeometry.setAttribute('aPhase', new InstancedBufferAttribute(grid.phases, 1));
          nextGeometry.setAttribute(
            'aRole',
            new InstancedBufferAttribute(Float32Array.from(grid.roles), 1),
          );
          const nextParticles = new InstancedMesh(nextGeometry, material!, grid.count);
          nextParticles.frustumCulled = false;
          designViewport = { ...grid.viewport };
          uniforms.uDesignViewport.value.set(grid.viewport.width, grid.viewport.height);
          uniforms.uFieldCenter.value.set(titleGeometry.center.x, titleGeometry.center.y);
          geometry = nextGeometry;
          particles = nextParticles;
          title = nextTitle;
          title.setPointer(lastPointer);
          scene.add(title.mesh);
          scene.add(nextParticles);
        } catch (error) {
          nextTitle?.dispose();
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
    title?.setPointer(normalized);
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
    if (disposed || !particles || !title || !sized) return;
    renderer.render(scene, camera);
  }

  function schedule() {
    if (!running || disposed || !particles || !title || !sized || frame) return;
    lastFrameAt = performance.now();
    frame = window.requestAnimationFrame(tick);
  }

  function tick(now: number) {
    if (!running || disposed) return;
    touch!.update(Math.min(50, Math.max(0, now - lastFrameAt)));
    uniforms.uTimeMs.value = dependencies.fixedTimeMs ?? now;
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
      if (title) scene.remove(title.mesh);
      geometry?.dispose();
      title?.dispose();
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
      uniforms.uTimeMs.value = state.timeMs;
      draw();
    },
    async resize(bounds) {
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      await ready;
      if (disposed) throw new Error('Central particle renderer was disposed.');
      if (loadFailure) throw loadFailure;
      if (!particles || !title) throw new Error('Central particle geometry did not initialize.');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      viewportFit = fitParticleViewport(designViewport, { height, width });
      uniforms.uDesignOffset.value.set(viewportFit.offsetX, viewportFit.offsetY);
      uniforms.uDesignScale.value = viewportFit.scale;
      title.setViewport(viewportFit);
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
