import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { AgentTaskView, PresentationAsset } from '../lib/api';
import { canRequestExistingImageReview, ExistingSceneImageReview } from '../components/presentation/ExistingSceneImageReview';
import { PresentationWorkbench } from '../components/presentation/PresentationWorkbench';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
vi.stubGlobal('React', React);
const asset: PresentationAsset = {
  id: 'png', researchObjectId: 'ro', versionId: 'v', kind: 'image', status: 'draft', contentHash: 'a'.repeat(64),
  sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 }, canTransition: true, canApprove: false,
  generator: 'Hermes', generatorVersion: '1', label: 'Image', sourceClaimIds: [], createdAt: '', updatedAt: '',
};
const task: AgentTaskView = { id: 'png', sessionId: 's', kind: 'presentation.generate', status: 'failed', progress: 80,
  retryCount: 0, executionAttempt: 1, canRetry: false, result: null,
  error: '[blocked] Generated image review exceeds the source input budget (62621 > 61440 characters)', createdAt: '', updatedAt: '' };

it('uses the saved-PNG candidate without changing the ordinary task retry capability', () => {
  expect(canRequestExistingImageReview(asset, task)).toBe(true);
  expect(task.canRetry).toBe(false);
  expect(canRequestExistingImageReview(asset, { ...task, status: 'succeeded', error: null })).toBe(true);
  expect(canRequestExistingImageReview(asset, { ...task, error: 'scientific review provider failed' })).toBe(true);
});

it.each([
  { status: 'running' }, { status: 'pending' }, { kind: 'other' }, { id: 'foreign' }, { retryCount: 1 }, { executionAttempt: 2 },
  { result: {} }, { error: 'provider timeout; submission unknown' },
  { error: '[blocked] Generated image review exceeds the source input budget (1 > 2 characters)' },
  { error: '[blocked] Generated image review exceeds the source input budget\n' },
  { error: '[blocked] Generated image review exceeds the source input budget extra' },
  { result: { imageReview: { decision: 'blocked' } }, status: 'succeeded' },
  { result: { imageReview: { decision: 'accepted' } }, status: 'succeeded' },
] as Partial<AgentTaskView>[])('does not turn other task states into review recovery: %j', change => {
  expect(canRequestExistingImageReview(asset, { ...task, ...change })).toBe(false);
});

it.each([{ kind: 'video' }, { status: 'approved' }, { status: 'rejected' }, { sceneImage: undefined },
  { canTransition: false }, { canApprove: true }, { contentHash: '' }] as Partial<PresentationAsset>[])('hides ineligible assets: %j', change => {
  expect(canRequestExistingImageReview({ ...asset, ...change }, task)).toBe(false);
});

it('hides both the original and a same-byte copy, including a blocked or rejected copy', () => {
  const copy = { ...asset, id: 'review-copy', status: 'rejected' as const };
  expect(canRequestExistingImageReview(asset, task, [asset, copy])).toBe(false);
  expect(canRequestExistingImageReview({ ...copy, status: 'draft' }, { ...task, id: copy.id }, [asset, copy])).toBe(false);
  expect(canRequestExistingImageReview(asset, task, [asset, { ...copy, versionId: 'other' }])).toBe(true);
});

it('reports system rejection without offering review recovery or claiming a user decision', () => {
  const markup = renderToStaticMarkup(<ExistingSceneImageReview asset={asset} task={{ ...task, status: 'succeeded', result: { imageReview: { decision: 'blocked' } } }} disabled={false} onReview={vi.fn()} />);
  expect(markup).toContain('blocked');
  expect(markup).not.toContain('<button');
});

it.each([false, true])('keeps the recovery action beside its image in resultsOnly=%s', resultsOnly => {
  const markup = renderToStaticMarkup(<PresentationWorkbench researchObjectId="ro" assets={[asset]} claims={[]}
    version={{ versionId: 'v', status: 'draft', createdAt: '' }} canWrite resultsOnly={resultsOnly}
    onCreateClaim={vi.fn()} onGenerate={vi.fn()} onTransition={vi.fn()}
    renderReviewAction={image => <ExistingSceneImageReview asset={image} task={task} disabled={false} onReview={vi.fn()} />} />);
  expect(markup).toContain('data-media-asset-actions="png"');
  expect(markup).toContain('data-existing-image-review="png"');
  expect(markup).toContain('>action<');
});
