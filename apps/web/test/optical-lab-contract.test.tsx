import * as React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { OpticalLabTypographySpecimen } from '../components/optical-lab/OpticalLabTypographySpecimen';
import { measureTypography } from './visual/optical-lab-reference-metrics.mjs';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));

vi.mock('next/font/google', () => ({
  Archivo: () => ({ className: 'archivo-font' }),
}));

const pageUrl = new URL('../app/_visual/optical-lab/page.tsx', import.meta.url);
const pageModule = existsSync(fileURLToPath(pageUrl))
  ? await import('../app/_visual/optical-lab/page')
  : null;
const typeSpecimenPageUrl = new URL('../app/_visual/optical-lab/type-specimen/page.tsx', import.meta.url);
const typeSpecimenPageModule = existsSync(fileURLToPath(typeSpecimenPageUrl))
  ? await import('../app/_visual/optical-lab/type-specimen/page')
  : null;

describe('isolated Optical Lab route contract', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  async function renderLab() {
    if (!pageModule) return '';
    return renderToStaticMarkup(await pageModule.default());
  }

  it('renders target, current production and candidate as three explicit comparison panels', async () => {
    const markup = await renderLab();
    expect(markup.match(/data-optical-lab-panel=/g) ?? []).toHaveLength(3);
    expect(markup).toContain('data-optical-lab-panel="target"');
    expect(markup).toContain('data-optical-lab-panel="current"');
    expect(markup).toContain('data-optical-lab-panel="candidate"');
    expect(markup).toContain('/optical-lab/target-reference.png');
    expect(markup).toContain('/optical-lab/current-production.png');
  });

  it('keeps one selectable semantic headline in SSR while the GPU mount remains client-only', async () => {
    const markup = await renderLab();
    const headlineText = markup
      .match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]
      .replace(/<[^>]+>/g, '');
    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-optical-lab-semantic-title="true"');
    expect(headlineText).toBe('Science evolves.');
    expect(markup).toContain('data-optical-lab-client-slot="true"');
    expect(markup).not.toContain('<canvas');
  });

  it('exposes stable renderer diagnostics without forbidden visual primitives', async () => {
    const markup = await renderLab();
    expect(markup).toContain('data-optical-lab-diagnostics="true"');
    expect(markup).toContain('data-render-mode="dom-static"');
    expect(markup).toContain('data-optical-ink="dom"');
    expect(markup).toContain('data-context-status="idle"');
    expect(markup).toContain('data-stable-bounds="pending"');
    expect(markup).not.toContain('optical-cursor-ring');
    expect(markup).not.toContain('radial-boundary');
    expect(markup).not.toContain('vertical-dotted-line');
    expect(markup).not.toContain('spiderweb-fan');
  });

  it('does not leak the experimental renderer into the production homepage graph', () => {
    const productionFiles = [
      '../app/page.tsx',
      '../components/landing/Hero.tsx',
      '../components/brand/OpticalHeadline.tsx',
      '../components/brand/OpticalField.tsx',
    ];
    for (const relativePath of productionFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toContain('optical-lab');
      expect(source).not.toContain('OpticalLab');
    }
  });
});

describe('Optical Lab typography specimen contract', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  it.each([
    ['bricolage', 'true'],
    ['archivo', 'true'],
    ['arial-black-reference', 'false'],
  ] as const)('renders %s as one selectable semantic title', (candidate, shippingEligible) => {
    const markup = renderToStaticMarkup(<OpticalLabTypographySpecimen candidate={candidate} />);

    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-optical-selectable="true"');
    expect(markup).toContain('data-optical-specimen="true"');
    expect(markup).toContain(`data-shipping-eligible="${shippingEligible}"`);
    expect(markup).toContain('data-optical-aperture="0.58"');
    expect(markup).toContain('data-optical-science="true"');
    expect(markup).toContain('data-optical-evolves="true"');
    expect(markup).toContain('data-optical-baseline="true"');
    const titleText = markup.match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '');
    expect(titleText).toBe('Science evolves.');
  });

  it('defaults the specimen route to the approved Archivo shipping candidate', () => {
    expect(typeSpecimenPageModule).not.toBeNull();
    const markup = renderToStaticMarkup(typeSpecimenPageModule!.default({}));

    expect(markup).toContain('data-optical-specimen-candidate="archivo"');
    expect(markup).toContain('data-shipping-eligible="true"');
  });

  it('measures the approved native typography fixture as one line at the fixed aperture', () => {
    const measured = measureTypography({
      viewport: { width: 1672, height: 941 },
      title: { left: 36.8, right: 1600.0, top: 337.0, bottom: 564.6 },
      science: { left: 36.8, right: 969.8 },
      evolves: { left: 969.8, right: 1600.0 },
      baselineY: 510.0,
    });

    expect(measured.oneLine).toBe(true);
    expect(Math.abs(measured.apertureX - .58)).toBeLessThanOrEqual(.005);
    expect(measured.title.left).toBeGreaterThanOrEqual(.017);
    expect(measured.title.left).toBeLessThanOrEqual(.027);
    expect(measured.title.right).toBeGreaterThanOrEqual(.952);
    expect(measured.title.right).toBeLessThanOrEqual(.962);
    expect(measured.title.top).toBeGreaterThanOrEqual(.348);
    expect(measured.title.top).toBeLessThanOrEqual(.368);
    expect(measured.title.bottom).toBeGreaterThanOrEqual(.59);
    expect(measured.title.bottom).toBeLessThanOrEqual(.61);
  });
});
