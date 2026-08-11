import * as React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));

const pageUrl = new URL('../app/_visual/optical-lab/page.tsx', import.meta.url);
const pageModule = existsSync(fileURLToPath(pageUrl))
  ? await import('../app/_visual/optical-lab/page')
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
    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-optical-lab-semantic-title="true"');
    expect(markup).toContain('Science');
    expect(markup).toContain('evolves');
    expect(markup).toContain('data-optical-lab-client-slot="true"');
    expect(markup).not.toContain('<canvas');
  });

  it('exposes stable renderer diagnostics without forbidden visual primitives', async () => {
    const markup = await renderLab();
    expect(markup).toContain('data-optical-lab-diagnostics="true"');
    expect(markup).toContain('data-render-mode="dom-static"');
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
