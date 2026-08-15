import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { ResearchIndex } from '../components/explore/ResearchIndex';
import { getExploreIndex } from '../lib/api';

afterEach(() => vi.unstubAllGlobals());

describe('Explore Research Index', () => {
  it('requests the public cursor contract with encoded filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await getExploreIndex({ query: 'pump probe', field: 'insight', artifactType: 'image', limit: 20 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/explore?query=pump+probe&limit=20&field=insight&artifactType=image',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('renders a numbered editorial index with provenance-facing metadata and no cards', () => {
    const markup = renderToStaticMarkup(createElement(ResearchIndex, {
      initialPage: {
        items: [{
          publicId: 'OSR-2026-000001', title: 'Ultrafast optical response', url: '/research/OSR-2026-000001', latestVersion: 2,
          publishedAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', insight: 'A measured response.',
          fields: ['problem', 'insight', 'method'], artifactTypes: ['document', 'image'], authors: ['Ada Researcher'],
        }],
        nextCursor: null,
      },
    }));
    expect(markup).toContain('<ol');
    expect(markup).toContain('01');
    expect(markup).toContain('Ultrafast optical response');
    expect(markup).toContain('OSR-2026-000001');
    expect(markup).toContain('Ada Researcher');
    expect(markup).toContain('href="/research/OSR-2026-000001"');
    expect(markup).toContain('no-underline');
    expect(markup).toContain('appearance-none');
    expect(markup).not.toContain('rounded-card');
  });
});
