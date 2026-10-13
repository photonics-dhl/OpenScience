import type { PresentationAsset } from '@/lib/api';

/** The saved model identifies the renderer, not why that model was selected. */
export function displayedSynclipImageModel(asset: PresentationAsset, canWrite: boolean): string | null {
  if (asset.kind !== 'image' || asset.generator !== 'OpenScience Hermes scene image / synclip'
    || (asset.status !== 'draft' && asset.status !== 'approved')
    || (!canWrite && asset.status !== 'approved')) return null;
  return asset.generatorVersion === 'gpt-image-2' || asset.generatorVersion === 'gpt-image-2.5'
    ? asset.generatorVersion : null;
}
