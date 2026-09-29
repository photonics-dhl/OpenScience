import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { advanceStyleSwitch, createStyleSwitch, loadStyleSwitch, saveStyleSwitch, canSwitchIllustrationStyle } from '../lib/presentation/illustration-style-switch';
import type { PresentationAsset } from '../lib/api';
vi.mock('../lib/api', () => ({ generatePresentationStoryboard: vi.fn(), generatePresentationSceneImage: vi.fn(), getPresentationTask: vi.fn(), listPresentationAssets: vi.fn(), transitionPresentationAsset: vi.fn(), getCurrentUser: vi.fn() }));
let count = 0;
function fixture() {
  const actorId = `actor-${++count}`;
  const base = { id: 'base', researchObjectId: 'ro', versionId: 'v', kind: 'interactive_html', status: 'approved', contentHash: 'base-hash', sourceClaimIds: ['claim'], updatedAt: 'original', storyboard: { output: 'image', locale: 'en', style: 'auto', document: { schemaVersion: 1, title: 'Relation', scenes: [{ title: 'Scene', narration: 'Sourced relation', sourceClaimIds: ['claim'], visualAction: 'Old art', illustration: { schemaVersion: 2, message: 'Relation', domain: 'conceptual', subjects: [{ description: 'Source', basis: { claimId: 'claim', evidenceId: 'evidence', quote: 'Source' } }], encoding: 'subject 0', labels: ['Label'], constraints: ['Condition'], composition: 'Old layout', treatment: 'Old ink' }, styleRecommendations: { selectedStyleId: 'article:watercolor', choices: [{ styleId: 'article:watercolor', name: 'Watercolor', reason: 'Soft' }, { styleId: 'infographic:technical-schematic', name: 'Schematic', reason: 'Precise' }] } }] } } } as PresentationAsset;
  const op = createStyleSwitch({ actorId, researchObjectId: 'ro', versionId: 'v', baseAssetId: base.id }, base, 'infographic:technical-schematic');
  const plan = structuredClone(base); plan.id = 'plan'; plan.status = 'draft'; plan.contentHash = 'new-hash'; plan.updatedAt = 'new'; plan.canApprove = true;
  plan.storyboard = { ...plan.storyboard!, baseAssetId: base.id, style: op.request.style, scientificReview: 'accepted' };
  plan.storyboard.document.scenes[0]!.illustration!.composition = 'New layout';
  const data = new Map<string, string>(); const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } as Storage;
  const task = { id: 'plan', researchObjectId: 'ro', kind: 'presentation.generate', status: 'succeeded', result: { assetId: 'plan', contentHash: plan.contentHash, sourceClaimIds: ['claim'] } } as api.AgentTaskView;
  vi.mocked(api.getCurrentUser).mockResolvedValue({ userId: actorId, platformRole: 'platform_admin' } as api.CurrentUser);
  vi.mocked(api.listPresentationAssets).mockImplementation(async () => ({ assets: [structuredClone(base), structuredClone(plan)] }));
  vi.mocked(api.generatePresentationStoryboard).mockResolvedValue({ task });
  vi.mocked(api.getPresentationTask).mockResolvedValue({ task });
  vi.mocked(api.transitionPresentationAsset).mockImplementation(async () => { plan.status = 'approved'; plan.canGenerateSceneImage = true; return { asset: plan }; });
  vi.mocked(api.generatePresentationSceneImage).mockResolvedValue({ task: { ...task, id: 'image', status: 'pending', result: null } });
  const advance = (resume = false) => advanceStyleSwitch(op, storage, () => true, { resume });
  return { op, base, plan, task, storage, advance };
}
beforeEach(() => vi.resetAllMocks());
describe('scoped art revision and private image operation', () => {
  it('sends exact art-only payload then CAS approves only the plan and posts fixed scene/key', async () => {
    const { op, advance } = fixture();
    expect(await advance()).toBe('waiting'); expect(await advance()).toBe('done');
    expect(api.generatePresentationStoryboard).toHaveBeenCalledWith('ro', 'v', ['claim'], expect.objectContaining({ baseAssetId: 'base', revisionMode: 'art', style: 'infographic:technical-schematic', locale: 'en', output: 'image' }), op.planKey, undefined);
    expect(api.transitionPresentationAsset).toHaveBeenCalledWith('ro', 'v', 'plan', 'approved', 'new', undefined);
    expect(api.generatePresentationSceneImage).toHaveBeenCalledWith('ro', 'v', ['claim'], { storyboardAssetId: 'plan', sceneIndex: 0 }, op.imageKey, undefined);
    expect(await advance()).toBe('done'); expect(api.generatePresentationSceneImage).toHaveBeenCalledTimes(1);
    expect(api.transitionPresentationAsset).toHaveBeenCalledTimes(1);
  });
  it.each(['plan', 'approve', 'image'] as const)('pauses a lost %s response and resumes with original key or reconciled approval', async stage => {
    const { op, plan, advance, storage } = fixture();
    if (stage !== 'plan') await advance();
    if (stage === 'plan') vi.mocked(api.generatePresentationStoryboard).mockRejectedValueOnce(new Error('network'));
    if (stage === 'approve') vi.mocked(api.transitionPresentationAsset).mockImplementationOnce(async () => { plan.status = 'approved'; plan.canGenerateSceneImage = true; throw new Error('network'); });
    if (stage === 'image') vi.mocked(api.generatePresentationSceneImage).mockRejectedValueOnce(new Error('network'));
    await expect(advance()).rejects.toThrow('network');
    const writes = vi.mocked(api.generatePresentationStoryboard).mock.calls.length + vi.mocked(api.transitionPresentationAsset).mock.calls.length + vi.mocked(api.generatePresentationSceneImage).mock.calls.length;
    expect(await advance()).toBe('paused');
    expect(vi.mocked(api.generatePresentationStoryboard).mock.calls.length + vi.mocked(api.transitionPresentationAsset).mock.calls.length + vi.mocked(api.generatePresentationSceneImage).mock.calls.length).toBe(writes);
    const stored = loadStyleSwitch(storage, op.scope)!;
    expect(stored.planKey).toBe(op.planKey); expect(stored.imageKey).toBe(op.imageKey);
    await advance(true); if (stage === 'plan') await advance();
    expect(op.phase).toBe('done');
    expect(new Set(vi.mocked(api.generatePresentationStoryboard).mock.calls.map(c => c[4])).size).toBe(1);
    expect(new Set(vi.mocked(api.generatePresentationSceneImage).mock.calls.map(c => c[4])).size).toBe(1);
    expect(api.transitionPresentationAsset).toHaveBeenCalledTimes(1);
  });
  it('locks double clicks while the first call awaits identity', async () => {
    const { advance } = fixture(); const first = advance();
    expect(await advance()).toBe('busy'); await first;
    expect(api.generatePresentationStoryboard).toHaveBeenCalledTimes(1);
  });
  it.each(['unique', 'multiple', 'wrong-result'] as const)('reconciles a lost image response after approval without another paid POST: %s', async mode => {
    const { op, base, plan, task, advance } = fixture(); await advance();
    vi.mocked(api.generatePresentationSceneImage).mockRejectedValueOnce(new Error('network'));
    await expect(advance()).rejects.toThrow('network');
    plan.canGenerateSceneImage = false;
    const image = { ...base, id: 'saved-image', kind: 'image', status: 'approved', contentHash: 'saved-png', storyboard: undefined,
      sceneImage: { storyboardAssetId: plan.id, sceneIndex: 0 } } as PresentationAsset;
    vi.mocked(api.listPresentationAssets).mockResolvedValue({ assets: [base, plan, image,
      ...(mode === 'multiple' ? [{ ...image, id: 'other-image' }] : [])] });
    vi.mocked(api.getPresentationTask).mockImplementation(async (_ro, _version, id) => ({ task: id === task.id ? task : {
      ...task, id: image.id, result: { assetId: image.id, contentHash: mode === 'wrong-result' ? 'wrong' : image.contentHash, sourceClaimIds: image.sourceClaimIds },
    } }));
    if (mode === 'unique') {
      expect(await advance(true)).toBe('done'); expect(op.imageTaskId).toBe(image.id);
    } else await expect(advance(true)).rejects.toThrow('styleScopeChanged');
    expect(api.generatePresentationSceneImage).toHaveBeenCalledTimes(1);
    expect(api.transitionPresentationAsset).toHaveBeenCalledTimes(1);
  });
  it.each(['blocked', 'revised', undefined] as const)('does not approve/render a plan without accepted formal review (%s)', async decision => {
    const { plan, advance } = fixture(); await advance(); plan.storyboard!.scientificReview = decision;
    await expect(advance()).rejects.toThrow('styleReviewBlocked');
    expect(api.transitionPresentationAsset).not.toHaveBeenCalled(); expect(api.generatePresentationSceneImage).not.toHaveBeenCalled();
  });
  it('does not continue a failed task, changed science, or missing approval capability', async () => {
    for (const mode of ['failed', 'science', 'approval']) {
      const { task, plan, advance } = fixture(); await advance();
      if (mode === 'failed') task.status = 'failed';
      if (mode === 'science') plan.storyboard!.document.scenes[0]!.illustration!.labels = ['Invented'];
      if (mode === 'approval') plan.canApprove = false;
      await expect(advance()).rejects.toThrow();
    }
    expect(api.transitionPresentationAsset).not.toHaveBeenCalled(); expect(api.generatePresentationSceneImage).not.toHaveBeenCalled();
  });
  it('fresh actor mismatch and permission loss stop before a write', async () => {
    const { advance } = fixture();
    vi.mocked(api.getCurrentUser).mockResolvedValue({ userId: 'other', platformRole: 'platform_admin' } as api.CurrentUser);
    await expect(advance()).rejects.toThrow('styleScopeChanged'); expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
    const next = fixture(); vi.mocked(api.getCurrentUser).mockResolvedValue({ userId: next.op.scope.actorId, platformRole: 'user' } as api.CurrentUser);
    await expect(next.advance()).rejects.toThrow('stylePermissionRequired'); expect(api.generatePresentationStoryboard).not.toHaveBeenCalled();
  });
  it('rejects stale version/base scope and stops a scope change after an in-flight plan response', async () => {
    const { base, op, storage } = fixture();
    expect(() => createStyleSwitch({ ...op.scope, versionId: 'other' }, base, op.request.style)).toThrow();
    let current = true;
    vi.mocked(api.generatePresentationStoryboard).mockImplementationOnce(async () => { current = false; return { task: { id: 'plan' } as api.AgentTaskView }; });
    await expect(advanceStyleSwitch(op, storage, () => current)).rejects.toThrow('styleScopeChanged');
    expect(loadStyleSwitch(storage, op.scope)?.phase).toBe('plan');
    expect(api.transitionPresentationAsset).not.toHaveBeenCalled();
  });
  it('requires explicit resume on remount and retains exact persisted scope; multi-scene is read-only', async () => {
    const { base, op, advance, storage } = fixture(); await advance();
    const restored = loadStyleSwitch(storage, op.scope)!; expect(restored.planTaskId).toBe('plan');
    expect(loadStyleSwitch(storage, { ...op.scope, actorId: 'other' })).toBeUndefined();
    expect(api.transitionPresentationAsset).not.toHaveBeenCalled();
    base.storyboard!.document.scenes.push(structuredClone(base.storyboard!.document.scenes[0]!));
    expect(canSwitchIllustrationStyle(base, 0)).toBe(false);
    saveStyleSwitch(storage, op);
  });
});
