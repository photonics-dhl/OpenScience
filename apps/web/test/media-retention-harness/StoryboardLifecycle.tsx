import * as React from 'react';
import { useState } from 'react';
import { PresentationWorkbench } from '@/components/presentation/PresentationWorkbench';
import type { PresentationAsset } from '@/lib/api';

function plan(id: string, day: string, count: number): PresentationAsset {
  return { id, researchObjectId: 'ro', versionId: 'v', kind: 'interactive_html', status: 'approved',
    contentHash: 'a'.repeat(64), generator: 'Hermes', generatorVersion: '1', label: id,
    sourceClaimIds: [`claim-${id}`], canTransition: true, canApprove: true, canGenerateSceneImage: true, canGenerateVideo: true,
    createdAt: `${day}T00:00:00Z`, updatedAt: `${day}T00:00:00Z`,
    storyboard: { output: 'image', locale: 'en', style: 'auto', narrative: true,
      document: { schemaVersion: 1, title: `Plan ${id}`, scenes: Array.from({ length: count }, (_, index) => ({
        title: `${id} scene ${index + 1}`, narration: `Explanation ${index + 1}`, visualAction: 'A source-bound relationship', sourceClaimIds: [`claim-${id}`],
      })) } } };
}
const old = plan('old', '2026-10-07', 3);
const current = plan('current', '2026-10-08', 4);
const newest = plan('newest', '2026-10-09', 1);
const images = [old, current].flatMap(parent => parent.storyboard!.document.scenes.flatMap((_, index) => [0, 1].map(choice => ({
  ...parent, id: `${parent.id}-${index}-${choice}`, kind: 'image' as const, storyboard: undefined,
  label: `${parent.id} ${index} option ${choice}`, sceneImage: { storyboardAssetId: parent.id, sceneIndex: index }, canTransition: false,
}))));

export function StoryboardLifecycle() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get('embedded') === 'true';
  const video = params.get('video') === 'true';
  const initial = video ? [old, ...images] : [old, current];
  const [assets, setAssets] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [imageRequest, setImageRequest] = useState('');
  const [videoRequest, setVideoRequest] = useState('');
  return <>
    <nav aria-label="Fixture controls">
      <button onClick={() => { setLoading(true); setAssets([]); }}>Begin refresh</button>
      <button onClick={() => { setAssets(initial); setLoading(false); }}>Finish refresh</button>
      <button onClick={() => setAssets(items => [...items, newest])}>Add newest</button>
      <button onClick={() => setAssets(items => items.filter(item => item.id !== newest.id))}>Remove newest</button>
      <button onClick={() => setAssets(items => items.map(item => item.id === newest.id ? { ...item, status: 'rejected' } : item))}>Reject newest</button>
      <button onClick={() => setAssets(items => [...items, current])}>Add current</button>
    </nav>
    <PresentationWorkbench researchObjectId="ro" assets={assets} claims={[]}
      version={{ versionId: 'v', status: 'draft', createdAt: current.createdAt }} canWrite resultsOnly={embedded} loading={loading}
      onCreateClaim={async () => false} onGenerate={() => {}} onTransition={() => {}}
      onGenerateSceneImage={(claimIds, request) => setImageRequest(JSON.stringify({ claimIds, request }))}
      onGenerateVideo={(claimIds, request) => setVideoRequest(JSON.stringify({ claimIds, request }))} />
    <output data-image-request>{imageRequest}</output>
    <output data-video-request>{videoRequest}</output>
  </>;
}
