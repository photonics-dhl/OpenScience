export interface OwnedOpticalRenderer {
  dispose(): void;
  resize(): void;
}

export interface OpticalRendererOwnership {
  attach(
    canvas: Pick<HTMLCanvasElement, 'remove'>,
    renderer: OwnedOpticalRenderer,
    removeListeners: () => void,
  ): void;
  current(): {
    canvas: Pick<HTMLCanvasElement, 'remove'> | null;
    renderer: OwnedOpticalRenderer | null;
  };
  suspendForContextRestore(): void;
  teardown(): void;
  teardownForUnavailable(afterTeardown: () => void): void;
}

export function createOpticalRendererOwnership(): OpticalRendererOwnership {
  let canvas: Pick<HTMLCanvasElement, 'remove'> | null = null;
  let renderer: OwnedOpticalRenderer | null = null;
  let removeListeners: (() => void) | null = null;
  let tearingDown = false;

  const releaseRendererAndCanvas = () => {
    const ownedRenderer = renderer;
    const ownedCanvas = canvas;
    renderer = null;
    canvas = null;
    ownedRenderer?.dispose();
    ownedCanvas?.remove();
  };

  return {
    attach(nextCanvas, nextRenderer, nextRemoveListeners) {
      if (canvas || renderer || removeListeners) this.teardown();
      canvas = nextCanvas;
      renderer = nextRenderer;
      removeListeners = nextRemoveListeners;
    },
    current() {
      return { canvas, renderer };
    },
    suspendForContextRestore() {
      if (tearingDown) return;
      tearingDown = true;
      try {
        releaseRendererAndCanvas();
      } finally {
        tearingDown = false;
      }
    },
    teardown() {
      if (tearingDown) return;
      tearingDown = true;
      const ownedRemoveListeners = removeListeners;
      removeListeners = null;
      try {
        const ownedRenderer = renderer;
        const ownedCanvas = canvas;
        renderer = null;
        canvas = null;
        ownedRenderer?.dispose();
        ownedRemoveListeners?.();
        ownedCanvas?.remove();
      } finally {
        tearingDown = false;
      }
    },
    teardownForUnavailable(afterTeardown) {
      this.teardown();
      afterTeardown();
    },
  };
}
