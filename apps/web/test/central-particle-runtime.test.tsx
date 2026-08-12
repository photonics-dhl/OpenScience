import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const pageUrl = new URL('../app/%255Fvisual/central-particle/page.tsx', import.meta.url);
const policyUrl = new URL('../lib/optical-prototype/runtime-policy.ts', import.meta.url);
const lifecycleUrl = new URL('../lib/optical-prototype/lifecycle.ts', import.meta.url);
const rendererUrl = new URL('../lib/optical-prototype/renderer.ts', import.meta.url);
const pageModule = existsSync(fileURLToPath(pageUrl)) ? await import('../app/%5Fvisual/central-particle/page') : null;
const policyModule = existsSync(fileURLToPath(policyUrl)) ? await import('../lib/optical-prototype/runtime-policy') : null;
const lifecycleModule = existsSync(fileURLToPath(lifecycleUrl)) ? await import('../lib/optical-prototype/lifecycle') : null;
const rendererModule = existsSync(fileURLToPath(rendererUrl)) ? await import('../lib/optical-prototype/renderer') : null;

describe('central particle isolated runtime shell', () => {
  it('SSR renders one selectable title, generated SVG, no canvas, and no-index metadata', () => {
    expect(pageModule, 'isolated route must exist').not.toBeNull();
    if (!pageModule) return;
    const markup = renderToStaticMarkup(pageModule.default());
    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain('Science evolves.');
    expect(markup).toContain('/optical-prototype/title-outline.svg');
    expect(markup).toContain('data-central-particle-title="true"');
    expect(markup).not.toContain('<canvas');
    expect(pageModule.metadata.robots).toEqual({ follow: false, index: false });
  });

  it.each([
    [{ width: 1672, reducedMotion: false, webgl2: true }, 'dynamic'],
    [{ width: 480, reducedMotion: false, webgl2: true }, 'static'],
    [{ width: 1672, reducedMotion: true, webgl2: true }, 'static'],
    [{ width: 1672, reducedMotion: false, webgl2: false }, 'static'],
  ] as const)('selects $1 mode for policy $0', (input, expected) => {
    expect(policyModule?.selectCentralParticleMode(input)).toBe(expected);
  });

  it('releases the temporary WebGL2 capability probe', () => {
    const loseContext = vi.fn();
    const getContext = vi.fn().mockReturnValue({
      getExtension: vi.fn().mockReturnValue({ loseContext }),
    });
    expect(policyModule?.probeCentralParticleWebGl2({ getContext })).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    }));
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('observes width and reduced-motion policy changes until cleanup', () => {
    const windowListeners = new Set<() => void>();
    const motionListeners = new Set<() => void>();
    const source = {
      innerWidth: 1672,
      addEventListener: vi.fn((_type: string, listener: () => void) => windowListeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => windowListeners.delete(listener)),
    };
    const motion = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => motionListeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => motionListeners.delete(listener)),
    };
    const modes: string[] = [];
    const stop = policyModule?.observeCentralParticlePolicy({
      motion,
      onMode: (mode: string) => modes.push(mode),
      source,
      webgl2: true,
    });
    expect(stop).toBeTypeOf('function');
    expect(modes).toEqual(['dynamic']);
    source.innerWidth = 480;
    windowListeners.forEach((listener) => listener());
    expect(modes).toEqual(['dynamic', 'static']);
    source.innerWidth = 1672;
    motion.matches = true;
    motionListeners.forEach((listener) => listener());
    expect(modes).toEqual(['dynamic', 'static', 'static']);
    stop?.();
    expect(windowListeners.size).toBe(0);
    expect(motionListeners.size).toBe(0);
  });

  it('owns resize generations and ignores stale completion', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const renderer = {
      dispose: vi.fn(), pause: vi.fn(), render: vi.fn(), resume: vi.fn(),
      resize: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    };
    const published: number[] = [];
    const lifecycle = lifecycleModule?.createCentralParticleLifecycle({
      createCanvas: () => ({ remove: vi.fn() }),
      createRenderer: () => renderer,
      publishFrame: (generation: number) => published.push(generation),
    });
    expect(lifecycle).toBeDefined();
    if (!lifecycle) return;
    lifecycle.start();
    const older = lifecycle.resize({ width: 800, height: 500 } as DOMRectReadOnly);
    const newer = lifecycle.resize({ width: 900, height: 600 } as DOMRectReadOnly);
    first.resolve();
    await older;
    expect(published).toEqual([]);
    second.resolve();
    await newer;
    expect(published).toEqual([2]);
  });

  it('pauses for visibility, disposes on context loss, and restores on a fresh canvas', () => {
    const canvases = [{ remove: vi.fn() }, { remove: vi.fn() }];
    const renderers = Array.from({ length: 2 }, () => ({
      dispose: vi.fn(), pause: vi.fn(), render: vi.fn(), resize: vi.fn(), resume: vi.fn(),
    }));
    const lifecycle = lifecycleModule?.createCentralParticleLifecycle({
      createCanvas: () => canvases.shift()!,
      createRenderer: (_canvas: unknown, generation: number) => renderers[generation - 1],
      publishFrame: vi.fn(),
    });
    expect(lifecycle).toBeDefined();
    if (!lifecycle) return;
    lifecycle.start();
    expect(lifecycle.snapshot().rafScheduled).toBe(true);
    lifecycle.setVisible(false);
    expect(lifecycle.snapshot().rafScheduled).toBe(false);
    lifecycle.setVisible(true);
    expect(lifecycle.snapshot().rafScheduled).toBe(true);
    expect(renderers[0].pause).toHaveBeenCalledTimes(1);
    expect(renderers[0].resume).toHaveBeenCalledTimes(1);
    lifecycle.contextLost();
    expect(lifecycle.snapshot().rafScheduled).toBe(false);
    expect(renderers[0].dispose).toHaveBeenCalledTimes(1);
    lifecycle.restore();
    expect(lifecycle.snapshot().canvasGeneration).toBe(2);
    expect(renderers[1].render).toHaveBeenCalledTimes(1);
  });

  it('fails closed on renderer init and cleanup is idempotent', () => {
    const canvas = { remove: vi.fn() };
    const lifecycle = lifecycleModule?.createCentralParticleLifecycle({
      createCanvas: () => canvas,
      createRenderer: () => { throw new Error('init failed'); },
      publishFrame: vi.fn(),
    });
    expect(lifecycle).toBeDefined();
    if (!lifecycle) return;
    expect(lifecycle.start()).toBe(false);
    lifecycle.dispose();
    lifecycle.dispose();
    expect(canvas.remove).toHaveBeenCalledTimes(1);
    expect(lifecycle.snapshot()).toMatchObject({ active: false, rafScheduled: false });
  });

  it('does not restore context ownership after component cleanup begins', () => {
    const preventDefault = vi.fn();
    const contextLost = vi.fn();
    const restore = vi.fn();
    const replaceResizeObserver = vi.fn();
    expect(lifecycleModule?.handleCentralParticleContextLoss(
      { preventDefault },
      {
        contextLost,
        isCancelled: () => true,
        replaceResizeObserver,
        restore,
      },
    )).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(contextLost).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(replaceResizeObserver).not.toHaveBeenCalled();
  });

  it('does not restore a context deliberately lost by renderer disposal', () => {
    const contextLost = vi.fn();
    const restore = vi.fn();
    expect(lifecycleModule?.handleCentralParticleContextLoss(
      { preventDefault: vi.fn() },
      {
        contextLost,
        isCancelled: () => false,
        isRecoverable: () => false,
        replaceResizeObserver: vi.fn(),
        restore,
      },
    )).toBe(false);
    expect(contextLost).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });

  it('ignores a delayed context-loss event from a superseded canvas owner', () => {
    const contextLost = vi.fn();
    const restore = vi.fn();
    expect(lifecycleModule?.handleCentralParticleContextLoss(
      { preventDefault: vi.fn() },
      {
        contextLost,
        isCancelled: () => false,
        isCurrentOwner: () => false,
        isRecoverable: () => true,
        replaceResizeObserver: vi.fn(),
        restore,
      },
    )).toBe(false);
    expect(contextLost).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });

  it('keeps a queued resize callback bound to its original lifecycle owner', () => {
    let notify: ResizeObserverCallback | null = null;
    const observe = vi.fn();
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notify = callback;
      }
      disconnect = vi.fn();
      observe = observe;
      unobserve = vi.fn();
    }
    const olderOwner = { resize: vi.fn() };
    const newerOwner = { resize: vi.fn() };
    const target = {} as Element;
    const observer = lifecycleModule?.createCentralParticleResizeObserver({
      Observer: TestResizeObserver as unknown as typeof ResizeObserver,
      owner: olderOwner,
      target,
    });
    expect(observer).toBeDefined();
    expect(observe).toHaveBeenCalledWith(target);
    notify?.([{ contentRect: { width: 640, height: 360 } } as ResizeObserverEntry], observer!);
    expect(olderOwner.resize).toHaveBeenCalledTimes(1);
    expect(newerOwner.resize).not.toHaveBeenCalled();
  });

  it('preserves hidden visibility across fresh-canvas restoration', () => {
    const renderers = Array.from({ length: 2 }, () => ({
      dispose: vi.fn(), pause: vi.fn(), render: vi.fn(), resize: vi.fn(), resume: vi.fn(),
    }));
    const lifecycle = lifecycleModule?.createCentralParticleLifecycle({
      createCanvas: () => ({ remove: vi.fn() }),
      createRenderer: (_canvas: unknown, generation: number) => renderers[generation - 1],
      publishFrame: vi.fn(),
    });
    expect(lifecycle).toBeDefined();
    if (!lifecycle) return;
    lifecycle.start();
    lifecycle.setVisible(false);
    lifecycle.contextLost();
    lifecycle.restore();
    expect(renderers[1].render).toHaveBeenCalledTimes(1);
    expect(renderers[1].pause).toHaveBeenCalledTimes(1);
    expect(lifecycle.snapshot().rafScheduled).toBe(false);
  });

  it('does not observe a replacement canvas when context restoration fails', () => {
    const contextLost = vi.fn();
    const replaceResizeObserver = vi.fn();
    const restore = vi.fn().mockReturnValue(false);
    expect(lifecycleModule?.handleCentralParticleContextLoss(
      { preventDefault: vi.fn() },
      {
        contextLost,
        isCancelled: () => false,
        replaceResizeObserver,
        restore,
      },
    )).toBe(false);
    expect(contextLost).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(replaceResizeObserver).not.toHaveBeenCalled();
  });

  it('fails closed when a resize render rejects', async () => {
    const canvas = { remove: vi.fn() };
    const renderer = {
      dispose: vi.fn(), pause: vi.fn(), render: vi.fn(), resume: vi.fn(),
      resize: vi.fn().mockRejectedValue(new Error('resize failed')),
    };
    const retractFrame = vi.fn();
    const lifecycle = lifecycleModule?.createCentralParticleLifecycle({
      createCanvas: () => canvas,
      createRenderer: () => renderer,
      publishFrame: vi.fn(),
      retractFrame,
    });
    expect(lifecycle).toBeDefined();
    if (!lifecycle) return;
    lifecycle.start();
    await expect(lifecycle.resize({ width: 800, height: 500 } as DOMRectReadOnly)).resolves.toBeUndefined();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(canvas.remove).toHaveBeenCalledTimes(1);
    expect(retractFrame).toHaveBeenCalledTimes(1);
    expect(lifecycle.snapshot()).toMatchObject({ active: false, rafScheduled: false });
  });

  it('releases an acquired WebGL2 context when Three initialization throws', () => {
    expect(rendererModule, 'renderer module must exist').not.toBeNull();
    if (!rendererModule) return;
    const loseContext = vi.fn();
    const context = {
      getExtension: vi.fn().mockReturnValue({ loseContext }),
    };
    const canvas = {
      getContext: vi.fn().mockReturnValue(context),
    } as unknown as HTMLCanvasElement;
    expect(() => rendererModule.createCentralParticleRenderer(
      canvas,
      () => { throw new Error('Three init failed'); },
    )).toThrow('Three init failed');
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('keeps the production landing graph free of central particle imports', () => {
    for (const path of [
      '../app/page.tsx', '../components/landing/Hero.tsx',
      '../components/brand/OpticalHeadline.tsx', '../components/brand/OpticalField.tsx',
    ]) {
      expect(readFileSync(new URL(path, import.meta.url), 'utf8')).not.toMatch(/central-particle|optical-prototype/);
    }
  });
});
