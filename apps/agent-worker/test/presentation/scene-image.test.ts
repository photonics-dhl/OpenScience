import { describe, expect, it, vi } from 'vitest';
import type { StoryboardView } from '@openscience/domain';
import { planSceneImagePrompt } from '../../src/presentation/scene-image';

const brief = {
  teachingPoint: 'Phase changes redistribute intensity through interference.',
  subjects: 'A thin phase sheet and a receiving screen.',
  arrangement: 'Sheet on the left, wavefronts in the middle, screen on the right.',
  mechanism: 'Overlapping wavefronts reach distinct bright and dim patches on the screen.',
  fidelity: 'Illustrative patches, not measured data; monochromatic light, no rainbow splitting.',
};
const parent = { style: 'watercolor', document: { scenes: [{title:'Interference',narration:'Intensity changes',visualAction:'Sheet and screen',sourceClaimIds:['c1'],durationSeconds:8}] } } as StoryboardView;
const claims = [{id:'c1',kind:'method',statement:'Phase changes',assessment:'supported',conditions:['monochromatic'],limitations:['illustration only']}] as unknown as Parameters<typeof planSceneImagePrompt>[1];

function gateway(value: unknown) {
  return { completeStructured: vi.fn(async () => value) } as unknown as Parameters<typeof planSceneImagePrompt>[0];
}
describe('scene composition planning', () => {
  it('compiles concrete subjects, spatial cause-effect and limits without dropping source context', async () => {
    const g = gateway(brief);
    const prompt = await planSceneImagePrompt(g, claims, parent, 0);
    for (const value of Object.values(brief)) expect(prompt).toContain(value);
    expect(prompt.length).toBeLessThanOrEqual(1500);
    expect(prompt).toContain('watercolor');
    const call = vi.mocked(g.completeStructured).mock.calls[0];
    const input = JSON.parse(call[1][1].content);
    expect(input.claims[0].limitations).toEqual(['illustration only']);
    expect(input.scene.visualAction).toBe('Sheet and screen');
  });
  it.each([null, {prompt:'Abstract atmospheric rays'}, {...brief,subjects:' '}, {...brief,extra:'unbounded'}, {...brief,mechanism:'x'.repeat(1500)}])('blocks malformed or over-budget brief before image generation (%j)', async value => {
    await expect(planSceneImagePrompt(gateway(value), claims, parent, 0)).rejects.toThrow();
  });
  it.each([
    ['not_object', null],
    ['key_set', {...brief, extra: 'RAW_CANDIDATE_MARKER'}],
    ['field_type:subjects', {...brief, subjects: { value: 'RAW_CANDIDATE_MARKER' }}],
    ['field_empty:subjects', {...brief, subjects: '   '}],
    ['compiled_length', {...brief, mechanism: 'RAW_CANDIDATE_MARKER'.repeat(100)}],
  ])('provides bounded %s feedback and accepts a corrected composition', async (expectedIssue, invalid) => {
    const completeStructured = vi.fn(async (guard: (value: unknown) => boolean, _messages: unknown, options: { validationFeedback?: (value: unknown) => string | undefined }) => {
      expect(guard(invalid)).toBe(false);
      const feedback = options.validationFeedback?.(invalid);
      expect(feedback).toContain(`reason=${expectedIssue}`);
      expect(feedback?.length).toBeLessThanOrEqual(1000);
      expect(feedback).not.toContain('RAW_CANDIDATE_MARKER');
      expect(feedback).toContain('teachingPoint,subjects,arrangement,mechanism,fidelity');
      expect(guard(brief)).toBe(true);
      return brief;
    });
    const prompt = await planSceneImagePrompt({ completeStructured } as unknown as Parameters<typeof planSceneImagePrompt>[0], claims, parent, 0);
    expect(prompt).toContain(brief.fidelity);
    expect(completeStructured).toHaveBeenCalledOnce();
  });
  it('blocks missing scene and oversized context before planning', async () => {
    const g=gateway(brief);
    await expect(planSceneImagePrompt(g,claims,parent,4)).rejects.toThrow();
    await expect(planSceneImagePrompt(g,[{...claims[0],statement:'x'.repeat(40001)}],parent,0)).rejects.toThrow();
    expect(g.completeStructured).not.toHaveBeenCalled();
  });
});
