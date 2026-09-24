import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { generateIllustrationStoryboard } from '../../src/presentation/illustration-planner';
import { reviewIllustrationStoryboard } from '../../src/presentation/illustration-review';
import { compileIllustrationImagePrompt } from '../../src/presentation/scene-image';
import { renderStoryboard } from '../../src/presentation/storyboard';
import { reviewGeneratedImage } from '../../src/presentation/generated-image-review';
import { loadInstalledMediaSkills } from '../../src/skills/installed-media-skills';
import type { PresentationClaim } from '../../src/presentation/chart-generator';

const claims: PresentationClaim[] = [{
  id: '10000000-0000-4000-8000-000000000001', kind: 'finding',
  statement: 'A sourced relation between two regions.', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'reviewed',
  sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports',
    text: 'The source establishes a qualitative relation between two regions under the stated condition.' }],
}];
const science = { title: 'One relationship', scenes: [{
  title: 'Two regions', narration: 'The relationship matters to the paper.',
  message: 'Two regions share one supported relation.', domain: 'conceptual',
  subjects: [{ description: 'The source establishes a relation between two regions.', basis: { sourceId: 's0' } }],
  encoding: 'One labeled link represents the supported relation of subject 0.',
  labels: ['Supported relation'], constraints: ['Conceptual, not to scale'],
}] };

function mockGateway(treatment: string, styleId?: string) {
  const calls: Array<Array<{ content: string }>> = [];
  const completeStructured = vi.fn(async (_guard: unknown, messages: Array<{ content: string }>) => {
    calls.push(messages);
    return calls.length === 1 ? science : { scenes: [{ layout: 'Place the relation at the focal point.', treatment,
      ...(styleId ? { styleId } : {}) }] };
  });
  return { gateway: { completeStructured } as never, calls };
}

describe('automatic art direction after sourced science', () => {
  it('stops a science plan that points past its visible-label list', async () => {
    const invalidScience = { ...science, scenes: [{ ...science.scenes[0]!,
      encoding: 'label 1 names the relation even though there is only one visible label.' }] };
    const completeStructured = vi.fn(async () => completeStructured.mock.calls.length === 1
      ? invalidScience : { scenes: [{ layout: 'Place the single visible label beside its mark.', treatment: 'Quiet ink.' }] });
    await expect(generateIllustrationStoryboard({ completeStructured } as never, claims, {
      locale: 'en', style: 'watercolor', instruction: 'Explain the relation.', output: 'image',
    })).rejects.toThrow('label_reference_out_of_range');
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it('stops art that adds a nonexistent visible-label reference', async () => {
    const completeStructured = vi.fn(async (_guard: unknown, _messages: unknown) =>
      completeStructured.mock.calls.length === 1 ? science : { scenes: [{
        layout: 'Place label 1 next to the single visible relation.', treatment: 'Quiet ink.',
      }] });
    await expect(generateIllustrationStoryboard({ completeStructured } as never, claims, {
      locale: 'en', style: 'watercolor', instruction: 'Explain the relation.', output: 'image',
    })).rejects.toThrow('label_reference_out_of_range');
    expect(completeStructured).toHaveBeenCalledTimes(2);
  });

  it('uses a numbered style only in art, then retains it in the drawable brief', async () => {
    const { gateway, calls } = mockGateway('Fine continuous ink lines on warm white paper.', 'handdraw:#002');
    const result = await generateIllustrationStoryboard(gateway, claims, {
      locale: 'en', style: 'auto', instruction: 'Help an uninitiated reader understand the supported relationship.', output: 'image',
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]!.content).not.toContain('NUMBERED HAND-DRAWN STYLE INDEX');
    expect(calls[1]![0]!.content).toContain('NUMBERED HAND-DRAWN STYLE INDEX');
    expect(result.document.scenes[0]!.illustration?.treatment).toContain('HANDDRAW_STYLE=#002');
    expect(renderStoryboard(result.document, { locale: 'en', style: 'auto', instruction: 'Explain the relation.', output: 'image' }).toString()).not.toContain('HANDDRAW_STYLE=');
    expect(result.designSkills).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style' }));
    const brief = result.document.scenes[0]!.illustration!;
    const design = loadInstalledMediaSkills('auto', brief.treatment, 'render');
    const prompt = compileIllustrationImagePrompt(brief, design.instructions);
    expect(prompt).toContain('Conceptual Continuous-Line Editorial');
    expect(prompt).not.toContain('HANDDRAW_STYLE=#002');
  });

  it('rejects missing or unsupported style choices before any image request', async () => {
    for (const styleId of [undefined, 'handdraw:#999', 'article:missing']) {
      const { gateway } = mockGateway('Soft paper with a clear focal point.', styleId);
      await expect(generateIllustrationStoryboard(gateway, claims, {
        locale: 'en', style: 'auto', instruction: 'Explain the relationship.', output: 'image',
      })).rejects.toThrow('auto_style');
    }
  });

  it('can choose Baoyu art without changing the source-grounded science', async () => {
    const { gateway, calls } = mockGateway('Calm routes with direct labels.', 'infographic:subway-map');
    const result = await generateIllustrationStoryboard(gateway, claims, {
      locale: 'en', style: 'auto', instruction: 'Explain the supported relation.', output: 'image',
    });
    expect(calls[0]![0]!.content).not.toContain('BAOYU STYLE INDEX');
    expect(calls[1]![0]!.content).toContain('BAOYU STYLE INDEX');
    const brief = result.document.scenes[0]!.illustration!;
    const design = loadInstalledMediaSkills('auto', brief.treatment, 'render');
    const prompt = compileIllustrationImagePrompt(brief, design.instructions);
    expect(prompt).toContain('The source establishes a relation between two regions.');
    expect(prompt).toContain('Colored route lines');
    expect(prompt).not.toContain('BAOYU_STYLE=');
    expect(design.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-infographic' }));
  });

  it('repairs a persisted old-format art rejection with the separate style field', async () => {
    const { gateway, calls } = mockGateway('Direct ink labels.', 'handdraw:#002');
    await generateIllustrationStoryboard(gateway, claims, {
      locale: 'en', style: 'auto', instruction: 'Explain the relation.', output: 'image',
    }, undefined, new Map(), undefined, undefined, undefined, {
      rejectedCandidates: [{ structuredAttempt: 3, kind: 'schema_validation', diagnostic: 'auto_style_invalid_scene_0',
        text: JSON.stringify({ scenes: [{ layout: 'A focal relation.', treatment: 'HANDDRAW_STYLE=#002; old format.' }] }) }],
      saveScience: vi.fn(async () => {}), beforeArtSubmission: vi.fn(async () => {}), rejectArt: vi.fn(async () => {}),
    });
    expect(calls[1]!.at(-1)!.content).toContain('styleId');
    expect(calls[1]!.at(-1)!.content).toContain('marker-free');
  });

  it('retains the chosen style when formal review revises art prose', async () => {
    const settings = { locale: 'en' as const, style: 'auto', instruction: 'Explain the relation.', output: 'image' as const };
    const candidate = await generateIllustrationStoryboard(mockGateway('Quiet ink.', 'handdraw:#002').gateway, claims, settings);
    const reviewScientific = vi.fn(async (input: { prompt: string }) => {
      expect(input.prompt).toContain('Conceptual Continuous-Line Editorial');
      return { text: JSON.stringify({ decision: 'revised', summary: 'Simplify the art.', corrections: [
        { sceneIndex: 0, treatment: 'Softer ink with clear labels.' },
      ] }), promptHash: 'p', responseHash: 'r', provider: 'test', model: 'test' };
    });
    const reviewed = await reviewIllustrationStoryboard({ reviewScientific } as never, claims, settings, candidate.document, {
      researchObjectId: 'ro', versionId: 'version', sourceEvidenceIdentity: 'source',
      authorizationContext: { taskId: 'review' }, illustrationContext: {},
    } as never);
    expect(reviewed.document.scenes[0]!.illustration!.treatment).toBe('HANDDRAW_STYLE=#002; Softer ink with clear labels.');
    expect(reviewed.designSkills).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', resources: expect.arrayContaining(['references/style-catalogue.json#002']) }));
  });

  it('gives pixel review the same selected appearance guidance as rendering', async () => {
    const settings = { locale: 'en' as const, style: 'auto', instruction: 'Explain the relation.', output: 'image' as const };
    const candidate = await generateIllustrationStoryboard(mockGateway('Calm lines.', 'infographic:subway-map').gateway, claims, settings);
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/QWQAAAAASUVORK5CYII=', 'base64');
    const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
    const reviewScientific = vi.fn(async (input: { prompt: string }) => {
      const render = loadInstalledMediaSkills('auto', candidate.document.scenes[0]!.illustration!.treatment, 'render');
      expect(input.prompt).toContain(render.instructions);
      const response = JSON.stringify({ decision: 'accepted', summary: 'The relation is readable.', repairInstruction: null });
      return { text: response, promptHash: hash(input.prompt), responseHash: hash(response),
        provider: 'chatgpt-web-science-review', model: 'gpt-5.6-sol' };
    });
    await reviewGeneratedImage({ reviewScientific } as never, {
      bytes, contentType: 'image/png', claims, settings, document: candidate.document, sceneIndex: 0,
      authorizationContext: { taskId: 'review' }, illustrationContext: {}, researchObjectId: 'ro', versionId: 'version',
      identity: { requestId: 'review', contentHash: hash(bytes), sourceEvidenceIdentity: 'source', parentIdentity: 'parent' },
    } as never);
    expect(reviewScientific).toHaveBeenCalledOnce();
  });
});
