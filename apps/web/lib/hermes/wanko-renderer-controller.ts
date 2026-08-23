import type { HermesPetMeshInput, HermesPetMeshRenderer } from './pet-mesh-renderer';
import { resolveWankoPerformance, type WankoPerformance } from './wanko-action-director';

export interface WankoRuntimePort {
  destroy(): void;
  render(input: HermesPetMeshInput, performance: WankoPerformance, deltaMs: number): boolean;
  resize(width: number, height: number): void;
}

export interface WankoFrameScheduler {
  cancel(id: number): void;
  now(): number;
  request(callback: (now: number) => void): number;
}

export interface WankoRendererSnapshot {
  action?: string;
  drawnAt: number;
  status: 'disposed' | 'ready';
}

const browserScheduler: WankoFrameScheduler = {
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
};

export function createWankoRendererController(
  runtime: WankoRuntimePort,
  stage: Pick<HTMLElement, 'getBoundingClientRect'>,
  getInput: () => HermesPetMeshInput,
  onSnapshot: (snapshot: WankoRendererSnapshot) => void,
  scheduler: WankoFrameScheduler = browserScheduler,
): HermesPetMeshRenderer {
  let disposed = false;
  let suspended = false;
  let rafId: number | null = null;
  let previousAt = scheduler.now();
  let lastPublishedAt = Number.NEGATIVE_INFINITY;
  let lastPublishedAction: string | undefined;

  const resize = () => {
    if (disposed) return;
    const bounds = stage.getBoundingClientRect();
    runtime.resize(
      Math.max(1, Math.round(bounds.width)),
      Math.max(1, Math.round(bounds.height)),
    );
  };

  const schedule = () => {
    if (!disposed && !suspended && rafId === null) rafId = scheduler.request(draw);
  };

  function draw(now: number) {
    rafId = null;
    if (disposed || suspended) return;
    const deltaMs = Math.min(50, Math.max(0, now - previousAt));
    previousAt = now;
    const input = getInput();
    const performance = resolveWankoPerformance(input.action ?? 'blink-single', input.actionStartedAtMs ?? Math.floor(now));
    if (runtime.render(input, performance, deltaMs)) {
      if (input.action !== lastPublishedAction || now - lastPublishedAt >= 500) {
        lastPublishedAction = input.action;
        lastPublishedAt = now;
        onSnapshot({ action: input.action, drawnAt: now, status: 'ready' });
      }
    }
    schedule();
  }

  resize();
  schedule();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (rafId !== null) scheduler.cancel(rafId);
      rafId = null;
      runtime.destroy();
      onSnapshot({ action: getInput().action, drawnAt: previousAt, status: 'disposed' });
    },
    resize,
    setSuspended(next) {
      if (disposed || suspended === next) return;
      suspended = next;
      if (suspended) {
        if (rafId !== null) scheduler.cancel(rafId);
        rafId = null;
        return;
      }
      previousAt = scheduler.now();
      schedule();
    },
    wake() {
      if (disposed || suspended) return;
      previousAt = scheduler.now();
      schedule();
    },
  };
}
