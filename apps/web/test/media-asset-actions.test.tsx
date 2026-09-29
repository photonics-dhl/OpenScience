import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PresentationAsset } from '../lib/api';
import { MediaAssetActions } from '../components/presentation/MediaAssetActions';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.stubGlobal('React', React);

const asset: PresentationAsset = {
  id: 'image', researchObjectId: 'ro', versionId: 'v', kind: 'image', status: 'draft',
  label: 'Scientific image', contentHash: 'a'.repeat(64), generator: 'Hermes', generatorVersion: '1',
  sourceClaimIds: ['claim'], canApprove: true, canTransition: true,
  createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z',
};

it.each([
  { overrides: {}, canWrite: true, status: 'readyToAdopt', approve: true, reject: true },
  { overrides: { canApprove: false }, canWrite: true, status: 'retainedDraft', approve: false, reject: true },
  { overrides: {}, canWrite: false, status: 'readyToAdopt', approve: false, reject: false },
  { overrides: { canTransition: false }, canWrite: true, status: 'readyToAdopt', approve: false, reject: false },
  { overrides: { status: 'approved' as const }, canWrite: true, status: 'retainedAsset', approve: false, reject: false },
  { overrides: { status: 'rejected' as const }, canWrite: true, status: 'retainedRejected', approve: false, reject: false },
])('shows truthful status without changing capabilities: %j', ({ overrides, canWrite, status, approve, reject }) => {
  const markup = renderToStaticMarkup(<MediaAssetActions asset={{ ...asset, ...overrides }} title={asset.label}
    canWrite={canWrite} working={false} showReject onTransition={vi.fn()} reviewAction={<button>Review recovery</button>} />);
  expect(markup).toContain(`>${status}<`);
  expect(markup.includes('>approve<')).toBe(approve);
  expect(markup.includes('>reject<')).toBe(reject);
  expect(markup).toContain('Review recovery');
});

it('disables both transition buttons while work is in flight', () => {
  const markup = renderToStaticMarkup(<MediaAssetActions asset={asset} title={asset.label}
    canWrite working showReject onTransition={vi.fn()} />);
  expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
});
