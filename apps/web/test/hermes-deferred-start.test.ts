import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferVisibleLive2DStart, latestStageIntersection } from '../lib/hermes/defer-live2d';

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
  function portraitGate() {
    const env = environment();
    const stage = {} as Element;
    const start = vi.fn();
    let intersecting = false;
    let hidden = false;
    const deferred = deferVisibleLive2DStart(start, () => intersecting && !hidden);
    return {
      ...env, stage, start, deferred,
      hide: () => { hidden = true; },
      deliver(entries: Parameters<typeof latestStageIntersection>[0]) {
        const entry = latestStageIntersection(entries, stage);
        if (!entry) return;
        intersecting = entry.isIntersecting;
        deferred.notify();
      },
    };
  }

  it('starts once when a portal move delivers offscreen then visible in one batch', () => {
    const gate = portraitGate();
    gate.deliver([
      { target: gate.stage, time: 610, isIntersecting: false },
      { target: gate.stage, time: 633, isIntersecting: true },
    ]);
    vi.advanceTimersByTime(500);
    expect(gate.start).toHaveBeenCalledTimes(1);
    gate.deferred.notify(); vi.advanceTimersByTime(500);
    expect(gate.start).toHaveBeenCalledTimes(1);
    gate.deferred.dispose();
  });

  it.each([false, true])('does not start when the newest update is offscreen (reverse order: %s)', (reverse) => {
    const gate = portraitGate();
    gate.deliver([{ target: gate.stage, time: 600, isIntersecting: true }]);
    const entries = [
      { target: gate.stage, time: 610, isIntersecting: true },
      { target: gate.stage, time: 633, isIntersecting: false },
    ];
    gate.deliver(reverse ? entries.reverse() : entries);
    vi.advanceTimersByTime(500);
    expect(gate.start).not.toHaveBeenCalled();
    gate.deferred.dispose();
  });

  it('uses the later entry when timestamps are equal', () => {
    const gate = portraitGate();
    gate.deliver([
      { target: gate.stage, time: 633, isIntersecting: false },
      { target: gate.stage, time: 633, isIntersecting: true },
    ]);
    vi.advanceTimersByTime(500);
    expect(gate.start).toHaveBeenCalledTimes(1);
    gate.deferred.dispose();
  });

  it('keeps the stage state for empty deliveries and entries from another target', () => {
    const gate = portraitGate();
    gate.deliver([{ target: {} as Element, time: 600, isIntersecting: true }]);
    vi.advanceTimersByTime(500);
    expect(gate.start).not.toHaveBeenCalled();
    gate.deliver([{ target: gate.stage, time: 610, isIntersecting: true }]);
    gate.deliver([]);
    gate.deliver([{ target: {} as Element, time: 633, isIntersecting: false }]);
    vi.advanceTimersByTime(500);
    expect(gate.start).toHaveBeenCalledTimes(1);
    gate.deferred.dispose();
  });

  it('rechecks hidden state and disposal after a visible batch', () => {
    const hidden = portraitGate();
    hidden.deliver([{ target: hidden.stage, time: 633, isIntersecting: true }]);
    hidden.hide(); vi.advanceTimersByTime(500);
    expect(hidden.start).not.toHaveBeenCalled();
    hidden.deferred.dispose();
    const departing = portraitGate();
    departing.deliver([{ target: departing.stage, time: 633, isIntersecting: true }]);
    departing.deferred.dispose();
    departing.deliver([{ target: departing.stage, time: 640, isIntersecting: true }]);
    vi.advanceTimersByTime(5000);
    expect(departing.start).not.toHaveBeenCalled();
  });

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
