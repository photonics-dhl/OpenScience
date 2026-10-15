import { describe, expect, it } from 'vitest';
import { resultFromTask, selectRestorableGuide } from '../components/hermes/HermesAssistantDrawer';
import type { AgentTaskView } from '../lib/api';
import { loadPendingFirstImageSubmission, savePendingFirstImageSubmission } from '../lib/hermes/draft-state';

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
