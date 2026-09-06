import type { PresentationAsset, PresentationClaim, VersionSummary } from '../api';
export type PresentationAction = 'storyboard.create' | 'storyboard.revise' | 'scene.image';
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
export class SubmissionIntent {
  private signature = ''; private key = ''; private busy = false; private uncertain = false;
  draft?: { action: PresentationAction; instruction: string; style: 'watercolor' | 'technical' | 'ink'; language?: 'zh' | 'en'; selected: string[]; parentId: string; scene: number };
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
