import { describe, expect, it } from 'vitest';
import { resultFromTask, selectRestorableGuide, buildGuidePresentationContext, selectedGuidePresentationContext, applyFirstImageReady } from '../components/hermes/HermesAssistantDrawer';
import type { AgentTaskView } from '../lib/api';
import { currentFirstImageGoal, loadPendingFirstImageSubmission, savePendingFirstImageSubmission, loadPendingSelectedImageSubmission, savePendingSelectedImageSubmission } from '../lib/hermes/draft-state';
import { parseWorkspaceGuidePayload } from '@openscience/domain/workspace-guide-contract';

describe('exact image reference in the actual guide writer', () => {
  const a = 'a1000000-0000-4000-8000-000000000001', b = 'b1000000-0000-4000-8000-000000000001';
  const input = { actorId: 'u', goal: '把左边箭头画细一点', presentation: { researchObjectId: 'ro', versionId: 'v' },
    imageContext: { actorId: 'u', researchObjectId: 'ro', versionId: 'v', selectedImageAssetId: b,
      images: [{ assetId: a, label: 'Mechanism' }, { assetId: b, label: 'Overview' }] } };
  it('keeps the production R writer legacy and the capable writer exact', () => {
    expect(buildGuidePresentationContext(input)).toEqual({ presentation: input.presentation });
    expect(selectedGuidePresentationContext(input)).toEqual({ presentation: { ...input.presentation, selectedImageAssetId: b } });
  });
  it('lets an explicit unique name or displayed ordinal win over the active image', () => {
    expect(selectedGuidePresentationContext({ ...input, goal: '把“Mechanism”这张图左侧改成蓝色' })).toHaveProperty('presentation.selectedImageAssetId', a);
    expect(selectedGuidePresentationContext({ ...input, goal: '修改第1张图的左侧箭头' })).toHaveProperty('presentation.selectedImageAssetId', a);
    expect(selectedGuidePresentationContext({ ...input, goal: '修改第二张图的左侧箭头' })).toHaveProperty('presentation.selectedImageAssetId', b);
  });
  it('asks once for duplicate, unmatched or contradictory image references instead of falling back', () => {
    expect(selectedGuidePresentationContext({ ...input, goal: '修改Shared这张图', imageContext: { ...input.imageContext,
      images: input.imageContext.images.map(image => ({ ...image, label: 'Shared' })) } })).toHaveProperty('question', 'ambiguous');
    expect(selectedGuidePresentationContext({ ...input, goal: '修改“Unknown”这张图' })).toHaveProperty('question', 'missing');
    expect(selectedGuidePresentationContext({ ...input, goal: '修改Unknown这张图的左侧箭头' })).toHaveProperty('question', 'missing');
    expect(selectedGuidePresentationContext({ ...input, goal: '把不存在的图名这张图改成淡彩' })).toHaveProperty('question', 'missing');
    expect(selectedGuidePresentationContext({ ...input, goal: 'Change the Unknown image left arrow' })).toHaveProperty('question', 'missing');
    expect(selectedGuidePresentationContext({ ...input, goal: '请帮我把这张图左侧箭头改细' })).toHaveProperty('presentation.selectedImageAssetId', b);
    expect(selectedGuidePresentationContext({ ...input, goal: '修改第1张Overview图' })).toHaveProperty('question', 'conflicting');
    expect(selectedGuidePresentationContext({ ...input, imageContext: { ...input.imageContext, selectedImageAssetId: 'removed' } })).toHaveProperty('question', 'missing');
  });
  it('refuses stale account/version context and resolves ordinals only in the supplied immutable display snapshot', () => {
    expect(selectedGuidePresentationContext({ ...input, actorId: 'another' })).toHaveProperty('question', 'scope');
    expect(selectedGuidePresentationContext({ ...input, imageContext: { ...input.imageContext, versionId: 'old' } })).toHaveProperty('question', 'scope');
    const one = selectedGuidePresentationContext({ ...input, goal: '修改第1张图' });
    const reordered = selectedGuidePresentationContext({ ...input, goal: '修改第1张图', imageContext: { ...input.imageContext, images: [...input.imageContext.images].reverse() } });
    expect(one).toHaveProperty('presentation.selectedImageAssetId', a); expect(reordered).toHaveProperty('presentation.selectedImageAssetId', b);
    expect(one).toHaveProperty('presentation.selectedImageAssetId', a);
  });
  it('focuses the exact completed image while its real gallery refresh is pending, without changing a sent request', () => {
    const f = 'f1000000-0000-4000-8000-000000000001';
    const sent = { key: 'paid-b', payload: selectedGuidePresentationContext(input).presentation, goal: input.goal };
    const original = structuredClone(sent);
    const ready = { actorId: 'u', researchObjectId: 'ro', versionId: 'v', guideTaskId: 'guide-f', assetId: f, label: 'Fresh illustration' };
    const context = applyFirstImageReady(input.imageContext, ready, input.imageContext)!;
    expect(context).toMatchObject({ selectedImageAssetId: f, pendingImageAssetId: f });
    expect(context.images).toEqual(input.imageContext.images);
    expect(selectedGuidePresentationContext({ ...input, imageContext: context, goal: '把这张图的左边箭头改细' })).toHaveProperty('presentation.selectedImageAssetId', f);
    expect(selectedGuidePresentationContext({ ...input, imageContext: context, goal: '调整原图的颜色' })).toHaveProperty('question', 'missing');
    expect(selectedGuidePresentationContext({ ...input, imageContext: context, originalImageAssetId: b, goal: '调整原图的颜色' })).toHaveProperty('presentation.selectedImageAssetId', b);
    expect(sent).toEqual(original);
    const refreshed = { ...context, images: [...context.images, { assetId: f, label: ready.label }], pendingImageAssetId: undefined, selectedImageAssetId: a };
    expect(applyFirstImageReady(refreshed, ready, input.imageContext)).toBe(refreshed);
    expect(selectedGuidePresentationContext({ ...input, imageContext: refreshed, goal: '把刚生成那张图的箭头改细' })).toHaveProperty('presentation.selectedImageAssetId', f);
  });
  it('ignores late image-ready callbacks from another account, version or research object', () => {
    const ready = { actorId: 'u', researchObjectId: 'ro', versionId: 'v', guideTaskId: 'guide-f', assetId: a, label: 'Fresh' };
    for (const wrong of [{ ...ready, actorId: 'other' }, { ...ready, versionId: 'other' }, { ...ready, researchObjectId: 'other' }]) {
      expect(applyFirstImageReady(input.imageContext, wrong, input.imageContext)).toBe(input.imageContext);
    }
  });
});

it('recovers the exact selected-image body and key independently of first-image and other account/version scope', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } } as Storage;
  const scope = { userId: 'u', researchObjectId: 'ro', versionId: 'v' };
  const pending = { sessionId: 'same-session', key: 'same-key', payload: { goal: '把左侧箭头改细  ', locale: 'zh' as const,
    route: 'research-object-edit' as const, target: null, context: { tasks: [], researchObjects: [],
      presentation: { researchObjectId: 'ro', versionId: 'v', selectedImageAssetId: 'a1000000-0000-4000-8000-000000000001' } } } };
  expect(savePendingSelectedImageSubmission(storage, scope, pending)).toBe(true);
  expect(loadPendingSelectedImageSubmission(storage, scope)).toEqual(pending);
  expect(loadPendingFirstImageSubmission(storage, scope)).toBeNull();
  expect(loadPendingSelectedImageSubmission(storage, { ...scope, userId: 'other' })).toBeNull();
  expect(loadPendingSelectedImageSubmission(storage, { ...scope, versionId: 'other' })).toBeNull();
  expect(savePendingSelectedImageSubmission(storage, scope, { ...pending, taskId: 'exact-task' })).toBe(true);
  expect(loadPendingSelectedImageSubmission(storage, scope)).toMatchObject({ taskId: 'exact-task', payload: pending.payload });
  expect(savePendingSelectedImageSubmission(storage, scope, { ...pending, payload: { ...pending.payload, executionIntent: 'first-image' } })).toBe(false);
  expect(savePendingSelectedImageSubmission(null, scope, pending)).toBe(false);
  const key = [...values.keys()][0]!;
  values.set(key, ''); expect(() => loadPendingSelectedImageSubmission(storage, scope)).toThrow();
  values.set(key, '{broken'); expect(() => loadPendingSelectedImageSubmission(storage, scope)).toThrow();
});

describe('current first-image UI alias preserves the server grammar', () => {
  it.each([
    ['Generate one image', 'Generate one image'],
    ['  生成图片  ', '  生成图片  '],
    ['Generate one image, caption: 为这篇研究做一张图', 'Generate one image, caption: 为这篇研究做一张图'],
    ['为这篇研究做一张图', '为当前研究生成一张图'],
    ['为这篇研究做一张图，使用淡彩；保留 x、y 与 ω。', '为当前研究生成一张图，使用淡彩；保留 x、y 与 ω。'],
  ])('keeps the existing instruction or maps only the current alias: %s', (goal, expected) => {
    expect(currentFirstImageGoal(goal)).toBe(expected);
    expect(parseWorkspaceGuidePayload({ goal: expected, locale: 'zh', route: 'research-object-edit', target: null,
      executionIntent: 'first-image', context: { tasks: [], researchObjects: [], presentation: { researchObjectId: 'ro', versionId: 'v' } } }).goal).toBe(expected.trim());
  });
  it.each(['为这篇研究做一张图表', '为这篇研究做一张图？', '为这篇研究做一张图，不要生成',
    '为这篇研究做一张图，生成多张图片', '论文说“为这篇研究做一张图”', '为这篇研究做一张图，用于第二幕',
    '如何为这篇研究做一张图', '为这篇研究做一张图\n水彩'])('refuses non-executing or out-of-scope alias instructions: %s', goal => {
    expect(currentFirstImageGoal(goal)).toBeNull();
  });
});

it('refuses an expanded historical receipt without rewriting its original goal or key', () => {
  const original = JSON.stringify({ sessionId: 'session', key: 'old-expanded-key', payload: {
    goal: '为这篇研究做一张图', executionIntent: 'first-image', locale: 'zh', route: 'research-object-edit', target: null,
    context: { tasks: [], researchObjects: [], presentation: { researchObjectId: 'ro', versionId: 'v' } },
  } });
  let value = original;
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } } as Storage;
  expect(() => loadPendingFirstImageSubmission(storage, { userId: 'u', researchObjectId: 'ro', versionId: 'v' })).toThrow();
  expect(value).toBe(original);
});

it('preserves an uncertain image request and scopes its exact identity to the account and version', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } } as Storage;
  const scope = { userId: 'u', researchObjectId: 'ro', versionId: 'v' };
  const pending = { sessionId: 'session', key: 'original-key', payload: {
    goal: '生成图片', executionIntent: 'first-image' as const, locale: 'zh' as const,
    route: 'research-object-edit' as const, target: null,
    context: { tasks: [], researchObjects: [], presentation: { researchObjectId: 'ro', versionId: 'v' } },
  } };
  expect(savePendingFirstImageSubmission(storage, scope, pending)).toBe(true);
  expect(loadPendingFirstImageSubmission(storage, scope)).toEqual(pending);
  expect(JSON.stringify(loadPendingFirstImageSubmission(storage, scope)?.payload)).toBe(JSON.stringify(pending.payload));
  expect(savePendingFirstImageSubmission(null, scope, pending)).toBe(false);
  expect(savePendingFirstImageSubmission({ ...storage, setItem: () => { throw new Error('Quota exceeded'); } }, scope, pending)).toBe(false);
  expect(loadPendingFirstImageSubmission(storage, { ...scope, userId: 'other' })).toBeNull();
  expect(loadPendingFirstImageSubmission(storage, { ...scope, versionId: 'other' })).toBeNull();
  expect(savePendingFirstImageSubmission(storage, scope, { ...pending, taskId: 'exact-task' })).toBe(true);
  expect(savePendingFirstImageSubmission(storage, scope, { ...pending, payload: { ...pending.payload,
    context: { ...pending.payload.context, presentation: { researchObjectId: 'foreign', versionId: 'v' } } } })).toBe(false);
  expect(loadPendingFirstImageSubmission(storage, scope)?.taskId).toBe('exact-task');
  values.set([...values.keys()][0], '');
  expect(() => loadPendingFirstImageSubmission(storage, scope)).toThrow();
  values.set([...values.keys()][0], '{broken');
  expect(() => loadPendingFirstImageSubmission(storage, scope)).toThrow();
});

describe('Hermes guide recovery scope', () => {
  it('reads the persisted run without turning a prior proposal into execution', () => {
    const run = { runId: '10000000-0000-4000-8000-000000000001', versionId: '10000000-0000-4000-8000-000000000002' };
    const result = { summary: 'Queued', nextSteps: [], needsMoreInformation: false, firstImageRun: run };
    expect(resultFromTask({ result } as AgentTaskView)?.firstImageRun).toEqual(run);
    expect(resultFromTask({ result: { ...result, firstImageRun: { ...run, charge: true } } } as unknown as AgentTaskView)).toBeNull();
    expect(resultFromTask({ result: { ...result, needsMoreInformation: true } } as AgentTaskView)).toBeNull();
    expect(resultFromTask({ result: { ...result, presentationDraft: {} } } as unknown as AgentTaskView)).toBeNull();
  });
  const task = (id: string, researchObjectId?: string) => ({ id, researchObjectId, kind: 'workspace.guide' } as AgentTaskView);
  it('does not restore another research or an unscoped guide in a RO', () => {
    expect(selectRestorableGuide([task('other', 'ro-b'), task('unscoped')], 'research-object-edit', 'ro-a')).toBeNull();
  });
  it('restores the matching RO when its identity is available', () => {
    const match = task('matching', 'ro-a');
    expect(selectRestorableGuide([task('other', 'ro-b'), match], 'research-object-edit', 'ro-a')).toBe(match);
  });
  it('preserves dashboard recovery and refuses a missing RO identity', () => {
    const latest = task('latest');
    expect(selectRestorableGuide([latest], 'dashboard')).toBe(latest);
    expect(selectRestorableGuide([latest], 'research-object-edit')).toBeNull();
  });
});
