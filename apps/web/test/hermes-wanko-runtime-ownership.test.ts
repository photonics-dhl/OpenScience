import { describe, expect, it, vi } from 'vitest';

import {
  claimAbortableWankoResource,
  createWankoMotionSwitch,
} from '@/lib/hermes/wanko-runtime-ownership';

describe('Wanko runtime ownership', () => {
  it('interrupts a rejected same-or-lower-priority motion and accepts the requested action', async () => {
    const starts = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const interrupt = vi.fn();
    const motionSwitch = createWankoMotionSwitch(starts, interrupt, 3);

    motionSwitch.request('guide-travel:1200', { group: 'Flick', index: 0 }, 2);
    await motionSwitch.settled();

    expect(starts.mock.calls).toEqual([
      ['Flick', 0, 2],
      ['Flick', 0, 3],
    ]);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(motionSwitch.acceptedAction()).toBe('guide-travel:1200');
  });

  it('does not let a late rejected action override a newer accepted action', async () => {
    let resolveFirst: ((accepted: boolean) => void) | undefined;
    const starts = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(true);
    const motionSwitch = createWankoMotionSwitch(starts, vi.fn(), 3);

    motionSwitch.request('idle:1', { group: 'Idle', index: 0 }, 1);
    motionSwitch.request('scan:2', { group: 'Flick3', index: 0 }, 3);
    await motionSwitch.settled();
    resolveFirst?.(false);
    await Promise.resolve();

    expect(motionSwitch.acceptedAction()).toBe('scan:2');
  });

  it('stops a looping motion and accepts an explicit approval settle', async () => {
    const starts = vi.fn().mockResolvedValue(true);
    const interrupt = vi.fn();
    const setIdleMotionEnabled = vi.fn();
    const motionSwitch = createWankoMotionSwitch(starts, interrupt, 3, setIdleMotionEnabled);

    motionSwitch.request('idle:1', { group: 'Idle', index: 0 }, 1);
    await motionSwitch.settled();
    motionSwitch.request('approval-still:2', null, 0);
    await motionSwitch.settled();

    expect(starts).toHaveBeenCalledTimes(1);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(setIdleMotionEnabled.mock.calls).toEqual([[true], [false]]);
    expect(motionSwitch.acceptedAction()).toBe('approval-still:2');

    motionSwitch.request('wake:3', { group: 'FlickUp', index: 0 }, 2);
    await motionSwitch.settled();
    expect(setIdleMotionEnabled.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('stops a late looping motion that resolves after a failure settle', async () => {
    let resolveLoop: ((accepted: boolean) => void) | undefined;
    const starts = vi.fn(() => new Promise<boolean>((resolve) => { resolveLoop = resolve; }));
    const interrupt = vi.fn();
    const motionSwitch = createWankoMotionSwitch(starts, interrupt, 3);

    motionSwitch.request('idle:1', { group: 'Idle', index: 0 }, 1);
    motionSwitch.request('failed-settle:2', null, 0);
    expect(motionSwitch.acceptedAction()).toBe('failed-settle:2');
    expect(interrupt).toHaveBeenCalledTimes(1);

    resolveLoop?.(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(interrupt).toHaveBeenCalledTimes(2);
    expect(motionSwitch.acceptedAction()).toBe('failed-settle:2');
  });

  it('disposes a model that resolves after initialization was aborted', async () => {
    let resolveModel: ((model: { id: string }) => void) | undefined;
    const pending = new Promise<{ id: string }>((resolve) => { resolveModel = resolve; });
    const abortController = new AbortController();
    const dispose = vi.fn();
    const claim = claimAbortableWankoResource(pending, abortController.signal, dispose);

    abortController.abort();
    await expect(claim).rejects.toMatchObject({ name: 'AbortError' });
    const lateModel = { id: 'late-model' };
    resolveModel?.(lateModel);
    await Promise.resolve();
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(lateModel);
  });

});
