import { expect, it, vi } from 'vitest';
import { describeIllustrationBrief, parseStoryboardDocument, parseStoryboardRequest } from '@openscience/domain';
import { generateIllustrationStoryboard } from '../../src/presentation/illustration-planner';
import type { PresentationClaim } from '../../src/presentation/chart-generator';

const claimId = '10000000-0000-4000-8000-000000000001', evidenceId = '20000000-0000-4000-8000-000000000001';
const baseAssetId = '30000000-0000-4000-8000-000000000001';
const claims: PresentationClaim[] = [{ id: claimId, kind: 'finding', statement: 'Two regions share a relation.', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'succeeded', sourcePassages: [{ evidenceId, relation: 'supports', text: 'Two regions share a relation.' }] }];
const recommendations = { selectedStyleId: 'article:watercolor', choices: [
  { styleId: 'article:watercolor', name: 'Watercolor', reason: 'Soft edges' },
  { styleId: 'infographic:technical-schematic', name: 'Technical', reason: 'Precise linework' },
] };
const settings = { locale: 'en' as const, style: 'infographic:technical-schematic', instruction: 'Change the selected art only.', output: 'image' as const,
  narrative: true as const, revisionMode: 'art' as const, baseAssetId, artSceneIndex: 1 };
function base() {
  const illustration = { schemaVersion: 2 as const, message: 'Two regions share a relation.', domain: 'conceptual' as const,
    subjects: [{ description: 'Two regions', basis: { claimId, evidenceId, quote: 'Two regions share a relation.' } }],
    encoding: 'The link represents subject 0.', labels: ['Relation'], constraints: ['Not to scale'], composition: 'Center subject 0.', treatment: 'Pencil' };
  const scene = { title: 'Relation', narration: 'Two regions share a relation.', sourceClaimIds: [claimId], illustration,
    visualAction: describeIllustrationBrief(illustration), styleRecommendations: structuredClone(recommendations) };
  return { ...settings, document: parseStoryboardDocument({ schemaVersion: 1, title: 'Paper', narrative: { mainMessage: 'A relation.', audience: 'Researchers' },
    scenes: [scene, { ...structuredClone(scene), title: 'Chosen scene' }, { ...structuredClone(scene), title: 'Third scene' }] }, [claimId], 'image') };
}

it('round trips only a bounded art/image/base/narrative scene selection', () => {
  expect(parseStoryboardRequest(settings)).toEqual(settings);
  for (const change of [{ artSceneIndex: -1 }, { artSceneIndex: 6 }, { artSceneIndex: 0.5 }, { revisionMode: undefined },
    { narrative: undefined }, { output: 'video' }, { baseAssetId: undefined }]) {
    expect(() => parseStoryboardRequest({ ...settings, ...change })).toThrow();
  }
});

it('requests one art scene, preserves whole original science and every unselected scene', async () => {
  const original = base();
  const completeStructured = vi.fn(async (guard: (value: unknown) => boolean, messages: Array<{ content: string }>) => {
    const value = { scenes: [{ layout: 'Place subject 0 with label 0 along one diagonal.', treatment: 'Crisp technical linework.' }] };
    const request = JSON.parse(messages[1]!.content);
    expect(request.intent).toHaveLength(1);
    expect(guard(value)).toBe(true); return value;
  });
  const result = await generateIllustrationStoryboard({ completeStructured } as never, claims, settings, original, undefined, {} as never);
  expect(completeStructured).toHaveBeenCalledTimes(1);
  expect(result.document.scenes).toHaveLength(3);
  expect(result.document.scenes[0]).toEqual(original.document.scenes[0]);
  expect(result.document.scenes[2]).toEqual(original.document.scenes[2]);
  const selected = result.document.scenes[1]!;
  const previous = original.document.scenes[1]!;
  expect(selected.narration).toEqual(previous.narration);
  expect({ ...selected.illustration, composition: null, treatment: null }).toEqual({ ...previous.illustration, composition: null, treatment: null });
  expect(selected.styleRecommendations?.selectedStyleId).toBe(settings.style);
  expect(selected.illustration?.composition).not.toBe(previous.illustration?.composition);
});

it.each(['current', 'unrecommended', 'out-of-range', 'missing-catalogue'])('rejects %s before provider', async kind => {
  const original = base(), request = { ...settings };
  if (kind === 'current') request.style = recommendations.selectedStyleId;
  if (kind === 'unrecommended') request.style = 'article:vector-illustration';
  if (kind === 'out-of-range') request.artSceneIndex = 5;
  if (kind === 'missing-catalogue') {
    request.style = 'article:does-not-exist';
    original.document.scenes[1]!.styleRecommendations!.choices[1]!.styleId = request.style;
  }
  const completeStructured = vi.fn();
  await expect(generateIllustrationStoryboard({ completeStructured } as never, claims, request, original, undefined, {} as never)).rejects.toThrow();
  expect(completeStructured).not.toHaveBeenCalled();
});
