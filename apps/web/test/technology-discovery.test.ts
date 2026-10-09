import { describe, expect, it } from 'vitest';
import type { AgentTaskView } from '../lib/api';
import { consultationText } from '../lib/technology-discovery/contact';
import { anonymousDraftKey, loadDiscoveryDraft, saveDiscoveryDraft, transferAnonymousQuery, userDraftKey } from '../lib/technology-discovery/storage';
import { selectedSources, sourcesFromTask, type DiscoveryDraft } from '../lib/technology-discovery/types';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const task: AgentTaskView = {
  id: 'owned-task', sessionId: 'session', kind: 'source.retrieve', status: 'succeeded', progress: 100,
  retryCount: 0, canRetry: false, error: null, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
  result: { sources: [
    { id: 'source-1', provider: 'semantic-scholar', title: 'Real metadata title', sourceUrl: 'https://example.org/paper', identifiers: { doi: '10.1234/test' }, rights: {} },
    { id: 'source-2', provider: 'tavily', title: 'Second title', sourceUrl: 'https://', identifiers: {}, rights: {} },
  ], providers: [{ provider: 'semantic-scholar', status: 'succeeded' }] },
};

describe('technology discovery state', () => {
  it('projects only real source metadata and omits malformed links', () => {
    const sources = sourcesFromTask(task);
    expect(sources[0]).toEqual({ id: 'owned-task:source-1', title: 'Real metadata title', url: 'https://example.org/paper', identifier: '10.1234/test' });
    expect(sources[1]).toEqual({ id: 'owned-task:source-2', title: 'Second title' });
    expect(Object.keys(sources[0]!)).not.toContain('abstract');
  });

  it('keeps user and audience drafts separate, transferring only anonymous query and brief', () => {
    const storage = memoryStorage();
    const saved: DiscoveryDraft = { version: 1, audience: 'investors', query: 'Draft question', brief: 'Opportunity note', turns: [{ id: 'turn', query: 'Previous', taskId: 'owned-task', task, selected: ['owned-task:source-1'], createdAt: 'now' }] };
    saveDiscoveryDraft(storage, anonymousDraftKey('investors'), saved);
    const transferred = transferAnonymousQuery(storage, 'user-a', 'investors');
    expect(transferred).toMatchObject({ query: 'Draft question', brief: 'Opportunity note', turns: [] });
    expect(loadDiscoveryDraft(storage, userDraftKey('user-b', 'investors'), 'investors').query).toBe('');
    expect(loadDiscoveryDraft(storage, userDraftKey('user-a', 'industry'), 'industry').query).toBe('');
    expect(storage.getItem(anonymousDraftKey('investors'))).toBeNull();
  });

  it('limits selected source comparison and exports to actual selected metadata', () => {
    const sources = sourcesFromTask(task);
    const selected = selectedSources([{ id: 'turn', query: 'Need', taskId: task.id, task, selected: [sources[0]!.id], createdAt: 'now' }]);
    expect(selected).toHaveLength(1);
    const body = consultationText({ audience: 'investors', name: 'A', organization: 'B', email: 'a@example.org', need: 'Review this evidence', brief: 'Market question', query: 'Earlier research query', sources: selected });
    expect(body).toContain('Real metadata title');
    expect(body).toContain('Review this evidence');
    expect(body).toContain('Market question');
    expect(body).toContain('Earlier research query');
    expect(body).not.toContain('Second title');
  });
});
