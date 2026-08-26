import * as React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'nav.explore': 'Explore',
      'nav.create': 'Create',
      'nav.about': 'About',
      'nav.login': 'Log in',
      'nav.desk': 'Research desk',
      'hero.kicker': 'Research, as a living object',
      'hero.subtitle': 'Evidence, structure and versions remain connected.',
      'hero.ctaExplore': 'Explore research',
      'hero.ctaCreate': 'Create research object',
      'hero.metaObject': 'Research Object',
      'hero.metaStructure': 'SDF metadata',
      'hero.metaVersion': 'Version provenance',
      'latest.title': 'The public index',
      'latest.empty': 'Verified public research objects will appear here.',
      'latest.item1': 'Original evidence stays attached',
      'latest.item2': 'Structure remains inspectable',
      'latest.item3': 'Every version stays citable',
      'openRo.eyebrow': 'Open Research Object',
      'openRo.title': 'One object. Six evidence layers.',
      'openRo.description': 'Research remains connected under one stable identity.',
      'openRo.action': 'Open the public index',
      'openRo.stableId': 'Stable identity',
      'openRo.node1': 'Problem',
      'openRo.node2': 'Insight',
      'openRo.node3': 'Method',
      'openRo.node4': 'Results',
      'openRo.node5': 'Limitations',
      'openRo.node6': 'Reproducibility',
      'openRo.node1Summary': 'The question and scope the object claims to address.',
      'openRo.node2Summary': 'The central contribution separated from supporting evidence.',
      'openRo.node3Summary': 'The procedure, materials, and assumptions used to produce the result.',
      'openRo.node4Summary': 'The observations and outputs that support the stated conclusion.',
      'openRo.node5Summary': 'Known constraints, uncertainty, and claims the evidence does not support.',
      'openRo.node6Summary': 'The data, code, environment, and steps needed to reproduce the work.',
      'trust.title': 'Open, but trusted.',
      'trust.subtitle': 'Versions, licenses, reviews, and evidence stay traceable.',
    };
    return messages[key] ?? key;
  },
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => ({
    'skipToContent': 'Skip to research content',
    'primaryNavigation': 'Primary navigation',
  })[key] ?? key,
}));

vi.mock('next/font/google', () => ({
  Archivo: () => ({ className: 'archivo-font' }),
}));

describe('Optical Editorial landing page', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  async function renderLandingPage() {
    const { default: Page } = await import('../app/page');
    return renderToStaticMarkup(await Page());
  }

  it('declares the intentional pre-hydration html class mutation', () => {
    const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    expect(layoutSource).toContain('<html\n      suppressHydrationWarning');
    expect(layoutSource).toContain("document.documentElement.classList.add('js')");
  });

  it('promotes the accepted optical surface without changing the public landing composition', async () => {
    const markup = await renderLandingPage();
    const headlineText = markup
      .match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]
      .replace(/<[^>]+>/g, '');
    const energyPlateAt = markup.indexOf('src="/optical-lab/energy-plate-black-alpha-v1.52cbf993a05e8d00.png"');
    const typographyPlateAt = markup.indexOf('src="/optical-lab/target-reference.1622d38cd152f414.png"');

    expect(markup.match(/data-accepted-optical-surface=/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-accepted-optical-surface="landing"');
    expect(markup).toContain('id="landing-optical-surface"');
    expect(markup).toContain('id="landing-optical-diagnostics"');
    expect(markup).toContain('data-optical-asset-interaction-host="true"');
    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headlineText).toBe('Science evolves.');
    expect(energyPlateAt).toBeGreaterThan(-1);
    expect(typographyPlateAt).toBeGreaterThan(energyPlateAt);
    expect(markup).toContain('data-landing-art-direction="optical-editorial-v3"');
    expect(markup).not.toContain('data-optical-field="true"');
    expect(markup).not.toContain('data-optical-text-stage="true"');
    expect(markup).not.toContain('<video');
    expect(markup).not.toContain('ro-loop');
    expect(markup).not.toContain('data-hero-loop-policy');
    expect(markup).not.toContain('data-landing-module="evolution"');
    expect(markup).not.toContain('data-landing-module="hermes"');
    expect(markup).not.toContain('data-landing-module="trust"');
  });

  it('keeps Create, Explore and standalone login as real destinations', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('href="/research-objects/new"');
    expect(markup).toContain('href="/explore"');
    expect(markup).toContain('href="/auth/login"');
    const { default: ExplorePage } = await import('../app/explore/page');
    expect(renderToStaticMarkup(await ExplorePage())).toContain('data-explore-index="true"');
  });

  it('keeps the optimized hero hierarchy without fabricated metadata', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('data-hero-action="primary"');
    expect(markup).toContain('data-hero-action="secondary"');
    expect(markup.indexOf('href="/explore"')).toBeLessThan(markup.indexOf('href="/research-objects/new"'));
    expect(markup).not.toContain('data-hero-metadata-legend');
    expect(markup).not.toContain('optical-cursor-ring');
    expect(markup).toContain('data-typography-coupling="reference-plate"');
    expect(markup).toContain('data-optical-lab-evolves-ink="true"');
  });

  it('uses the shared public shell and keeps the accepted optical plates decorative', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('data-os-surface="public"');
    expect(markup).toContain('data-optical-lab-asset-plate="true"');
    expect(markup).toContain('data-optical-lab-target-typography-plate="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).not.toContain('data-symbol-variant');
    expect(markup).not.toContain('data-latest-skeleton');
    expect(markup).not.toContain('select-none');
    expect(markup).not.toContain('RO / SDF / v∞');
    expect(markup).not.toContain('OS / 00—∞');
  });

  it('keeps one semantic headline while the amplified shared surface carries interaction', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('data-asset-candidate="true"');
    expect(markup).toContain('data-render-mode="asset-static"');
    expect(markup).toContain('data-optical-lab-semantic-title="true"');
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).not.toContain('data-optical-text-base="true"');
    expect(markup).not.toContain('data-optical-field="true"');
  });

  it('uses the next viewport for a complete Open RO anatomy instead of principle placeholders', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('data-landing-module="open-ro"');
    expect(markup).toContain('data-open-ro-index="true"');
    expect(markup.match(/data-sdf-node=/g)).toHaveLength(6);
    expect(markup.match(/data-sdf-node-summary=/g) ?? []).toHaveLength(6);
    expect(markup.match(/tabindex="0"/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(markup).toContain('data-open-ro-density="calm"');
    expect(markup).toContain('Open Research Object');
    expect(markup).toContain('href="/explore"');
    expect(markup).not.toContain('data-landing-module="principles"');
  });

  it('renders the Explore index with paper-tone navigation', async () => {
    const { default: ExplorePage } = await import('../app/explore/page');
    const markup = renderToStaticMarkup(await ExplorePage());
    expect(markup).toContain('data-navigation-tone="paper"');
    const navigation = markup.match(/<div[^>]*data-navigation-tone="paper"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(navigation).toContain('text-os-muted-paper');
    expect(navigation).toContain('border-os-rule-paper text-os-ink');
    expect(navigation).not.toContain('text-os-muted-dark');
  });

  it('keeps Landing navigation frozen while public product pages expose the research desk', async () => {
    const { default: SiteHeader } = await import('../components/landing/SiteHeader');
    const landing = renderToStaticMarkup(<SiteHeader />);
    const publicProduct = renderToStaticMarkup(<SiteHeader active="explore" context="public-product" tone="paper" />);

    expect(landing).not.toContain('href="/dashboard"');
    expect(publicProduct).toContain('href="/dashboard"');
    expect(publicProduct).toMatch(/aria-current="page"[^>]*href="\/explore"/u);
    expect(publicProduct).toContain('href="/research-objects/new"');
    expect(publicProduct).toContain('href="/auth/login"');
    expect(publicProduct).toContain('data-mobile-navigation-grid="true"');
    expect(landing).not.toContain('data-mobile-navigation-grid="true"');
  });
});
