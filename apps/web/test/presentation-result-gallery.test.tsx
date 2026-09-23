import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.stubGlobal('React', React);

import { PresentationResultGallery } from '../components/presentation/PresentationResultGallery';

it('keeps Reject available while hiding Approve for a draft without accepted pixel review', () => {
  const assets = [{ id: 'scene', researchObjectId: 'ro', versionId: 'v', kind: 'image' as const,
    contentHash: 'a'.repeat(64), generator: 'OpenScience Hermes scene image / chatgpt-web', generatorVersion: 'v1',
    status: 'draft' as const, label: 'presentation_not_evidence', sourceClaimIds: [],
    canTransition: true, canApprove: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }];
  const markup = renderToStaticMarkup(React.createElement(PresentationResultGallery, {
    researchObjectId: 'ro', versionId: 'v', assets, allAssets: assets, canWrite: true,
    working: false, onTransition: vi.fn(),
  }));
  expect(markup).toContain('reject');
  expect(markup).not.toContain('approve');
});
