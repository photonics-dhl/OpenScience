import { describe, expect, it, vi } from 'vitest';
import { generateStoryboard } from '../../src/presentation/storyboard';

const CLAIM = '00000000-0000-4000-8000-000000000001';
const EVIDENCE = '00000000-0000-4000-8000-000000000002';

describe('commercial storyboard materialization', () => {
  it('derives source-bound animation and normalizes direction prose outside the model contract', async () => {
    const statement = 'The reviewed source supports a bounded near-field relation under the stated model conditions.';
    const candidate = {
      schemaVersion: 1,
      title: 'A sourced video',
      videoProduction: {
        schemaVersion: 1,
        narrativeArc: 'question-mechanism-takeaway',
        visualContinuity: 'Keep the subject identity, scale, palette and lighting continuous.',
        audioPolicy: 'external-narration',
        modelPolicy: 'commercial-primary',
      },
      scenes: Array.from({ length: 3 }, (_, index) => ({
        title: `Scene ${index + 1}`,
        narration: `Explain scene ${index + 1}.`,
        visualAction: 'A restrained scientific shot showing the reviewed relationship.',
        durationSeconds: 8,
        sourceClaimIds: [CLAIM],
        videoDirection: {
          shotType: index === 0 ? 'hook' : 'mechanism',
          purpose: ['Introduce the sourced question'],
          subjectLock: ['Keep the reviewed subject unchanged'],
          generatedElements: ['Only the permitted conceptual field'],
          motion: ['Use a slow explanatory movement'],
          camera: ['A measured forward push'],
          reference: 'scene-artwork',
          frameStrategy: 'start-reference',
          audioMode: 'external-narration',
          subtitleMode: 'none',
          negativeConstraints: 'no invented labels',
          modelPolicy: 'commercial-primary',
        },
      })),
    };
    const completeStructured = vi.fn(async (guard: (value: unknown) => boolean) => {
      expect(guard(candidate)).toBe(true);
      return candidate;
    });
    const result = await generateStoryboard({ completeStructured }, [{
      id: CLAIM,
      kind: 'core',
      statement,
      assessment: 'supported',
      conditions: [],
      limitations: [],
      sourcePassages: [{ evidenceId: EVIDENCE, relation: 'supports', text: statement }],
    }] as never, { locale: 'en', style: 'scientific', instruction: 'Explain the source.', output: 'video' });

    expect(completeStructured).toHaveBeenCalledOnce();
    expect(result.document.scenes[0]?.videoDirection?.generatedElements).toBe('Only the permitted conceptual field');
    expect(result.document.scenes[0]?.animation?.actions.map(action => action.kind)).toEqual(['enter', 'draw', 'pulse']);
    expect(result.document.scenes[0]?.animation?.actions[0]?.basis.quote).toBe(statement);
  });
});
