import { describe, expect, it, vi } from 'vitest';
import { generateIllustrationStoryboard, materializeIllustrationScience, materializeIllustrationArt } from '../../src/presentation/illustration-planner';
import { materializeIllustrationReview } from '../../src/presentation/illustration-review';
import type { PresentationClaim } from '../../src/presentation/chart-generator';
import type { VisualNarrativeSource } from '../../src/scientific-writing-source';

const claims: PresentationClaim[] = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding',
  statement: 'A sourced relation between two regions.', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded',
  sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports',
    text: 'The source establishes a qualitative relation between two regions under the stated condition.' }] }];
const settings = { locale: 'en' as const, style: 'aged-academia', instruction: 'Explain the sourced relation.', output: 'image' as const,
  narrative: true, narrativeSceneLimit: 1 };
const science = { title: 'One relation', narrative: { mainMessage: 'Two regions share a supported relation.', audience: 'A reader new to the paper' },
  scenes: [{ title: 'Two regions', narration: 'The relationship matters to the paper.', message: 'Two regions share one supported relation.', domain: 'conceptual',
    subjects: [{ description: 'Two regions with a supported relation.', basis: { sourceId: 's0' } }],
    encoding: 'One labeled link represents the supported relation of subject 0.', labels: ['Supported relation'],
    constraints: ['Conceptual, not to scale'], paperOriginalAssetId: null }] };
const art = { scenes: [{ layout: 'Place subject 0 at the centre and label 0 above it.', treatment: 'Crisp charcoal outlines on warm white paper.' }] };
const build = () => materializeIllustrationArt(art, materializeIllustrationScience(science, claims, settings), claims, settings);

describe('native illustration uses existing science, art and review checks', () => {
  it('produces exactly the same private document as the existing planner', async () => {
    const completeStructured = vi.fn().mockResolvedValueOnce(science).mockResolvedValueOnce(art);
    const source: VisualNarrativeSource = { versionSdf: {}, reviewedAnalysis: {}, scientificReview: { status: 'review_received', fieldReviews: [], needsMoreEvidence: [] },
      sourceContext: { coverage: { complete: true }, excerpts: [] } } as unknown as VisualNarrativeSource;
    const previous = await generateIllustrationStoryboard({ completeStructured } as never, claims, settings, undefined, new Map(), source);
    expect(build()).toEqual(previous.document);
    expect(completeStructured).toHaveBeenCalledTimes(2);
  });
  it('keeps science fixed when applying art', () => {
    const intent = materializeIllustrationScience(science, claims, settings);
    const before = structuredClone(intent);
    const doc = materializeIllustrationArt(art, intent, claims, settings);
    expect(intent).toEqual(before);
    expect(doc.scenes[0]!.illustration).toMatchObject({ ...intent.scenes[0]!.illustration,
      composition: art.scenes[0]!.layout, treatment: art.scenes[0]!.treatment });
  });
  it.each(['science-edit', 'wrong-count', 'unknown-label', 'invalid-style'] as const)('rejects %s at the shared art boundary', failure => {
    const candidate: { scenes: Array<Record<string, unknown>> } = structuredClone(art);
    if (failure === 'science-edit') candidate.scenes[0]!.encoding = 'A new unsupported mechanism';
    if (failure === 'wrong-count') candidate.scenes = [];
    if (failure === 'unknown-label') candidate.scenes[0]!.layout = 'Put label 99 above subject 0.';
    if (failure === 'invalid-style') candidate.scenes[0]!.styleId = 'invented:style';
    expect(() => materializeIllustrationArt(candidate, materializeIllustrationScience(science, claims, settings), claims,
      failure === 'invalid-style' ? { ...settings, style: 'auto' } : settings)).toThrow(
      failure === 'wrong-count' ? /art_scene_count/u : failure === 'unknown-label' ? /label_reference_out_of_range/u
        : failure === 'invalid-style' ? /auto_style_invalid/u : /art_scene_0/u);
  });
  it('accepts an explicit completed review without rewriting the candidate', () => {
    const candidate = build();
    const reviewed = materializeIllustrationReview({ decision: 'accepted', summary: 'Source and visual mapping agree.', corrections: [], issues: [] }, candidate, claims, settings);
    expect(reviewed.document).toEqual(candidate);
    expect(reviewed.decision).toBe('accepted');
  });
  it.each([
    { decision: 'accepted', summary: 'Okay', corrections: [], issues: [{ sceneIndex: 0 }] },
    { decision: 'revised', summary: 'Change science', corrections: [{ sceneIndex: 0, composition: 'Different mapping' }], issues: [] },
    { decision: 'blocked', summary: 'Unsupported geometry', corrections: [], issues: [{ sceneIndex: 0, labelIndex: null, kind: 'requires_replan', requiredMeaning: 'Recheck source', sourceIds: ['foreign'] }] },
  ])('rejects unresolved, rewriting or foreign-source reviews', review => {
    expect(() => materializeIllustrationReview(review, build(), claims, settings)).toThrow(/review|issue|correction/iu);
  });
});
