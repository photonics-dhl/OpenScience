import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { PresentationWorkbench } from '@/components/presentation/PresentationWorkbench';
import type { PresentationAsset } from '@/lib/api';
import english from '../../messages/en.json';
import { StoryboardLifecycle } from './StoryboardLifecycle';

const initial: PresentationAsset[] = ['a', 'b'].map((id) => ({
  id: `image-${id}`, researchObjectId: 'ro', versionId: 'published-version', kind: 'image', status: 'approved',
  contentHash: 'a'.repeat(64), generator: 'Hermes', generatorVersion: '1', label: `Image ${id.toUpperCase()}`,
  sourceClaimIds: [], canTransition: false, canApprove: false, canDelete: true,
  createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z',
}));

function Harness() {
  const [assets, setAssets] = React.useState(initial);
  return <NextIntlClientProvider locale="en" messages={english}><PresentationWorkbench researchObjectId="ro" assets={assets} claims={[]}
    version={{ versionId: 'published-version', status: 'published', publicationNo: 4, createdAt: initial[0].createdAt }} canWrite={false} resultsOnly
    onCreateClaim={async () => false} onGenerate={() => {}} onTransition={() => { throw new Error('Frozen media cannot be approved again'); }}
    onAssetDeleted={(asset) => setAssets((current) => current.filter((item) => item.id !== asset.id))} /></NextIntlClientProvider>;
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(window.location.search).has('storyboards')
  ? <NextIntlClientProvider locale="en" messages={english}><StoryboardLifecycle /></NextIntlClientProvider> : <Harness />);
