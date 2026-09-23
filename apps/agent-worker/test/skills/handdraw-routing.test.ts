import { describe, expect, it } from 'vitest';
import { CODEX_IMAGE_MAX_JSON_BYTES, imageSpoolRequestByteUpperBound } from '@openscience/ai-gateway';
import type { IllustrationBrief } from '@openscience/domain';
import { compileIllustrationImagePrompt } from '../../src/presentation/scene-image';
import { loadInstalledMediaSkills } from '../../src/skills/installed-media-skills';

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
      expect(render.usage).toContainEqual(expect.objectContaining({ id: 'openscience-handdraw-style', version: '2' }));
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
