import { describe, expect, it, vi } from 'vitest';
import type { StoryboardView } from '@openscience/domain';
import { planSceneImagePrompt } from '../../src/presentation/scene-image';

const parent = { style: 'watercolor', document: { scenes: [{
  title: 'Interference', narration: 'Intensity changes', visualAction: 'Sheet and screen',
  sourceClaimIds: ['c1'], durationSeconds: 8,
}] } } as StoryboardView;
const claims = [{
  id: 'c1', kind: 'method', statement: 'Phase changes redistribute intensity.', assessment: 'supported',
  conditions: ['monochromatic illumination', 'fixed geometry'], limitations: ['illustration only'], extractionStatus: 'succeeded',
}] as Parameters<typeof planSceneImagePrompt>[1];

function unusedGateway() {
  return { completeStructured: vi.fn(() => { throw new Error('provider must not be called'); }) } as unknown as Parameters<typeof planSceneImagePrompt>[0];
}

describe('scene image prompt assembly', () => {
  it('preserves the approved scene and every source constraint verbatim without a model call', async () => {
    const gateway = unusedGateway();
    const repeated = [{...claims[0], conditions: ['same constraint', 'same constraint']}];
    const prompt = await planSceneImagePrompt(gateway, repeated, parent, 0);
    expect(gateway.completeStructured).not.toHaveBeenCalled();
    for (const value of [parent.document.scenes[0]!.title, parent.document.scenes[0]!.narration,
      parent.document.scenes[0]!.visualAction, repeated[0]!.statement,
      ...repeated[0]!.conditions, ...repeated[0]!.limitations]) expect(prompt).toContain(value);
    expect(prompt.match(/same constraint/gu)).toHaveLength(2);
    expect(prompt.length).toBeLessThanOrEqual(1500);
  });

  it('accepts exactly 1500 characters and rejects 1501 without truncating source text', async () => {
    const gateway = unusedGateway();
    const empty = [{...claims[0], statement: '', conditions: [], limitations: []}];
    const baseline = await planSceneImagePrompt(gateway, empty, parent, 0);
    const exactMarker = 'x'.repeat(1500 - baseline.length);
    const exact = await planSceneImagePrompt(gateway, [{...empty[0]!, statement: exactMarker}], parent, 0);
    expect(exact).toHaveLength(1500);
    expect(exact).toContain(exactMarker);
    await expect(planSceneImagePrompt(gateway, [{...empty[0]!, statement: `${exactMarker}x`}], parent, 0))
      .rejects.toThrow(/approved scene or source context exceeds image prompt bounds/u);
    expect(gateway.completeStructured).not.toHaveBeenCalled();
  });

  it('rejects a missing scene and the existing 40000-character input bound before assembly', async () => {
    const gateway = unusedGateway();
    await expect(planSceneImagePrompt(gateway, claims, parent, 4)).rejects.toThrow(/Scene is missing/u);
    await expect(planSceneImagePrompt(gateway, [{...claims[0], statement: 'x'.repeat(40001)}], parent, 0))
      .rejects.toThrow(/Scene context exceeds image planner bounds/u);
    expect(gateway.completeStructured).not.toHaveBeenCalled();
  });
});
