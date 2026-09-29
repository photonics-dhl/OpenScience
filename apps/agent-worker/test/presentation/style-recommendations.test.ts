import { describe, it, expect, vi } from 'vitest';
import { generateIllustrationStoryboard } from '../../src/presentation/illustration-planner';
import { loadInstalledMediaSkills, installedIllustrationStyle, automaticStyleTreatment } from '../../src/skills/installed-media-skills';
import type { PresentationClaim } from '../../src/presentation/chart-generator';
const claims: PresentationClaim[] = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'Two regions share a relation.', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'reviewed', sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports', text: 'The source establishes a qualitative relation between two regions under the stated condition.' }] }];
const science = { title: 'Relation', scenes: [{ title: 'Two regions', narration: 'One supported relation.', message: 'Two regions share a relation.', domain: 'conceptual', subjects: [{ description: 'The source establishes a relation between two regions.', basis: { sourceId: 's0' } }], encoding: 'The labeled link represents subject 0.', labels: ['Supported relation'], constraints: ['Conceptual, not to scale'] }] };
const recommendations = { selectedStyleId: 'article:watercolor', choices: [{ styleId: 'article:watercolor', name: 'Watercolor', reason: 'Soft material emphasizes the relation while keeping the short label crisp.' }, { styleId: 'infographic:technical-schematic', name: 'Technical', reason: 'Precise linework gives the same labels a visibly different technical appearance.' }] };
const settings = { locale: 'en' as const, style: 'auto', instruction: 'Explain the sourced relation.', output: 'image' as const };
async function plan(metadata: unknown = recommendations, extra = {}) {
  const art = { scenes: [{ layout: 'Center subject 0 with label 0.', treatment: 'Soft translucent pigment with crisp labels.', styleId: 'article:watercolor', ...(metadata === 'absent' ? {} : { styleRecommendations: metadata }), ...extra }] };
  const completeStructured = vi.fn(async (guard: (v: unknown) => boolean, messages: Array<{ content: string }>) => {
    const value = completeStructured.mock.calls.length === 1 ? science : art;
    expect(guard(value)).toBe(true); return value;
  });
  return { result: await generateIllustrationStoryboard({ completeStructured } as never, claims, settings), completeStructured };
}
describe('source-aware optional style recommendations', () => {
  it('uses the existing two stages and saves exact installed names beside unchanged science', async () => {
    const { result, completeStructured } = await plan();
    expect(completeStructured).toHaveBeenCalledTimes(2);
    const scene = result.document.scenes[0]!;
    expect(scene.styleRecommendations?.choices).toHaveLength(2);
    expect(scene.styleRecommendations?.choices[0]?.name).toBe(installedIllustrationStyle('article:watercolor')!.name);
    expect(scene.illustration!.treatment).toMatch(/^BAOYU_STYLE=article:watercolor;/);
    expect(scene.illustration!.labels).toEqual(science.scenes[0]!.labels);
    const messages = completeStructured.mock.calls[1]![1];
    expect(messages[0]!.content).toContain('materially different');
    expect(JSON.parse(messages[1]!.content).intent[0].labels).toEqual(science.scenes[0]!.labels);
  });
  it.each([null, 2, 'bad', {}, { ...recommendations, choices: [{ styleId: 'article:fake', name: 'Fake', reason: 'invalid' }] }, { ...recommendations, choices: Array(3).fill(recommendations.choices[0]) }])('drops malformed metadata without rejecting the scientific plan: %j', async metadata => {
    const { result, completeStructured } = await plan(metadata);
    expect(result.document.scenes[0]!.styleRecommendations).toBeUndefined();
    expect(completeStructured).toHaveBeenCalledTimes(2);
  });
  it('preserves old plans and strips unavailable alternatives', async () => {
    const old = await plan('absent'); // absence still accepts the original art contract
    expect(old.result.document.scenes[0]!.illustration).toBeDefined();
    const { result } = await plan({ ...recommendations, choices: [recommendations.choices[0], { styleId: 'article:missing', name: 'Missing', reason: 'unavailable' }] });
    expect(result.document.scenes[0]!.styleRecommendations?.choices).toHaveLength(1);
  });
  it('switches to an exact alternative using only art and keeps all science and previous choices', async () => {
    const { result } = await plan();
    const completeStructured = vi.fn(async (guard: (v: unknown) => boolean) => {
      const value = { scenes: [{ layout: 'Place subject 0 and label 0 on one clear reading path.', treatment: 'Precise technical lines.' }] };
      expect(guard(value)).toBe(true); return value;
    });
    const revised = await generateIllustrationStoryboard({ completeStructured } as never, claims,
      { ...settings, style: 'infographic:technical-schematic', revisionMode: 'art' }, { ...settings, document: result.document });
    expect(completeStructured).toHaveBeenCalledTimes(1);
    const { composition: _c, treatment: _t, ...before } = result.document.scenes[0]!.illustration!;
    const { composition: _c2, treatment: _t2, ...after } = revised.document.scenes[0]!.illustration!;
    expect(after).toEqual(before);
    expect(revised.document.scenes[0]!.styleRecommendations).toEqual({ ...result.document.scenes[0]!.styleRecommendations, selectedStyleId: 'infographic:technical-schematic' });
  });
  it('does not accept science edits in art or an invalid selected auto marker', async () => {
    await expect(plan(recommendations, { labels: ['invented'] })).rejects.toThrow();
    await expect(plan(recommendations, { styleId: 'article:missing' })).rejects.toThrow();
  });
});
describe('exact catalogue resource selection', () => {
  it.each(['article:chalkboard', 'infographic:chalkboard'])('resolves family collision %s without fallback', style => {
    const skills = loadInstalledMediaSkills(style, '', 'plan');
    const family = style.startsWith('article:') ? 'baoyu-article-illustrator' : 'baoyu-infographic';
    expect(skills.instructions).toContain(`SOURCE: ${family}/references/styles/chalkboard.md`);
    expect(skills.usage.filter(item => item.resources.some(resource => resource.startsWith('references/styles/chalkboard.md'))).map(item => item.id)).toEqual([family]);
  });
  it('loads the handdraw selection and rejects invalid qualified choices without fallback', () => {
    expect(loadInstalledMediaSkills('handdraw:#002', '', 'plan').instructions).toContain('SELECTED HAND-DRAWN STYLE #002');
    expect(automaticStyleTreatment('handdraw:#002', 'Fine ink.')).toBeDefined();
    for (const style of ['article:missing', 'infographic:watercolor', 'handdraw:#999', 'article:../../secret']) expect(() => loadInstalledMediaSkills(style, '', 'plan')).toThrow();
  });
  it('provides compact appearance and label descriptors, not all reference bodies', () => {
    const skills = loadInstalledMediaSkills('auto', '', 'plan');
    expect(skills.instructions).toContain('article:watercolor —');
    expect(skills.instructions).toContain('; labels:');
    expect(skills.instructions).not.toContain('SOURCE: baoyu-article-illustrator/references/styles/watercolor.md');
    expect(skills.instructions.length).toBeLessThan(60000);
  });
});
