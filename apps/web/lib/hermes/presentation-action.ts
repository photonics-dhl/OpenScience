import type { PresentationAsset, PresentationClaim, StoryboardRequest, VersionSummary } from '../api';
export type PresentationAction = 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
export function selectPresentationVersion(versions: VersionSummary[], requested?: string) {
  return (requested ? versions.find(v => v.versionId === requested) : versions.find(v => v.status === 'draft')) ?? null;
}
export function presentationSources(action: PresentationAction, selected: string[], parent?: PresentationAsset, sceneIndex = 0): string[] {
  if (action !== 'storyboard.create' && parent?.status !== 'draft' && parent?.status !== 'approved') return [];
  const ids = action === 'storyboard.create' ? [...new Set(selected)] : parent?.storyboard ? parent.sourceClaimIds : [];
  if (ids.length < 1 || ids.length > 12) return [];
  if (action === 'scene.image' && (!parent?.canGenerateSceneImage || parent.status !== 'approved' || !Number.isInteger(sceneIndex) || sceneIndex < 0 || !parent.storyboard?.document.scenes[sceneIndex])) return [];
  return ids;
}
export function validPresentationInstruction(value: string): boolean { return value.trim().length > 0 && value.length <= 1000; }
export function hasCurrentPresentationSources(ids: string[], claims: PresentationClaim[]): boolean {
  return ids.length > 0 && ids.every(id => claims.some(c => c.id === id && c.extractionStatus === 'succeeded'));
}
const SDF_FIELDS = new Set(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']);
function provenanceKey(claim: PresentationClaim): string {
  const provenance = claim.provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return claim.id;
  const value = provenance as { field?: unknown; provider?: unknown; source?: unknown; ingestionTaskId?: unknown };
  return typeof value.field === 'string' && SDF_FIELDS.has(value.field)
    && typeof value.ingestionTaskId === 'string'
    && ((value.source === 'deterministic' && value.provider === 'ingestion-source-match')
      || (value.source === 'human' && value.provider === 'ingestion-confirmation'))
    ? `ingestion-field:${value.field}` : claim.id;
}
/** Select only live sources; collapse canonical machine Claims by SDF field, never by text. */
export function selectEligiblePresentationClaims(claims: PresentationClaim[]): string[] {
  const seen = new Set<string>();
  return [...claims]
    .filter((claim) => claim.extractionStatus === 'succeeded')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .filter((claim) => {
      const key = provenanceKey(claim);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map((claim) => claim.id);
}
export function newestEligibleStoryboard(assets: PresentationAsset[], action: PresentationAction): PresentationAsset | undefined {
  return assets
    .filter((asset) => Boolean(asset.storyboard) && asset.status === 'approved'
      && (action !== 'scene.image' || asset.canGenerateSceneImage === true)
      && (action !== 'video.create' || asset.canGenerateVideo === true))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}
export class SubmissionIntent {
  private signature = ''; private key = ''; private busy = false; private uncertain = false;
  draft?: { action: PresentationAction; instruction: string; style: 'watercolor' | 'technical' | 'ink'; language?: 'zh' | 'en'; selected: string[]; parentId: string; scene: number; updateBrief?: boolean };
  request?: { action: PresentationAction; sourceIds: string[]; payload: StoryboardRequest | { storyboardAssetId: string; sceneIndex: number } | { profile: 'content-driven-v1'; storyboardAssetId: string; sceneImageAssetIds: string[] } };
  get isUncertain() { return this.uncertain; }
  get isBusy() { return this.busy; }
  begin(signature: string): string | null {
    if (this.busy || (this.uncertain && signature !== this.signature)) return null;
    if (signature !== this.signature || !this.key) { this.signature = signature; this.key = crypto.randomUUID(); }
    this.busy = true; return this.key;
  }
  complete() { this.busy = false; this.uncertain = false; }
  fail(ambiguous: boolean) { this.busy = false; this.uncertain = ambiguous; }
}
