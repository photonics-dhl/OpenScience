import { describe, expect, it } from 'vitest';

import {
  createHermesRuntimeStatus,
  getHermesRuntimeFailureReason,
  reduceHermesRuntimeStatus,
  resolveHermesMotionControl,
} from '@/lib/hermes/hermes-runtime-status';

describe('Hermes runtime status', () => {
  it('does not claim full motion before a renderer-owned frame is drawn', () => {
    const starting = createHermesRuntimeStatus(4);

    expect(starting).toEqual({ generation: 4, lastDrawAt: null, phase: 'starting' });
    expect(resolveHermesMotionControl(false, starting)).toEqual({ action: 'none', label: 'starting' });

    const ready = reduceHermesRuntimeStatus(starting, { at: 812, type: 'frame-drawn' });
    expect(ready).toEqual({ generation: 4, lastDrawAt: 812, phase: 'ready' });
    expect(resolveHermesMotionControl(false, ready)).toEqual({ action: 'reduce', label: 'disable' });
  });

  it('keeps fallback reasons finite and makes retry advance the generation', () => {
    const starting = createHermesRuntimeStatus(2);
    const fallback = reduceHermesRuntimeStatus(starting, { reason: 'webgl2-unavailable', type: 'failed' });

    expect(fallback).toEqual({
      generation: 2,
      lastDrawAt: null,
      phase: 'fallback',
      reason: 'webgl2-unavailable',
    });
    expect(resolveHermesMotionControl(false, fallback)).toEqual({ action: 'retry', label: 'retry' });
    expect(reduceHermesRuntimeStatus(fallback, { type: 'retry' })).toEqual({
      generation: 3,
      lastDrawAt: null,
      phase: 'starting',
    });
  });

  it('keeps an explicit reduced preference static without presenting it as a renderer failure', () => {
    const fallback = reduceHermesRuntimeStatus(createHermesRuntimeStatus(0), {
      reason: 'asset-load-failed',
      type: 'failed',
    });

    expect(resolveHermesMotionControl(true, fallback)).toEqual({ action: 'enable', label: 'enable' });
  });

  it('maps only safe renderer error codes and hides arbitrary failure details', () => {
    expect(getHermesRuntimeFailureReason({ code: 'asset-load-failed', message: 'C:/secret/path' }))
      .toBe('asset-load-failed');
    expect(getHermesRuntimeFailureReason(new Error('GPU driver and local path details')))
      .toBe('renderer-init-failed');
    expect(getHermesRuntimeFailureReason({ code: 'unknown-internal-code' }))
      .toBe('renderer-init-failed');
  });
});
