import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'nav.explore': 'Explore',
      'nav.create': 'Create',
      'nav.about': 'About',
      'nav.login': 'Log in',
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

describe('Optical Editorial landing page', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  async function renderLandingPage() {
    const { default: Page } = await import('../app/page');
    return renderToStaticMarkup(await Page());
  }

  it('renders the bilingual brand memory as accessible DOM text', async () => {
    const markup = await renderLandingPage();
    const text = markup.replace(/<[^>]+>/g, '');
    expect(text).toContain('Science');
    expect(text).toContain('evolves.');
    expect(text).toContain('科学，持续演化。');
    expect(markup.match(/data-vermilion-marker=/g)).toHaveLength(1);
    expect(markup).not.toContain('<video');
    expect(markup).not.toContain('ro-loop');
  });

  it('keeps Create, Explore and standalone login as real destinations', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('href="/research-objects/new"');
    expect(markup).toContain('href="/explore"');
    expect(markup).toContain('href="/auth/login"');
    const { default: ExplorePage } = await import('../app/explore/page');
    expect(renderToStaticMarkup(await ExplorePage())).toContain('data-explore-index="true"');
  });

  it('uses the shared public shell and a decorative-only optical field', async () => {
    const markup = await renderLandingPage();
    expect(markup).toContain('data-os-surface="public"');
    expect(markup).toContain('data-optical-field="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).not.toContain('data-symbol-variant');
    expect(markup).not.toContain('data-latest-skeleton');
    expect(markup).not.toContain('select-none');
    expect(markup).not.toContain('RO / SDF / v∞');
    expect(markup).not.toContain('OS / 00—∞');
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
});
