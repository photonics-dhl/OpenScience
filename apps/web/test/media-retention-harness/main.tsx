import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { PresentationWorkbench } from '@/components/presentation/PresentationWorkbench';
import type { PresentationAsset, HermesImageContext } from '@/lib/api';
import english from '../../messages/en.json';
import { StoryboardLifecycle } from './StoryboardLifecycle';
import { HermesFirstImageResult } from '@/components/hermes/HermesFirstImageResult';
import { applyFirstImageReady, type HermesAssistantDrawerProps } from '@/components/hermes/HermesAssistantDrawer';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

// Vite resolves this test-only query to the exact production Drawer plus its W emitter binding.
const SelectedGuideDrawer = React.lazy<React.ComponentType<HermesAssistantDrawerProps>>(() =>
  // @ts-expect-error The bounded Vite source query has no standalone TypeScript module declaration.
  import('../../components/hermes/HermesAssistantDrawer.tsx?selected-guide-W').then(module => ({ default: module.HermesAssistantDrawer })));
const guideIds = { a: 'a1000000-0000-4000-8000-000000000001', b: 'b1000000-0000-4000-8000-000000000001',
  c: 'c1000000-0000-4000-8000-000000000001', f: 'f1000000-0000-4000-8000-000000000001' };

const initial: PresentationAsset[] = ['a', 'b'].map((id) => ({
  id: `image-${id}`, researchObjectId: 'ro', versionId: 'published-version', kind: 'image', status: 'approved',
  contentHash: 'a'.repeat(64), generator: 'Hermes', generatorVersion: '1', label: `Image ${id.toUpperCase()}`,
  sourceClaimIds: [], canTransition: false, canApprove: false, canDelete: true,
  createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z',
}));

function Harness() {
  const [assets, setAssets] = React.useState(initial);
  const [imageContext, setImageContext] = React.useState<HermesImageContext>();
  const [epoch, setEpoch] = React.useState(0);
  const selectedMode = new URLSearchParams(window.location.search).has('selected-image');
  return <NextIntlClientProvider locale="en" messages={english}>
    {selectedMode && <div><button onClick={() => setAssets(current => [...current].reverse())}>Reverse images</button>
      <button onClick={() => setEpoch(value => value + 1)}>Refresh media section</button>
      <output data-hermes-image-snapshot>{JSON.stringify(imageContext ?? null)}</output></div>}
    <PresentationWorkbench key={epoch} researchObjectId="ro" assets={assets} claims={[]}
    imageContext={selectedMode ? imageContext : undefined}
    onImageContextChange={selectedMode ? next => setImageContext(previous => {
      const value = { ...next, actorId: 'fixture-viewer' }; return JSON.stringify(previous) === JSON.stringify(value) ? previous : value;
    }) : undefined}
    version={{ versionId: 'published-version', status: 'published', publicationNo: 4, createdAt: initial[0].createdAt }} canWrite={false} resultsOnly
    onCreateClaim={async () => false} onGenerate={() => {}} onTransition={() => { throw new Error('Frozen media cannot be approved again'); }}
    onAssetDeleted={(asset) => setAssets((current) => current.filter((item) => item.id !== asset.id))} /></NextIntlClientProvider>;
}

function SelectedGuideHarness() {
  const scope = { actorId: 'fixture-viewer', researchObjectId: 'ro', versionId: 'working-version' };
  const [assets, setAssets] = React.useState<PresentationAsset[]>(() => ['a', 'b', 'c'].map(key => ({ ...initial[0],
    id: guideIds[key as keyof typeof guideIds], versionId: scope.versionId, label: `Image ${key.toUpperCase()}` })));
  const [context, setContext] = React.useState<HermesImageContext>();
  const [ready, setReady] = React.useState(false);
  const [guideId, setGuideId] = React.useState('completed-guide-f');
  const [epoch, setEpoch] = React.useState(0);
  const acceptReady = (image: Parameters<typeof applyFirstImageReady>[1]) => setContext(previous => applyFirstImageReady(previous, image, scope));
  return <NextIntlClientProvider locale="en" messages={english}><SearchParamsContext.Provider value={new URLSearchParams('version=working-version')}>
    <button onClick={() => setReady(true)}>Observe completed image</button>
    <button onClick={() => setEpoch(value => value + 1)}>Restore same completed operation</button>
    <button onClick={() => { setGuideId(`other-completed-guide-${epoch + 1}`); setEpoch(value => value + 1); }}>Observe another completion</button>
    <button onClick={() => setAssets(current => current.some(asset => asset.id === guideIds.f) ? current : [...current,
      { ...initial[0], id: guideIds.f, versionId: scope.versionId, label: 'Image F', status: 'draft' }])}>Load completed image in gallery</button>
    <output data-hermes-image-snapshot>{JSON.stringify(context ?? null)}</output>
    {ready && <HermesFirstImageResult key={epoch} {...scope} guideTaskId={guideId} onImageReady={acceptReady} />}
    <PresentationWorkbench researchObjectId="ro" assets={assets} claims={[]} imageContext={context}
      onImageContextChange={next => setContext(previous => {
        const value = { ...next, actorId: scope.actorId }; return JSON.stringify(previous) === JSON.stringify(value) ? previous : value;
      })} version={{ versionId: scope.versionId, status: 'draft', createdAt: initial[0].createdAt }} canWrite resultsOnly
      onCreateClaim={async () => false} onGenerate={() => {}} onTransition={() => { throw new Error('No approval in the guide fixture'); }} />
    <React.Suspense fallback={<p>Loading actual Hermes conversation…</p>}><SelectedGuideDrawer embedded open onOpenChange={() => {}} locale="en"
      imageContext={context} onImageReady={acceptReady} route="research-object-edit" routeResearchObjectId="ro"
      dashboardContext={{ tasks: [], researchObjects: [{ id: 'ro', title: 'Image reference fixture', status: 'draft' }], presentation: { researchObjectId: 'ro', versionId: scope.versionId } }}
      suggestion={{ kind: 'continue-research', bodyKey: 'guide.continue.body', href: '/research-objects/ro/edit', researchObjectId: 'ro', titleKey: 'guide.continue.title' }} />
    </React.Suspense>
  </SearchParamsContext.Provider></NextIntlClientProvider>;
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(window.location.search).has('storyboards')
  ? <NextIntlClientProvider locale="en" messages={english}><StoryboardLifecycle /></NextIntlClientProvider>
  : new URLSearchParams(window.location.search).has('selected-guide-W') ? <SelectedGuideHarness /> : <Harness />);
