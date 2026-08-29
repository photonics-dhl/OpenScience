import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeScript extends EventTarget {
  async = false;
  dataset: Record<string, string> = {};
  src = '';
  removed = false;

  remove() {
    this.removed = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Live2D Core loader', () => {
  it('removes a failed script so retry owns a fresh load event', async () => {
    const scripts: FakeScript[] = [];
    const fakeWindow: { Live2DCubismCore?: unknown } = {};
    const fakeDocument = {
      createElement: () => new FakeScript(),
      head: { append: (script: FakeScript) => scripts.push(script) },
      querySelector: () => scripts.find((script) => !script.removed) ?? null,
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    const { loadLive2DCubismCore } = await import('@/lib/hermes/live2d-core-loader');

    const first = loadLive2DCubismCore();
    scripts[0].dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow('Unable to load Live2D Cubism Core');
    expect(scripts[0].removed).toBe(true);

    const second = loadLive2DCubismCore();
    expect(scripts).toHaveLength(2);
    fakeWindow.Live2DCubismCore = {};
    scripts[1].dispatchEvent(new Event('load'));
    await expect(second).resolves.toBeUndefined();
  });
});
