import { generatePresentationStoryboard, generatePresentationSceneImage, getPresentationTask, listPresentationAssets,
  transitionPresentationAsset, getCurrentUser, type PresentationAsset, type StoryboardRequest, type StoryboardDocument } from '@/lib/api';
import { SubmissionIntent, isEligibleArtStoryboard } from '@/lib/hermes/presentation-action';

export interface StyleSwitchScope { actorId: string; researchObjectId: string; versionId: string; baseAssetId: string }
export interface StyleSwitchOperation {
  scope: StyleSwitchScope;
  base: PresentationAsset;
  request: StoryboardRequest;
  planKey: string;
  imageKey: string;
  planTaskId?: string;
  imageTaskId?: string;
  phase: 'plan' | 'review' | 'approve' | 'image' | 'done';
  paused: boolean;
}
const records = new Map<string, SubmissionIntent>();
export const styleSwitchStorageKey = (s: StyleSwitchScope) => `openscience:illustration-style:${JSON.stringify([s.actorId, s.researchObjectId, s.versionId, s.baseAssetId])}`;
const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(k => Object.hasOwn(right, k) && same(left[k], right[k]));
};
export function illustrationScience(document: StoryboardDocument) {
  return { ...document, scenes: document.scenes.map(({ visualAction: _visual, styleRecommendations: _recommendations, illustration, ...scene }) => {
    void [_visual, _recommendations];
    if (!illustration) return scene;
    const { composition: _composition, treatment: _treatment, ...science } = illustration;
    void [_composition, _treatment];
    return { ...scene, illustration: science };
  }) };
}
export function canSwitchIllustrationStyle(asset: PresentationAsset, sceneIndex: number) {
  return sceneIndex === 0 && asset.storyboard?.document.scenes.length === 1
    && isEligibleArtStoryboard(asset, asset.storyboard.locale) && asset.sourceClaimIds.length > 0;
}
export function createStyleSwitch(scope: StyleSwitchScope, base: PresentationAsset, style: string): StyleSwitchOperation {
  const metadata = base.storyboard?.document.scenes[0]?.styleRecommendations;
  if (!canSwitchIllustrationStyle(base, 0) || base.id !== scope.baseAssetId || base.researchObjectId !== scope.researchObjectId
    || base.versionId !== scope.versionId || !metadata?.choices.some(c => c.styleId === style) || metadata.selectedStyleId === style)
    throw new Error('styleScopeChanged');
  const request: StoryboardRequest = { locale: base.storyboard!.locale, style, output: 'image', baseAssetId: base.id,
    revisionMode: 'art', ...(base.storyboard!.narrative ? { narrative: true } : {}),
    instruction: base.storyboard!.locale === 'zh'
      ? `换用 ${style} 的艺术风格并生成新图。仅调整构图与材质，保持全部科学字段、标签与来源不变。`
      : `Use ${style} and generate a new image. Change composition and treatment only; preserve all scientific fields, labels and sources.` };
  return { scope: { ...scope }, base: structuredClone(base), request, planKey: crypto.randomUUID(), imageKey: crypto.randomUUID(), phase: 'plan', paused: false };
}
export function saveStyleSwitch(storage: Storage, operation: StyleSwitchOperation) {
  const key = styleSwitchStorageKey(operation.scope), text = JSON.stringify(operation);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text) throw new Error('styleStorageError');
}
export function loadStyleSwitch(storage: Storage, scope: StyleSwitchScope): StyleSwitchOperation | undefined {
  const raw = storage.getItem(styleSwitchStorageKey(scope));
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as StyleSwitchOperation;
    const expected = createStyleSwitch(scope, value.base, value.request.style);
    if (!same(value.scope, scope) || !same(value.request, expected.request)
      || !['plan', 'review', 'approve', 'image', 'done'].includes(value.phase)
      || typeof value.paused !== 'boolean'
      || ![value.planKey, value.imageKey].every(k => typeof k === 'string' && /^[0-9a-f-]{36}$/iu.test(k))
      || [value.planTaskId, value.imageTaskId].some(id => id !== undefined && (typeof id !== 'string' || !id))
      || (value.phase !== 'plan' && !value.planTaskId) || (value.phase === 'done' && !value.imageTaskId)) throw new Error();
    return value;
  } catch { throw new Error('styleStorageError'); }
}

/** One explicitly authorized operation. Reloads and ambiguous writes need explicit resume. */
export async function advanceStyleSwitch(operation: StyleSwitchOperation, storage: Storage, isCurrent: () => boolean,
  options: { resume?: boolean; signal?: AbortSignal } = {}): Promise<'waiting' | 'done' | 'paused' | 'busy'> {
  if (operation.paused && !options.resume) return 'paused';
  const key = styleSwitchStorageKey(operation.scope);
  const record = records.get(key) ?? new SubmissionIntent(); records.set(key, record);
  if (!record.begin(operation.planKey)) return 'busy';
  const { actorId, researchObjectId: ro, versionId: version } = operation.scope;
  const assertCurrent = () => { if (!isCurrent() || options.signal?.aborted) throw new Error('styleScopeChanged'); };
  const identity = async () => {
    assertCurrent(); const viewer = await getCurrentUser({ fresh: true }); assertCurrent();
    if (viewer.userId !== actorId) throw new Error('styleScopeChanged');
    // Existing standalone scene-image API has no ordinary-user generation grant.
    if (viewer.platformRole !== 'platform_admin') throw new Error('stylePermissionRequired');
  };
  const save = () => { assertCurrent(); saveStyleSwitch(storage, operation); };
  const assets = async () => { await identity(); const result = await listPresentationAssets(ro, version, options.signal); assertCurrent(); return result.assets; };
  const checkBase = (all: PresentationAsset[]) => {
    const base = all.find(a => a.id === operation.scope.baseAssetId);
    if (!base || !canSwitchIllustrationStyle(base, 0) || base.researchObjectId !== ro || base.versionId !== version
      || base.contentHash !== operation.base.contentHash || !same(base.sourceClaimIds, operation.base.sourceClaimIds)
      || !same(illustrationScience(base.storyboard!.document), illustrationScience(operation.base.storyboard!.document))) throw new Error('styleScopeChanged');
  };
  try {
    await identity(); operation.paused = false;
    if (operation.phase === 'done') { record.complete(); return 'done'; }
    if (operation.phase === 'plan') {
      checkBase(await assets());
      // Persist before POST: a lost response is replayed only with this exact key/payload.
      operation.paused = true; save(); await identity();
      const result = await generatePresentationStoryboard(ro, version, operation.base.sourceClaimIds, operation.request, operation.planKey, options.signal);
      assertCurrent(); operation.planTaskId = result.task.id; operation.phase = 'review'; operation.paused = false; save();
      record.complete(); return 'waiting';
    }
    const { task } = await getPresentationTask(ro, version, operation.planTaskId!, options.signal); assertCurrent();
    if (task.id !== operation.planTaskId || task.kind !== 'presentation.generate' || (task.researchObjectId && task.researchObjectId !== ro)) throw new Error('styleScopeChanged');
    if (task.status === 'failed') throw new Error('styleReviewBlocked');
    if (task.status !== 'succeeded') { save(); record.complete(); return 'waiting'; }
    const all = await assets(); checkBase(all);
    const plan = all.find(a => a.id === task.result?.assetId);
    if (!plan || plan.id !== task.id || plan.researchObjectId !== ro || plan.versionId !== version || plan.kind !== 'interactive_html'
      || plan.contentHash !== task.result?.contentHash || !same(plan.sourceClaimIds, operation.base.sourceClaimIds)
      || !same(task.result?.sourceClaimIds, operation.base.sourceClaimIds) || plan.storyboard?.baseAssetId !== operation.scope.baseAssetId
      || plan.storyboard.style !== operation.request.style || plan.storyboard.locale !== operation.request.locale
      || !same(illustrationScience(plan.storyboard.document), illustrationScience(operation.base.storyboard!.document))) throw new Error('styleScopeChanged');
    if (plan.storyboard.scientificReview !== 'accepted') throw new Error('styleReviewBlocked');
    if (plan.status === 'draft') {
      if (operation.phase === 'image' || !plan.canApprove) throw new Error('styleReviewBlocked');
      operation.phase = 'approve'; operation.paused = true; save(); await identity();
      await transitionPresentationAsset(ro, version, plan.id, 'approved', plan.updatedAt, options.signal);
      assertCurrent();
    } else if (plan.status !== 'approved') throw new Error('styleReviewBlocked');
    // Always re-read after approval, including a previous PATCH whose response was lost.
    const refreshed = await assets(); checkBase(refreshed);
    const approved = refreshed.find(a => a.id === plan.id);
    if (!approved || approved.status !== 'approved' || approved.contentHash !== plan.contentHash
      || !same(approved.storyboard, plan.storyboard) || !same(approved.sourceClaimIds, plan.sourceClaimIds)) throw new Error('styleScopeChanged');
    // A previous image POST may have completed and been approved while its response
    // was lost. Recover that exact saved task before the server's new-spend guard.
    if (operation.phase === 'image') {
      const children = refreshed.filter(asset => asset.kind === 'image'
        && asset.sceneImage?.storyboardAssetId === plan.id && asset.sceneImage.sceneIndex === 0);
      if (children.length > 1) throw new Error('styleScopeChanged');
      const child = children[0];
      if (child) {
        if (child.researchObjectId !== ro || child.versionId !== version
          || !same(child.sceneImage, { storyboardAssetId: plan.id, sceneIndex: 0 })
          || !same(child.sourceClaimIds, approved.sourceClaimIds)) throw new Error('styleScopeChanged');
        const { task: savedTask } = await getPresentationTask(ro, version, child.id, options.signal); assertCurrent();
        if (savedTask.id !== child.id || savedTask.kind !== 'presentation.generate' || savedTask.status !== 'succeeded'
          || (savedTask.researchObjectId && savedTask.researchObjectId !== ro)
          || savedTask.result?.assetId !== child.id || savedTask.result?.contentHash !== child.contentHash
          || !same(savedTask.result?.sourceClaimIds, child.sourceClaimIds)) throw new Error('styleScopeChanged');
        operation.imageTaskId = child.id; operation.phase = 'done'; operation.paused = false; save();
        record.complete(); return 'done';
      }
    }
    if (!approved.canGenerateSceneImage) throw new Error('styleScopeChanged');
    operation.phase = 'image'; operation.paused = true; save(); await identity();
    const image = await generatePresentationSceneImage(ro, version, operation.base.sourceClaimIds,
      { storyboardAssetId: plan.id, sceneIndex: 0 }, operation.imageKey, options.signal);
    assertCurrent(); operation.imageTaskId = image.task.id; operation.phase = 'done'; operation.paused = false; save();
    record.complete(); return 'done';
  } catch (error) {
    operation.paused = true;
    // Preserve the already saved submitting state even if scope changed or storage failed.
    if (isCurrent()) { try { saveStyleSwitch(storage, operation); } catch { /* previous persisted intent remains */ } }
    record.fail(true); throw error;
  }
}
