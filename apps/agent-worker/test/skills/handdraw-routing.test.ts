import { describe, expect, it } from 'vitest';
import { CODEX_IMAGE_MAX_JSON_BYTES, imageSpoolRequestByteUpperBound } from '@openscience/ai-gateway';
import type { IllustrationBrief } from '@openscience/domain';
import { compileIllustrationImagePrompt } from '../../src/presentation/scene-image';
import { automaticStyleReviewGuidance, automaticStyleTreatment, loadInstalledMediaSkills, selectedAutomaticArtStyle, selectedHanddrawStyle } from '../../src/skills/installed-media-skills';

describe('Hermes media skill stages', () => {
  it('keeps scientific visual clarity in science without adding art routing', () => {
    const science = loadInstalledMediaSkills('editorial', '', 'science');
    expect(science.instructions).toContain('one-sentence takeaway');
    expect(science.usage.map((item) => item.id)).toContain('openscience-scientific-visual-clarity');
    expect(science.instructions).not.toContain('Hand-drawn treatment routing');
  });

  it('offers scoped hand-drawn treatment selection to art planning and rendering', () => {
    for (const style of ['scientific', 'editorial', 'watercolor']) {
      const plan = loadInstalledMediaSkills(style, '', 'plan');
      expect(plan.instructions).toContain('Hand-drawn treatment routing');
      expect(plan.instructions).toContain('Reader-first hand-drawn direction');
      expect(plan.usage.map((item) => item.id)).toContain('openscience-handdraw-router');
      expect(plan.usage.map((item) => item.id)).toContain('openscience-handdraw-style');

      const render = loadInstalledMediaSkills(style, '', 'render');
      expect(render.instructions).toContain('Reader-first hand-drawn direction');
      expect(render.instructions).toContain('a third digit, changed unit or dropped subscript');
      expect(render.instructions).toContain('endpoints must touch the specified nearest surfaces');
      expect(render.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', version: '3' }));
      expect(render.usage.map((item) => item.id)).not.toContain('openscience-handdraw-router');
    }
  });

  it('does not displace source context from final scientific review', () => {
    const review = loadInstalledMediaSkills('editorial', '', 'review');
    expect(review.instructions).not.toContain('Hand-drawn treatment routing');
    expect(review.instructions).not.toContain('Reader-first hand-drawn direction');
    expect(review.usage.map((item) => item.id)).not.toContain('openscience-handdraw-style');
  });

  it('does not inject hand-drawn guidance into unrelated styles', () => {
    for (const style of ['technical-schematic', 'minimal', 'pixel-art']) {
      for (const stage of ['plan', 'render'] as const) {
        const selected = loadInstalledMediaSkills(style, '', stage);
        expect(selected.usage.map((item) => item.id)).not.toContain('openscience-handdraw-router');
        expect(selected.usage.map((item) => item.id)).not.toContain('openscience-handdraw-style');
      }
    }
  });

  it('offers selectable numbered styles in art planning, then scopes rendering to the chosen style', () => {
    const science = loadInstalledMediaSkills('auto', '', 'science');
    expect(science.instructions).not.toContain('NUMBERED HAND-DRAWN STYLE INDEX');
    const plan = loadInstalledMediaSkills('auto', '', 'plan');
    expect(plan.instructions).toContain('#001 Playful Deadpan Doodle');
    expect(plan.instructions).toContain('#277');
    expect(plan.instructions).not.toContain('#055 Chaotic Color Doodle Crowd');
    expect(plan.instructions).toContain('article:scientific');
    expect(plan.instructions).toContain('infographic:subway-map');
    expect(plan.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-article-illustrator' }));
    expect(plan.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-infographic' }));
    expect(plan.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', resources: expect.arrayContaining(['references/style-catalogue.json#index']) }));

    expect(selectedHanddrawStyle('material HANDDRAW_STYLE=#002 fine ink')?.name).toBe('Conceptual Continuous-Line Editorial');
    expect(selectedHanddrawStyle('HANDDRAW_STYLE=#999')).toBeUndefined();
    expect(selectedHanddrawStyle('HANDDRAW_STYLE=#002 HANDDRAW_STYLE=#003')).toBeUndefined();
    const render = loadInstalledMediaSkills('auto', 'HANDDRAW_STYLE=#002; fine ink, no extra subject.', 'render');
    expect(render.instructions).toContain('Conceptual Continuous-Line Editorial');
    expect(render.instructions).not.toContain('Playful Deadpan Doodle');
    expect(render.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', resources: expect.arrayContaining(['references/style-catalogue.json#002']) }));
    const baoyu = loadInstalledMediaSkills('auto', 'BAOYU_STYLE=infographic:subway-map; editorial transit lines.', 'render');
    expect(baoyu.instructions).toContain('Colored route lines');
    expect(baoyu.instructions).not.toContain('NUMBERED HAND-DRAWN STYLE INDEX');
    expect(baoyu.usage).toContainEqual(expect.objectContaining({ id: 'baoyu-infographic', resources: expect.arrayContaining(['references/styles/subway-map.md#Visual Elements']) }));
    expect(selectedAutomaticArtStyle('BAOYU_STYLE=article:scientific; precise ink.')).toEqual({ kind: 'baoyu', family: 'article', id: 'scientific' });
    expect(automaticStyleReviewGuidance('BAOYU_STYLE=infographic:subway-map; precise ink.')).toContain('Colored route lines');
    expect(selectedAutomaticArtStyle('BAOYU_STYLE=article:missing; invalid.')).toBeUndefined();
    expect(automaticStyleTreatment('handdraw:#002', 'Fine ink.')).toBe('HANDDRAW_STYLE=#002; Fine ink.');
    expect(automaticStyleTreatment('infographic:subway-map', 'Direct labels.')).toBe('BAOYU_STYLE=infographic:subway-map; Direct labels.');
    expect(automaticStyleTreatment('handdraw:#055', 'Unavailable style.')).toBeUndefined();
    expect(() => loadInstalledMediaSkills('auto', 'No selected marker', 'render')).toThrow('no valid selected style');
  });

  it('keeps the approved science and hand-drawn direction in the bounded image request', () => {
    const brief: IllustrationBrief = {
      schemaVersion: 2, message: 'A supported conceptual relation', domain: 'conceptual',
      subjects: [{ description: 'Sourced subject', basis: {
        claimId: '10000000-0000-4000-8000-000000000001', evidenceId: '20000000-0000-4000-8000-000000000001',
        quote: 'The source describes the relation.',
      } }], encoding: 'A labeled line indicates the supported relation.',
      composition: 'One focal relation with clear spacing.', treatment: 'Fine ink on a calm ground.',
      labels: ['Supported relation', 'FWHM_S≈77 nm'], constraints: ['Conceptual, not to scale'],
    };
    const design = loadInstalledMediaSkills('editorial', '', 'render');
    const prompt = compileIllustrationImagePrompt(brief, design.instructions);
    expect(prompt).toContain('A supported conceptual relation');
    expect(prompt).toContain('Conceptual, not to scale');
    expect(prompt).toContain('Reader-first hand-drawn direction');
    expect(prompt).toContain('FWHM_S≈77 nm');
    expect(prompt).toContain('a third digit, changed unit or dropped subscript');
    expect(imageSpoolRequestByteUpperBound(prompt)).toBeLessThanOrEqual(CODEX_IMAGE_MAX_JSON_BYTES);
    const fullBrief = { ...brief, message: `A supported conceptual relation ${'source detail '.repeat(185)}` };
    const fullPrompt = compileIllustrationImagePrompt(fullBrief, design.instructions);
    expect(fullPrompt).toContain(fullBrief.message);
    expect(fullPrompt).toContain('Reader-first hand-drawn direction');
    expect(fullPrompt).toContain('a third digit, changed unit or dropped subscript');
    expect(imageSpoolRequestByteUpperBound(fullPrompt)).toBeLessThanOrEqual(CODEX_IMAGE_MAX_JSON_BYTES);
  });
});
