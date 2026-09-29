import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.stubGlobal('React', React);

import { PresentationResultGallery } from '../components/presentation/PresentationResultGallery';
import type { PresentationAsset } from '../lib/api';
import { arrangePresentationResults } from '../lib/presentation/result-gallery';

function image(id: string, day: number, overrides: Partial<PresentationAsset> = {}): PresentationAsset {
  return { id, researchObjectId: 'ro', versionId: 'v', kind: 'image', status: 'draft',
    contentHash: id.padEnd(64, 'a'), generator: 'Hermes', generatorVersion: '1', label: 'Same title',
    sourceClaimIds: ['claim'], canTransition: true, canApprove: true,
    sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 },
    createdAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`, updatedAt: '2026-09-29T00:00:00Z', ...overrides };
}

function plan(id = 'plan', baseAssetId?: string, sceneCount = 1): PresentationAsset {
  return image(id, 1, { kind: 'interactive_html', sceneImage: undefined, storyboard: {
    output: 'image', locale: 'en', style: 'auto', ...(baseAssetId ? { baseAssetId } : {}),
    document: { schemaVersion: 1, title: 'Plan', scenes: Array.from({ length: sceneCount }, (_, index) => ({
      title: `Scene ${index}`, narration: 'Scientific relation.', visualAction: 'Show relation.', sourceClaimIds: ['claim'],
    })) },
  } });
}

function gallery(assets: PresentationAsset[], plans = [plan()]) {
  return renderToStaticMarkup(<PresentationResultGallery researchObjectId="ro" versionId="v" assets={assets}
    allAssets={[...plans, ...assets]} canWrite working={false} onTransition={vi.fn()}
    renderReviewAction={(asset) => <button>{`recover-${asset.id}`}</button>} />);
}

it('leads with the newest usable image and keeps every other attempt and recovery in closed history', () => {
  const markup = gallery([image('old', 20), image('681ef614', 28), image('pending', 29, { canApprove: false })]);
  const [current, history] = markup.split('<details');
  expect(current).toContain('data-presentation-result="681ef614"');
  expect(current).not.toContain('data-presentation-result="pending"');
  expect(history).toContain('data-presentation-result="old"');
  expect(history).toContain('recover-pending');
  expect(history).not.toMatch(/^[^>]*\bopen=/);
  expect(markup.match(/data-media-asset-actions=/g)).toHaveLength(3);
  expect(current).toContain('object-contain');
  expect(current).not.toContain('max-h-[32rem]');
});

it('uses explicit single-scene revision links, never a shared title alone', () => {
  const old = image('old', 20);
  const latest = image('new', 28, { sceneImage: { storyboardAssetId: 'revision', sceneIndex: 0 } });
  const unrelated = image('other', 25, { sceneImage: { storyboardAssetId: 'unrelated', sceneIndex: 0 } });
  const markup = gallery([old, latest, unrelated], [plan(), plan('revision', 'plan'), plan('unrelated')]);
  expect(markup.split('<details')[0]).toContain('data-presentation-result="new"');
  expect(markup).toContain('data-presentation-current="other"');
  expect(markup).not.toContain('data-presentation-current="old"');
});

it('keeps distinct scenes, missing parents, different sources and branching revisions separate', () => {
  const assets = [image('scene0', 20), image('scene1', 21, { sceneImage: { storyboardAssetId: 'plan', sceneIndex: 1 } }),
    image('missing', 22, { sceneImage: { storyboardAssetId: 'missing-plan', sceneIndex: 0 } }),
    image('branch1', 23, { sceneImage: { storyboardAssetId: 'branch1-plan', sceneIndex: 0 } }),
    image('branch2', 24, { sceneImage: { storyboardAssetId: 'branch2-plan', sceneIndex: 0 } }),
    image('different-source', 25, { sourceClaimIds: ['other-claim'] })];
  const markup = gallery(assets, [plan('plan', undefined, 2), plan('branch1-plan', 'plan'), plan('branch2-plan', 'plan')]);
  for (const asset of assets) expect(markup).toContain(`data-presentation-current="${asset.id}"`);
  expect(markup).not.toContain('<details');
});

it('keeps single-scene sibling revisions separate and handles cyclic or incomplete ancestry conservatively', () => {
  for (const plans of [[plan(), plan('a', 'plan'), plan('b', 'plan')], [plan('a', 'b'), plan('b', 'a')], [plan('a', 'absent'), plan('b', 'absent')]]) {
    const assets = ['a', 'b'].map((id, index) => image(`image-${id}`, 20 + index, { sceneImage: { storyboardAssetId: id, sceneIndex: 0 } }));
    expect(gallery(assets, plans)).not.toContain('<details');
  }
});

it('uses chronology rather than API order or updatedAt and keeps approved results ahead of blocked attempts', () => {
  const approved = image('approved', 20, { status: 'approved', canApprove: false, canTransition: false });
  const blocked = image('blocked', 29, { canApprove: false });
  const old = image('old', 19, { updatedAt: '2026-09-30T00:00:00Z' });
  for (const assets of [[old, blocked, approved], [approved, blocked, old]]) {
    const result = arrangePresentationResults(assets, [plan(), ...assets]);
    expect(result.current.map(asset => asset.id)).toEqual(['approved']);
    expect(result.history.map(asset => asset.id)).toEqual(['blocked', 'old']);
  }
});

it('does not merge revisions across changed sources, scope or multi-scene reordering', () => {
  const base = plan();
  const old = image('old', 20);
  const latest = image('new', 28, { sceneImage: { storyboardAssetId: 'revision', sceneIndex: 0 } });
  for (const revision of [
    { ...plan('revision', 'plan'), sourceClaimIds: ['other'] },
    { ...plan('revision', 'plan'), versionId: 'other' },
    plan('revision', 'plan', 2),
  ]) {
    expect(arrangePresentationResults([old, latest], [base, revision, old, latest]).history).toEqual([]);
  }
});

it('preserves all unbound images and videos even with identical titles and source claims', () => {
  const assets = [image('upload1', 20, { sceneImage: undefined }), image('upload2', 21, { sceneImage: undefined }),
    image('video1', 22, { kind: 'video' }), image('video2', 23, { kind: 'video' })];
  const result = arrangePresentationResults(assets, [plan(), ...assets]);
  expect(result.current).toHaveLength(4);
  expect(result.history).toEqual([]);
});

it('maps only the explicit artSceneIndex across full multi-scene revisions, preserving the other scenes', () => {
  const base = plan('plan', undefined, 3);
  const revision = plan('revision', 'plan', 3);
  revision.storyboard!.artSceneIndex = 2;
  const images = [0, 1, 2].map(sceneIndex => image(`original-${sceneIndex}`, 20, { sceneImage: { storyboardAssetId: 'plan', sceneIndex } }));
  const next = image('new-scene-2', 28, { sceneImage: { storyboardAssetId: 'revision', sceneIndex: 2 } });
  const result = arrangePresentationResults([...images, next], [base, revision, ...images, next]);
  expect(result.current.map(asset => asset.id)).toEqual(['new-scene-2', 'original-0', 'original-1']);
  expect(result.history.map(asset => asset.id)).toEqual(['original-2']);
  // An unselected image on that plan does not inherit the selected scene's mapping.
  const other = image('new-scene-0', 29, { sceneImage: { storyboardAssetId: 'revision', sceneIndex: 0 } });
  expect(arrangePresentationResults([...images, next, other], [base, revision, ...images, next, other]).current.map(asset => asset.id))
    .toEqual(['new-scene-0', 'new-scene-2', 'original-0', 'original-1']);
});

it('separates competing same-scene revisions while allowing independent explicit scene branches', () => {
  const base = plan('plan', undefined, 3);
  const a = plan('a', 'plan', 3), b = plan('b', 'plan', 3);
  a.storyboard!.artSceneIndex = 2; b.storyboard!.artSceneIndex = 0;
  const assets = [image('old0', 20), image('old2', 20, { sceneImage: { storyboardAssetId: 'plan', sceneIndex: 2 } }),
    image('new2', 28, { sceneImage: { storyboardAssetId: 'a', sceneIndex: 2 } }),
    image('new0', 29, { sceneImage: { storyboardAssetId: 'b', sceneIndex: 0 } })];
  expect(arrangePresentationResults(assets, [base, a, b, ...assets]).history.map(asset => asset.id)).toEqual(['old0', 'old2']);
  b.storyboard!.artSceneIndex = 2;
  expect(arrangePresentationResults(assets, [base, a, b, ...assets]).history).toEqual([]);
});

it('offers the style integration once after the current image, only in writable views', () => {
  const assets = [image('old', 20), image('new', 28)];
  for (const canWrite of [true, false]) {
    const styles = vi.fn((asset: PresentationAsset) => <button>{`style-${asset.id}`}</button>);
    const markup = renderToStaticMarkup(<PresentationResultGallery researchObjectId="ro" versionId="v"
      assets={assets} allAssets={[plan(), ...assets]} canWrite={canWrite} working={false}
      onTransition={vi.fn()} renderStyleChoices={styles} />);
    expect(styles).toHaveBeenCalledTimes(canWrite ? 1 : 0);
    if (canWrite) {
      expect(markup.indexOf('style-new')).toBeGreaterThan(markup.indexOf('</figure>'));
      expect(markup.indexOf('style-new')).toBeLessThan(markup.indexOf('<details'));
      expect(markup).not.toContain('style-old');
    }
  }
});

it('shows the latest pending attempt when no image is usable, preserving rejection and read-only status', () => {
  const markup = gallery([image('rejected', 29, { status: 'rejected', canApprove: false }), image('pending', 28, { canApprove: false })]);
  expect(markup).toContain('data-presentation-current="pending"');
  expect(markup).toContain('rejectedMediaNote');
  expect(markup).not.toContain('>approve<');
});

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

it('keeps the approved scene narration beside its image for reader-focused review', () => {
  const scene = { title: 'Two components', narration: 'Near and far are two parts of one supported relationship.' };
  const parent = { id: 'plan', storyboard: { document: { scenes: [scene] } } };
  const image = { id: 'image', researchObjectId: 'ro', versionId: 'v', kind: 'image',
    status: 'draft', label: 'presentation_not_evidence', sceneImage: { storyboardAssetId: 'plan', sceneIndex: 0 } };
  const markup = renderToStaticMarkup(React.createElement(PresentationResultGallery, {
    researchObjectId: 'ro', versionId: 'v', assets: [image], allAssets: [parent, image], canWrite: false,
    working: false, onTransition: vi.fn(),
  } as never));
  expect(markup).toContain('Two components');
  expect(markup).toContain('<figcaption');
  expect(markup).toContain(scene.narration);
});
