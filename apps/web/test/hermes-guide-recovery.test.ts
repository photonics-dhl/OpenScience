import { describe, expect, it } from 'vitest';
import { resultFromTask, selectRestorableGuide } from '../components/hermes/HermesAssistantDrawer';
import type { AgentTaskView } from '../lib/api';

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
