import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { EditorialCollection } from '@/components/editorial/EditorialCollection';
import type { EditorialCollectionApi } from '@/lib/api';
import { vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) => key === 'mediaCount' ? `${values?.count ?? 0} media / evidence` : ({
    edition: 'Journal selection · v1', eyebrow: 'Ultrafast Science / Selected Research', descriptionSuffix: 'Every entry remains versioned.',
    empty: 'The first issue is being composed.', defaultNote: 'Selected Research Object.', selected: 'Selected editorially', read: 'Read the object', source: 'source',
    editorialNote: 'Editorial note', disclosure: 'Editorial selection, not peer-review acceptance.', browse: 'Browse the full Research Index',
  } as Record<string, string>)[key] ?? key,
}));

const collection: EditorialCollectionApi = {
  id: 'collection-1', slug: 'ultrafast-science', title: 'Ultrafast Science', description: 'A journal-curated reading layer.',
  selections: [{
    id: 'selection-1', collectionId: 'collection-1', researchObjectId: 'ro-1', versionId: 'version-2', selectedBy: 'admin-1',
    title: 'Ultrafast carrier relaxation', publicId: 'OSR-2026-000001', versionNo: 2,
    sdf: { insight: 'A stable observation.' }, note: 'Selected for its inspectable evidence chain.',
    media: [{ type: 'image', url: 'https://cdn.example/figure.webp', alt: 'Transient absorption map', credit: 'Research team', licenseId: 'CC-BY-4.0', sourceUrl: 'https://example.org/source' }],
    sortOrder: 1, state: 'published', scheduledAt: '2026-08-10T00:00:00.000Z', publishedAt: '2026-08-10T01:00:00.000Z',
    disclosure: 'Selected by Ultrafast Science. Editorial selection, not peer-review acceptance.', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T01:00:00.000Z',
  }],
};

describe('Ultrafast Science public editorial collection', () => {
  it('renders a version-bound reading entry with disclosure and media provenance', () => {
    const markup = renderToStaticMarkup(<EditorialCollection collection={collection} />);
    expect(markup).toContain('<h1');
    expect(markup).toContain('Ultrafast Science');
    expect(markup).toContain('href="/research/OSR-2026-000001/v/2"');
    expect(markup).toContain('not peer-review acceptance');
    expect(markup).toContain('alt="Transient absorption map"');
    expect(markup).toContain('Research team · CC-BY-4.0');
    expect(markup).not.toContain('rounded-card');
  });
});
