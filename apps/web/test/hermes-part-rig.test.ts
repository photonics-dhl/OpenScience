import { describe, expect, it } from 'vitest';

import {
  HERMES_PARTS,
  createHermesPartPoses,
  type HermesPartId,
} from '@/lib/hermes/part-rig';
import { sampleHermesMotion } from '@/lib/hermes/pet-motion';

const sampleAction = (action: Parameters<typeof sampleHermesMotion>[0]['action'], elapsedMs: number) => sampleHermesMotion({
  action,
  actionElapsedMs: elapsedMs,
  elapsedMs: 9_000,
  engaged: false,
  pointer: { x: 0, y: 0 },
  reducedMotion: false,
  state: 'idle',
});

const vectorKey = (pose: ReturnType<typeof createHermesPartPoses>[Exclude<HermesPartId, 'face'>]) => [
  pose.x.toFixed(2), pose.y.toFixed(2), pose.angle.toFixed(2),
].join(':');

describe('Hermes semantic part rig', () => {
  it('defines one shared-context rig with stable semantic pivots', () => {
    expect(HERMES_PARTS.map((part) => part.id)).toEqual([
      'base', 'torso', 'tail', 'forepaws', 'head', 'crown', 'face', 'evidenceNodes',
    ]);
    expect(new Set(HERMES_PARTS.map((part) => `${part.pivot.x}:${part.pivot.y}`)).size).toBeGreaterThanOrEqual(6);
  });

  it('turns one approved action into independently readable part vectors', () => {
    const observe = createHermesPartPoses(sampleAction('observe-right', 750), 'observe-right', .5);
    const stretch = createHermesPartPoses(sampleAction('stretch', 725), 'stretch', .5);
    const citation = createHermesPartPoses(sampleAction('citation-trace', 1_050), 'citation-trace', .5);

    expect(new Set(['head', 'torso', 'tail', 'crown'].map((id) => vectorKey(observe[id as HermesPartId]))).size)
      .toBeGreaterThanOrEqual(3);
    expect(stretch.forepaws.y).toBeLessThanOrEqual(-7);
    expect(stretch.crown.angle).not.toBe(stretch.head.angle);
    expect(Math.abs(citation.tail.angle)).toBeGreaterThan(12);
    expect(Math.abs(citation.head.angle)).toBeLessThan(Math.abs(citation.tail.angle));
  });

  it('keeps only renderer-backed pose channels and closes visible face pixels', () => {
    const blink = createHermesPartPoses(sampleAction('blink-single', 210), 'blink-single', .5);
    expect(blink.face.textureMix).toBe(1);
    expect(Object.keys(blink.torso).sort()).toEqual(['angle', 'x', 'y']);
    expect(Object.keys(blink.evidenceNodes).sort()).toEqual(['angle', 'x', 'y']);
    expect(Object.keys(blink.face)).toEqual(['textureMix']);

    const stillSample = sampleHermesMotion({
      elapsedMs: 12_000,
      engaged: true,
      pointer: { x: 1, y: -1 },
      reducedMotion: false,
      state: 'awaiting_approval',
    });
    const still = createHermesPartPoses(stillSample, 'approval-still', 1);
    expect(['base', 'torso', 'tail', 'forepaws', 'head', 'crown', 'evidenceNodes']
      .every((id) => vectorKey(still[id as Exclude<HermesPartId, 'face'>]) === '0.00:0.00:0.00')).toBe(true);
    expect(still.face.textureMix).toBe(0);
  });

  it('keeps actions rigid by exposing translation and rotation without scale channels', () => {
    for (const action of ['citation-trace', 'stretch', 'doze', 'wake', 'milestone-dance'] as const) {
      const poses = createHermesPartPoses(sampleAction(action, 700), action, .5);
      for (const id of ['torso', 'tail', 'forepaws', 'head', 'crown'] as const) {
        expect(Object.keys(poses[id]).sort(), `${action}:${id}`).toEqual(['angle', 'x', 'y']);
      }
    }
  });
});
