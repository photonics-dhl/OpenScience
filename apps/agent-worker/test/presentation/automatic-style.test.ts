import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AiGateway, type Provider } from '@openscience/ai-gateway';
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
  it('repairs a bare art object through the real structured Gateway retry', async () => {
    const requests: Array<Array<{ content: string }>> = [];
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async ({ messages }) => {
      requests.push(messages);
      const text = requests.length === 1 ? JSON.stringify(science)
        : requests.length === 2 ? JSON.stringify({ layout: 'A focused relation.', treatment: 'Quiet ink.' })
          : JSON.stringify({ scenes: [{ layout: 'A focused relation.', treatment: 'Quiet ink.' }] });
      return { text, model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } };
    } };
    const result = await generateIllustrationStoryboard(new AiGateway({ providers: [provider] }), claims, {
      locale: 'en', style: 'aged-academia', instruction: 'Keep one sourced relationship.', output: 'image',
    });
    expect(requests).toHaveLength(3);
    expect(requests[2]!.at(-1)!.content).toMatch(/top-level.*"scenes".*"layout".*"treatment"/u);
    expect(requests[2]!.at(-1)!.content).toContain('a root-level array');
    expect(requests[2]!.at(-1)!.content).not.toContain('"layout":"placement"');
    expect(result.document.scenes[0]!.illustration?.treatment).toBe('Quiet ink.');
  });

  it('ends a single explicit-style art request with its required scenes wrapper', async () => {
    const { gateway, calls } = mockGateway('Quiet ink.');
    await generateIllustrationStoryboard(gateway, claims, {
      locale: 'en', style: 'aged-academia', instruction: 'Keep one sourced relationship.', output: 'image',
    });
    expect(calls).toHaveLength(2);
    const finalInstruction = calls[1]!.at(-1)!.content;
    expect(finalInstruction).toMatch(/one top-level key "scenes".*exactly one object.*"layout".*"treatment"/u);
    expect(finalInstruction).not.toContain('"layout":"placement"');
  });

  it('ends a two-scene auto art request with the complete scenes wrapper and style keys', async () => {
    const twoScenes = { title: 'Two relationships', scenes: [
      { ...science.scenes[0]!, title: 'First relationship' },
      { ...science.scenes[0]!, title: 'Second relationship' },
    ] };
    const calls: Array<Array<{ content: string }>> = [];
    const completeStructured = vi.fn(async (_guard: unknown, messages: Array<{ content: string }>) => {
      calls.push(messages);
      return calls.length === 1 ? twoScenes : { scenes: [
        { layout: 'First source-grounded relation.', treatment: 'Fine ink.', styleId: 'handdraw:#002' },
        { layout: 'Second source-grounded relation.', treatment: 'Fine ink.', styleId: 'handdraw:#002' },
      ] };
    });
    const result = await generateIllustrationStoryboard({ completeStructured } as never, claims, {
      locale: 'en', style: 'auto', instruction: 'Use two separate scenes for two relationships.', output: 'image',
    });
    expect(result.document.scenes).toHaveLength(2);
    expect(calls[1]!.at(-1)!.content).toContain('one top-level key "scenes"');
    expect(calls[1]!.at(-1)!.content).toContain('exactly 2 objects');
    expect(calls[1]!.at(-1)!.content).toContain('"styleId"');
    expect(calls[1]!.at(-1)!.content).toContain('no root-level array');
  });

  it('reasserts the one-scene wrapper after a saved malformed art candidate', async () => {
    const { gateway, calls } = mockGateway('Quiet ink.');
    await generateIllustrationStoryboard(gateway, claims, {
      locale: 'en', style: 'aged-academia', instruction: 'Keep one sourced relationship.', output: 'image',
    }, undefined, new Map(), undefined, undefined, undefined, {
      rejectedCandidates: [{ structuredAttempt: 3, kind: 'schema_validation', diagnostic: 'art_root:missing_scenes',
        text: JSON.stringify({ layout: 'A focal relation.', treatment: 'Quiet ink.' }) }],
      saveScience: vi.fn(async () => {}), beforeArtSubmission: vi.fn(async () => {}), rejectArt: vi.fn(async () => {}),
    });
    const finalInstruction = calls[1]!.at(-1)!.content;
    expect(finalInstruction).toMatch(/one top-level key "scenes".*exactly one object.*"layout".*"treatment"/u);
    expect(finalInstruction).toContain('no root-level layout or treatment');
  });

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

  it('stops a numerical result that no bound subject and original passage support', async () => {
    const unsupported = { ...science, scenes: [{ ...science.scenes[0]!,
      narration: 'A model gives a 19 as pulse.', message: 'A 19 as pulse.', labels: ['19 as pulse'] }] };
    const completeStructured = vi.fn(async () => completeStructured.mock.calls.length === 1
      ? unsupported : { scenes: [{ layout: 'Draw the pulse.', treatment: 'Quiet ink.' }] });
    await expect(generateIllustrationStoryboard({ completeStructured } as never, claims, {
      locale: 'en', style: 'watercolor', instruction: 'Explain the model result.', output: 'image',
    })).rejects.toThrow('unbound_numeric_19');
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it('keeps a numerical result when its subject and exact original both support it', async () => {
    const groundedClaims = [{ ...claims[0]!, sourcePassages: [{ ...claims[0]!.sourcePassages![0]!,
      text: 'The reviewed model gives a 19 as pulse under the stated condition.' }] }];
    const groundedScience = { ...science, scenes: [{ ...science.scenes[0]!,
      narration: 'The model gives a 19 as pulse.', message: 'A 19 as model pulse.', labels: ['19 as'],
      subjects: [{ description: 'The model gives a 19 as pulse.', basis: { sourceId: 's0' } }],
    }] };
    const completeStructured = vi.fn(async () => completeStructured.mock.calls.length === 1
      ? groundedScience : { scenes: [{ layout: 'Place a symbolic time window at the focal point.', treatment: 'Quiet ink.' }] });
    const result = await generateIllustrationStoryboard({ completeStructured } as never, groundedClaims, {
      locale: 'en', style: 'aged-academia', instruction: 'Explain the supported model result.', output: 'image',
    });
    expect(result.document.scenes[0]!.illustration?.labels).toEqual(['19 as']);
    expect(completeStructured).toHaveBeenCalledTimes(2);
  });

  it.each(['scene title', 'root title'])('rejects an unbound number that appears only in the $name', async field => {
    const candidate = field === 'scene title'
      ? { ...science, scenes: [{ ...science.scenes[0]!, title: '19 as virtual pulse' }] }
      : { ...science, title: '19 as virtual pulse' };
    const completeStructured = vi.fn(async () => candidate);
    await expect(generateIllustrationStoryboard({ completeStructured } as never, claims, {
      locale: 'en', style: 'aged-academia', instruction: 'Explain the source.', output: 'image',
    })).rejects.toThrow('unbound_numeric_19_as');
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it('rejects an unbound number that appears only in whole-paper mainMessage', async () => {
    const candidate = { ...science, narrative: { mainMessage: 'A 19 as pulse', audience: 'General reader' },
      scenes: science.scenes.map(scene => ({ ...scene, paperOriginalAssetId: null })) };
    const completeStructured = vi.fn(async () => candidate);
    await expect(generateIllustrationStoryboard({ completeStructured } as never, claims, {
      locale: 'en', style: 'aged-academia', instruction: 'Explain the paper.', output: 'image', narrative: true,
    }, undefined, new Map(), { versionSdf: {}, reviewedAnalysis: {},
      scientificReview: { status: 'review_received', fieldReviews: [], needsMoreEvidence: [] },
      sourceContext: { excerpts: [], coverage: {} } } as never)).rejects.toThrow('unbound_numeric_19_as');
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it('accepts sourced numerical scene and root titles with a bilingual photon count', async () => {
    const source = 'The model yields about 270 scattered photons.';
    const inputClaims = [{ ...claims[0]!, sourcePassages: [{ ...claims[0]!.sourcePassages![0]!, text: source }] }];
    const candidate = { ...science, title: '约270个散射光子', scenes: [{ ...science.scenes[0]!,
      title: '约270光子', message: '模型得到约270光子', narration: '约270个散射光子来自模型。',
      labels: ['约270光子'], subjects: [{ description: '模型得到约270个散射光子。', basis: { sourceId: 's0' } }],
    }] };
    const completeStructured = vi.fn(async () => completeStructured.mock.calls.length === 1 ? candidate
      : { scenes: [{ layout: 'One result card.', treatment: 'Quiet ink.' }] });
    const result = await generateIllustrationStoryboard({ completeStructured } as never, inputClaims, {
      locale: 'zh', style: 'aged-academia', instruction: 'Explain the model result.', output: 'image',
    });
    expect(result.document.title).toBe('约270个散射光子');
    expect(result.document.scenes[0]!.illustration?.labels).toEqual(['约270光子']);
  });

  it('accepts two separate sourced model cases with the paper\'s photon-count notation', async () => {
    const passages = [
      'A 20 nm slit gives FWHMS of 77 nm; a 1 MeV electron crosses the field.',
      'The virtual pulse has FWHMT of 19 as in the single-electron model.',
      'The independent bunch has a duration of 50 as, charge 5 pC, energy 2 MeV and a 4.4 μm driving field.',
      'The modeled overall ICS-pulse width FWHMT is 99 as, and N SP of the ICS pulse increases to approximately 270.',
    ];
    const inputClaims = [{ ...claims[0]!, sourcePassages: passages.map((text, i) => ({
      evidenceId: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, relation: 'supports' as const, text,
    })) }];
    const first = { ...science.scenes[0]!, title: '19 as 虚拟脉冲', narration: '模型的单电子结果约19 as。',
      message: '20 nm 开放缝中局域的场映射到约19 as虚拟脉冲。',
      subjects: [
        { description: '20 nm缝中FWHMS约77 nm，1 MeV电子穿过。', basis: { sourceId: 's0' } },
        { description: '单电子模型给出约19 as虚拟脉冲。', basis: { sourceId: 's1' } },
      ], labels: ['20 nm', '约19 as'], encoding: '用象征性时间窗表示约19 as结果，不绘无数据曲线。',
    };
    const second = { ...science.scenes[0]!, title: '99 as 与约270散射光子',
      narration: '独立的电子团模型给出约99 as、约270个散射光子。',
      message: '50 as、2 MeV、5 pC电子团与4.4 μm驱动给出99 as脉冲和约270光子。',
      subjects: [
        { description: '电子团50 as、2 MeV、5 pC；驱动波长4.4 μm。', basis: { sourceId: 's2' } },
        { description: '模型给出FWHMT=99 as、N_SP≈270散射光子。', basis: { sourceId: 's3' } },
      ], labels: ['50 as电子团', '99 as', '约270散射光子'],
      encoding: '用独立时间窗与结果卡说明99 as和约270光子，不共用第一幕比例。',
    };
    const candidate = { title: 'Two independent model cases', scenes: [first, second] };
    const completeStructured = vi.fn(async () => completeStructured.mock.calls.length === 1 ? candidate
      : { scenes: [{ layout: 'A symbolic time window.', treatment: 'Quiet ink.' },
        { layout: 'A separate result card.', treatment: 'Quiet ink.' }] });
    const result = await generateIllustrationStoryboard({ completeStructured } as never, inputClaims, {
      locale: 'zh', style: 'aged-academia', instruction: 'Explain two independent cases.', output: 'image',
    });
    expect(result.document.scenes).toHaveLength(2);
    expect(result.document.scenes[1]!.illustration?.labels).toContain('约270散射光子');
  });

  it.each([
    { name: 'wrong unit', source: 'A 19 nm aperture was modeled.', subject: 'A 19 nm aperture.', claim: '19 as pulse' },
    { name: 'single-digit value', source: 'A 2 nm aperture was modeled.', subject: 'A 2 nm aperture.', claim: '2 MeV electron' },
    { name: 'unsupported uncertainty', source: 'The model gives a 19 as pulse.', subject: 'A 19 as pulse.', claim: '19 ± 2 as pulse' },
    { name: 'unsupported range endpoint', source: 'The model gives a 19 as pulse.', subject: 'A 19 as pulse.', claim: '19–25 as pulse' },
    { name: 'scientific exponent', source: 'The result was 2.3×10^6 photons.', subject: '2.3×10^6 photons.', claim: '2.3×10^7 photons' },
    { name: 'same number, different variable', source: 'FWHM_S≈77 nm was calculated.', subject: 'FWHM_S≈77 nm.', claim: 'FWHM_T≈77 nm' },
    { name: 'Chinese text after a unit', source: 'A 19 nm aperture was modeled.', subject: 'A 19 nm aperture.', claim: '19 as脉冲' },
    { name: 'an unlisted unit', source: 'The source used 5 K.', subject: 'A 5 K condition.', claim: '5 W' },
    { name: 'two variables sharing one value and unit', source: 'FWHM_T=50 as.', subject: 'FWHM_T=50 as.', claim: 'τ_e=50 as' },
    { name: 'a changed sign', source: 'The displacement was +19 nm.', subject: 'A +19 nm displacement.', claim: '-19 nm' },
    { name: 'an ASCII range endpoint', source: 'The interval was 19-24 as.', subject: 'A 19-24 as interval.', claim: '19-25 as' },
    { name: 'two occurrences with different units', source: 'A 19 nm aperture was modeled.', subject: 'A 19 nm aperture.', claim: '19 nm aperture and 19 as pulse' },
    { name: 'different scattered particles', source: 'The model yields 270 scattered electrons.', subject: '270 scattered electrons.', claim: '270 scattered photons' },
    { name: 'Chinese approximate prefix', source: 'A 19 nm aperture was modeled.', subject: 'A 19 nm aperture.', claim: '约19 as脉冲' },
    { name: 'sentence-final unsupported value', source: 'The model gives a 19 as pulse.', subject: 'A 19 as pulse.', claim: 'The model gives a 25 as pulse.' },
  ])('rejects a $name even when a nearby number matches', async ({ source, subject, claim }) => {
    const inputClaims = [{ ...claims[0]!, sourcePassages: [{ ...claims[0]!.sourcePassages![0]!, text: source }] }];
    const candidate = { ...science, scenes: [{ ...science.scenes[0]!, message: claim, narration: claim,
      labels: [claim], subjects: [{ description: subject, basis: { sourceId: 's0' } }] }] };
    const completeStructured = vi.fn(async () => candidate);
    await expect(generateIllustrationStoryboard({ completeStructured } as never, inputClaims, {
      locale: 'en', style: 'aged-academia', instruction: 'Explain the supported result.', output: 'image',
    })).rejects.toThrow('unbound_numeric_');
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it('keeps independent quantities in separate scientific fields and ignores a Chinese label reference', async () => {
    const source = 'FWHM_S≈77 nm and an electron energy of 1 MeV were used.';
    const inputClaims = [{ ...claims[0]!, sourcePassages: [{ ...claims[0]!.sourcePassages![0]!, text: source }] }];
    const candidate = { ...science, scenes: [{ ...science.scenes[0]!,
      message: 'FWHM_S≈77 nm', narration: 'A 1 MeV electron crosses the field.',
      encoding: '标签 1 describes the electron; the field is FWHM_S≈77 nm.', labels: ['Field', '1 MeV electron'],
      subjects: [{ description: source, basis: { sourceId: 's0' } }],
    }] };
    const completeStructured = vi.fn(async () => completeStructured.mock.calls.length === 1 ? candidate
      : { scenes: [{ layout: 'One physical arrangement.', treatment: 'Quiet ink.' }] });
    const result = await generateIllustrationStoryboard({ completeStructured } as never, inputClaims, {
      locale: 'en', style: 'aged-academia', instruction: 'Explain the sourced conditions.', output: 'image',
    });
    expect(result.document.scenes[0]!.illustration?.labels).toEqual(['Field', '1 MeV electron']);
  });

  it('feeds an unbound quantity back through the real Gateway and accepts its grounded repair', async () => {
    const source = 'A 19 nm aperture was modeled.';
    const inputClaims = [{ ...claims[0]!, sourcePassages: [{ ...claims[0]!.sourcePassages![0]!, text: source }] }];
    const candidate = (label: string) => ({ ...science, scenes: [{ ...science.scenes[0]!,
      message: label, narration: label, labels: [label],
      subjects: [{ description: 'A 19 nm aperture.', basis: { sourceId: 's0' } }],
    }] });
    const requests: Array<Array<{ content: string }>> = [];
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async ({ messages }) => {
      requests.push(messages);
      const response = requests.length === 1 ? candidate('19 as pulse') : requests.length === 2
        ? candidate('19 nm aperture') : { scenes: [{ layout: 'One sourced aperture.', treatment: 'Quiet ink.' }] };
      return { text: JSON.stringify(response), model: 'fixture', usage: { inputTokens: 1, outputTokens: 1 } };
    } };
    const result = await generateIllustrationStoryboard(new AiGateway({ providers: [provider] }), inputClaims, {
      locale: 'en', style: 'aged-academia', instruction: 'Explain the supported aperture.', output: 'image',
    });
    expect(requests).toHaveLength(3);
    expect(requests[1]!.at(-1)!.content).toContain('unbound_numeric_19_as');
    expect(result.document.scenes[0]!.illustration?.labels).toEqual(['19 nm aperture']);
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
      expect(input.prompt).toContain('image together with its approved scene title and narration');
      expect(input.prompt).toContain('a caption cannot excuse a wrong arrow');
      expect(input.prompt).toContain('a localized near region drawn far from its source or as an outward-spreading wave');
      expect(input.prompt).toContain('the reader narration must state that limit directly');
      expect(input.prompt).toContain('A small deviation from an art/layout instruction is not blocking');
      expect(input.prompt).toContain('a style or layout departure blocks only if it makes an essential relationship unreadable or scientifically misleading');
      expect(input.prompt).toContain('A speculative claim that a reader might look elsewhere first is an aesthetic suggestion');
      expect(input.prompt).not.toContain('material violation of explicit art/style instructions');
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
