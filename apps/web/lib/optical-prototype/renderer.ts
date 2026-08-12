import {
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three';

import { CENTRAL_PARTICLE_WEBGL_ATTRIBUTES } from './runtime-policy';

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

export function createCentralParticleRenderer(
  canvas: HTMLCanvasElement,
  createThreeRenderer: CreateThreeRenderer = (parameters) => new WebGLRenderer(parameters),
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
  renderer.setClearColor(0x000000, 0);
  const camera = new OrthographicCamera(0, 1, 1, 0, -1, 1);
  const scene = new Scene();
  let disposed = false;
  let frame = 0;
  let running = false;

  function draw() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  function tick() {
    if (!running || disposed) return;
    draw();
    frame = window.requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function resume() {
    if (running || disposed) return;
    running = true;
    frame = window.requestAnimationFrame(tick);
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      renderer.dispose();
      renderer.forceContextLoss();
    },
    pause,
    render() {
      draw();
      resume();
    },
    renderDebugFrame() {
      draw();
    },
    async resize(bounds) {
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.left = 0;
      camera.right = width;
      camera.top = 0;
      camera.bottom = height;
      camera.updateProjectionMatrix();
      draw();
    },
    resume,
    setPointer() {},
  };
}
