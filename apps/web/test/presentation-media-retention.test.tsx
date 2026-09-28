import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PresentationAsset } from '../lib/api';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
vi.stubGlobal('React', React);

import { PresentationWorkbench } from '../components/presentation/PresentationWorkbench';
import { ResearchMediaDeck } from '../components/presentation/ResearchMediaDeck';

const asset: PresentationAsset = {
  id: 'image', researchObjectId: 'ro', versionId: 'version', kind: 'image', status: 'draft',
  contentHash: 'a'.repeat(64), generator: 'Hermes', generatorVersion: '1', label: 'Two components',
  sourceClaimIds: [], canTransition: true, canApprove: true, canDelete: true,
  createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z',
};

function render(overrides: Partial<PresentationAsset> = {}, canWrite = true) {
  return renderToStaticMarkup(<PresentationWorkbench researchObjectId="ro" assets={[{ ...asset, ...overrides }]} claims={[]}
    version={{ versionId: 'version', status: 'draft', createdAt: asset.createdAt }} canWrite={canWrite} resultsOnly
    onCreateClaim={vi.fn()} onGenerate={vi.fn()} onTransition={vi.fn()} onAssetDeleted={vi.fn()} />);
}

it('offers retention and reversible deletion beside the active private image', () => {
  const markup = render();
  expect(markup).toContain('>keep<');
  expect(markup).toContain('>approve<');
  expect(markup).toContain('delete');
  expect(markup).toContain('deleteBody');
});

it('does not turn retention into approval for an image without an accepted review', () => {
  const markup = render({ canApprove: false });
  expect(markup).not.toContain('>approve<');
  expect(markup).toContain('retainedDraft');
  expect(markup).toContain('delete');
});

it('does not offer deletion without the server ownership capability', () => {
  expect(render({ canDelete: false })).not.toContain('<dialog');
  expect(render({ canDelete: false, canApprove: false, canTransition: false }, false)).not.toContain('>approve<');
});

it('lets an owner clean their private list of published media without reopening approval', () => {
  const markup = render({ status: 'approved', canDelete: true, canApprove: false, canTransition: false }, false);
  expect(markup).toContain('delete');
  expect(markup).toContain('retainedAsset');
  expect(markup).not.toContain('>approve<');
});

it('keeps public media decks free of private retention controls', () => {
  const markup = renderToStaticMarkup(<ResearchMediaDeck title="Media" slides={[{ id: asset.id, kind: 'image', url: '/image', label: asset.label }]}
    emptyTitle="Empty" emptyBody="Empty" previousLabel="Previous" nextLabel="Next" positionLabel={(current, total) => `${current}/${total}`}
    emptyKind="image" openImageLabel="Open" />);
  expect(markup).not.toContain('retainedAsset');
  expect(markup).not.toContain('<button');
});
