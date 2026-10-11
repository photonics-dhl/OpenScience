import type { HermesAudioAuditionPreset, PresentationAsset, PresentationClaim, PresentationVideoRequest, StoryboardRequest, VersionSummary } from '../api';
export type PresentationAction = 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
export function selectPresentationVersion(versions: VersionSummary[], requested?: string) {
  return (requested ? versions.find(v => v.versionId === requested) : versions.find(v => v.status === 'draft')) ?? null;
}
export function presentationSources(action: PresentationAction, selected: string[], parent?: PresentationAsset, sceneIndex = 0): string[] {
  if (action !== 'storyboard.create' && parent?.status !== 'draft' && parent?.status !== 'approved') return [];
  const ids = action === 'storyboard.create' ? [...new Set(selected)] : parent?.storyboard ? parent.sourceClaimIds : [];
  if (ids.length < 1 || ids.length > 12) return [];
  if (action === 'scene.image' && (!parent?.canGenerateSceneImage || !Number.isInteger(sceneIndex) || sceneIndex < 0 || !parent.storyboard?.document.scenes[sceneIndex])) return [];
  return ids;
}
export function validPresentationInstruction(value: string): boolean { return value.trim().length > 0 && value.length <= 1000; }
export function hasCurrentPresentationSources(ids: string[], claims: PresentationClaim[]): boolean {
  return ids.length > 0 && ids.every(id => claims.some(c => c.id === id && c.extractionStatus === 'succeeded'));
}
/** UI routing only; the server still validates the exact paper, version and reviewed source. */
export function hasSingleReviewedPaperSource(ids: string[], claims: PresentationClaim[]): boolean {
  if (!hasCurrentPresentationSources(ids, claims)) return false;
  const lineages = ids.map(id => {
    const provenance = claims.find(claim => claim.id === id)?.provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return undefined;
    const source = provenance as { source?: unknown; sourceTaskLineage?: unknown; sourceTaskId?: unknown };
    const lineage = source.sourceTaskLineage ?? (source.source === 'reviewed_ingestion' ? source.sourceTaskId : undefined);
    return typeof lineage === 'string' && lineage.trim() ? lineage : undefined;
  });
  return lineages.every(lineage => lineage !== undefined) && new Set(lineages).size === 1;
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
export function newestEligibleStoryboard(assets: PresentationAsset[], action: PresentationAction, audition = false): PresentationAsset | undefined {
  return assets
    .filter((asset) => Boolean(asset.storyboard) && (asset.status === 'approved' || (action !== 'storyboard.create' && asset.status === 'draft'))
      && (action !== 'scene.image' || asset.canGenerateSceneImage === true)
      && (action !== 'video.create' || (audition ? asset.canGenerateAudioAudition === true : asset.canGenerateVideo === true)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function presentationVideoFrameIds(parent: PresentationAsset | undefined, assets: PresentationAsset[]): string[] {
  if (!parent?.canGenerateVideo) return [];
  if (parent.videoFrameAssetIds !== undefined) return [...parent.videoFrameAssetIds];
  if (parent.storyboard?.narrative === true) return [];
  // Legacy manual generations predate the ordered projection. Keep their
  // existing adopted-frame path until the server also projects those parents.
  return parent.storyboard?.document.scenes.map((_, index) => assets.find(asset => asset.kind === 'image'
    && asset.status === 'approved' && asset.sceneImage?.storyboardAssetId === parent.id
    && asset.sceneImage.sceneIndex === index)?.id ?? '') ?? [];
}

export function presentationAudioAuditionRequest(parent: PresentationAsset | undefined, sceneIndex: number, audio: HermesAudioAuditionPreset | null): PresentationVideoRequest | null {
  const storyboard = parent?.storyboard;
  const scene = storyboard?.document.scenes[sceneIndex];
  const frames = parent?.canGenerateAudioAudition === true ? [...(parent.videoFrameAssetIds ?? [])] : [];
  if (parent?.status !== 'approved' || storyboard?.output !== 'video' || storyboard.narrative !== true
    || (storyboard.locale !== 'zh' && storyboard.locale !== 'en') || !Number.isInteger(sceneIndex) || sceneIndex < 0
    || !scene || typeof scene.narration !== 'string' || !scene.narration.trim() || Array.from(scene.narration).length > 120
    || frames.length < 3 || frames.length > 6 || frames.length !== storyboard.document.scenes.length || !frames.every(Boolean)
    || !audio || audio.provider !== 'synclip' || !audio.voice.trim() || !Number.isFinite(audio.speed) || audio.speed <= 0) return null;
  return { profile: 'content-driven-v1', storyboardAssetId: parent.id, sceneImageAssetIds: frames,
    purpose: 'audio-audition', sceneIndex, audio: { ...audio }, locale: storyboard.locale };
}

export function presentationStoryboardRequest(input: {
  action: 'storyboard.create' | 'storyboard.revise'; output: StoryboardRequest['output'];
  locale: StoryboardRequest['locale']; style: string; instruction: string;
  parent?: PresentationAsset; figurePlan?: StoryboardRequest['figurePlan'];
  revisionMode?: StoryboardRequest['revisionMode']; revisionSceneIndex?: number;
  singlePaperImage?: boolean;
}): StoryboardRequest {
  const base = input.action === 'storyboard.revise' ? input.parent : undefined;
  const output = base?.storyboard?.output ?? input.output;
  return { locale: input.locale, style: input.style, output, instruction: input.instruction,
    ...(input.singlePaperImage && input.action === 'storyboard.create' && output === 'image' && !input.figurePlan
      ? { narrative: true as const, narrativeSceneLimit: 1 } : {}),
    ...(input.figurePlan ? { figurePlan: input.figurePlan } : {}),
    ...(base ? { baseAssetId: base.id, ...(input.revisionMode ? { revisionMode: input.revisionMode } : {}) } : {}),
    ...(output === 'video' ? { narrative: true as const,
      ...(base && input.revisionSceneIndex !== undefined ? { revisionSceneIndex: input.revisionSceneIndex } : {}) } : {}),
  };
}
export function isEligibleArtStoryboard(asset: PresentationAsset | undefined, locale: StoryboardRequest['locale']): boolean {
  return Boolean(asset && (asset.status === 'approved' || asset.status === 'draft') && asset.kind === 'interactive_html'
    && asset.storyboard?.output === 'image' && asset.storyboard.locale === locale
    && asset.storyboard.document.scenes.length > 0
    && asset.storyboard.document.scenes.every((scene) => scene.illustration?.schemaVersion === 2 && !scene.paperOriginal));
}
export class SubmissionIntent {
  private signature = ''; private key = ''; private busy = false; private uncertain = false;
  draft?: { action: PresentationAction; instruction: string; style: string; language?: 'zh' | 'en'; selected: string[]; parentId: string; scene: number; updateBrief?: boolean; revisionMode?: 'art'; revisionSceneIndex?: number; figurePlan?: StoryboardRequest['figurePlan'] };
  request?: { action: PresentationAction; sourceIds: string[]; payload: StoryboardRequest | { storyboardAssetId: string; sceneIndex: number } | PresentationVideoRequest };
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
