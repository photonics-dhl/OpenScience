import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferVisibleLive2DStart } from '../lib/hermes/defer-live2d';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function environment(readyState = 'complete') {
  vi.useFakeTimers();
  const events = new EventTarget();
  const document = { readyState };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), setTimeout, clearTimeout });
  return { document, events };
}
describe('deferred Live2D initialization', () => {
  it('gives page loading priority and starts once after becoming visible', () => {
    const env = environment('loading');
    const start = vi.fn(); let visible = false;
    const deferred = deferVisibleLive2DStart(start, () => visible);
    vi.advanceTimersByTime(5000); expect(start).not.toHaveBeenCalled();
    env.document.readyState = 'complete'; env.events.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(5000); expect(start).not.toHaveBeenCalled();
    visible = true; deferred.notify();
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500); expect(start).toHaveBeenCalledTimes(1);
    deferred.notify(); vi.advanceTimersByTime(5000); expect(start).toHaveBeenCalledTimes(1);
    deferred.dispose();
  });
  it('cancels a departing portrait and rechecks visibility at execution', () => {
    environment(); const start = vi.fn(); let visible = true;
    const deferred = deferVisibleLive2DStart(start, () => visible);
    visible = false; vi.advanceTimersByTime(500); expect(start).not.toHaveBeenCalled();
    visible = true; deferred.notify(); deferred.dispose();
    vi.advanceTimersByTime(5000); expect(start).not.toHaveBeenCalled();
  });
});
