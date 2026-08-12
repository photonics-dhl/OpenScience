export type CentralParticleCanvas = { remove(): void };

export type CentralParticleRuntimeRenderer = {
  dispose(): void;
  pause(): void;
  render(): void;
  resize(bounds: DOMRectReadOnly): Promise<void> | void;
  resume(): void;
};

type LifecycleDependencies = {
  createCanvas(): CentralParticleCanvas;
  createRenderer(canvas: CentralParticleCanvas, canvasGeneration: number): CentralParticleRuntimeRenderer;
  mountCanvas?(canvas: CentralParticleCanvas): void;
  publishFrame(generation: number): void;
  retractFrame?(): void;
};

type ContextLossDependencies = {
  contextLost(): void;
  isCancelled(): boolean;
  isCurrentOwner?(): boolean;
  isRecoverable?(): boolean;
  replaceResizeObserver(): void;
  restore(): boolean;
};

export function createCentralParticleResizeObserver({
  Observer = ResizeObserver,
  owner,
  target,
}: {
  Observer?: typeof ResizeObserver;
  owner: Pick<ReturnType<typeof createCentralParticleLifecycle>, 'resize'>;
  target: Element;
}) {
  const observer = new Observer(([entry]) => {
    if (entry) void owner.resize(entry.contentRect);
  });
  observer.observe(target);
  return observer;
}

export function handleCentralParticleContextLoss(
  event: Pick<Event, 'preventDefault'>,
  dependencies: ContextLossDependencies,
): boolean {
  event.preventDefault();
  if (dependencies.isCancelled()) return false;
  if (dependencies.isCurrentOwner && !dependencies.isCurrentOwner()) return false;
  if (dependencies.isRecoverable && !dependencies.isRecoverable()) return false;
  dependencies.contextLost();
  if (!dependencies.restore()) return false;
  dependencies.replaceResizeObserver();
  return true;
}

export function createCentralParticleLifecycle(dependencies: LifecycleDependencies) {
  let active = false;
  let canvas: CentralParticleCanvas | null = null;
  let canvasGeneration = 0;
  let disposed = false;
  let rafScheduled = false;
  let renderer: CentralParticleRuntimeRenderer | null = null;
  let resizeGeneration = 0;
  let isVisible = true;

  function release() {
    const ownedRenderer = renderer;
    const ownedCanvas = canvas;
    const ownedResources = Boolean(ownedRenderer || ownedCanvas || active || rafScheduled);
    renderer = null;
    canvas = null;
    active = false;
    rafScheduled = false;
    ownedRenderer?.dispose();
    ownedCanvas?.remove();
    if (ownedResources) dependencies.retractFrame?.();
  }

  function start() {
    if (disposed || renderer) return false;
    const nextCanvas = dependencies.createCanvas();
    canvas = nextCanvas;
    canvasGeneration += 1;
    try {
      renderer = dependencies.createRenderer(nextCanvas, canvasGeneration);
      dependencies.mountCanvas?.(nextCanvas);
      active = true;
      renderer.render();
      rafScheduled = true;
      if (!isVisible) {
        renderer.pause();
        rafScheduled = false;
      }
      return true;
    } catch {
      release();
      return false;
    }
  }

  async function resize(bounds: DOMRectReadOnly) {
    if (!renderer || !active) return;
    const ownedRenderer = renderer;
    const generation = ++resizeGeneration;
    try {
      await ownedRenderer.resize(bounds);
    } catch {
      if (renderer === ownedRenderer) {
        resizeGeneration += 1;
        release();
      }
      return;
    }
    if (generation === resizeGeneration && renderer === ownedRenderer && active) {
      dependencies.publishFrame(generation);
    }
  }

  return {
    contextLost() {
      resizeGeneration += 1;
      release();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resizeGeneration += 1;
      release();
    },
    resize,
    restore() {
      return start();
    },
    setVisible(visible: boolean) {
      isVisible = visible;
      if (!renderer || !active) return;
      if (visible) {
        renderer.resume();
        rafScheduled = true;
      } else {
        renderer.pause();
        rafScheduled = false;
      }
    },
    snapshot() {
      return { active, canvasGeneration, rafScheduled, resizeGeneration };
    },
    start,
  };
}
