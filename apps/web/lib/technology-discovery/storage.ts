import type { DiscoveryAudience, DiscoveryDraft } from './types';

const PREFIX = 'openscience:technology-discovery:v1:';
export const anonymousDraftKey = (audience: DiscoveryAudience) => `${PREFIX}anonymous:${audience}`;
export const userDraftKey = (userId: string, audience: DiscoveryAudience) => `${PREFIX}${encodeURIComponent(userId)}:${audience}`;

export function loadDiscoveryDraft(storage: Storage, key: string, audience: DiscoveryAudience): DiscoveryDraft {
  const empty: DiscoveryDraft = { version: 1, audience, turns: [], query: '', brief: '' };
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null') as Partial<DiscoveryDraft> | null;
    if (parsed?.version !== 1 || parsed.audience !== audience || !Array.isArray(parsed.turns)) return empty;
    return {
      ...empty,
      query: typeof parsed.query === 'string' ? parsed.query.slice(0, 500) : '',
      brief: typeof parsed.brief === 'string' ? parsed.brief.slice(0, 2000) : '',
      turns: parsed.turns.filter(turn => typeof turn?.id === 'string' && typeof turn?.query === 'string' && typeof turn?.taskId === 'string')
        .slice(-10).map(turn => ({ id: turn.id, query: turn.query, taskId: turn.taskId, createdAt: turn.createdAt, selected: Array.isArray(turn.selected) ? turn.selected.filter((value): value is string => typeof value === 'string').slice(0, 3) : [] })),
    };
  } catch { return empty; }
}

export function saveDiscoveryDraft(storage: Storage, key: string, draft: DiscoveryDraft): void {
  try { storage.setItem(key, JSON.stringify({ ...draft, turns: draft.turns.slice(-10).map(turn => ({ id: turn.id, query: turn.query, taskId: turn.taskId, selected: turn.selected, createdAt: turn.createdAt })) })); }
  catch { /* Storage may be disabled. The current page still works. */ }
}

export function transferAnonymousQuery(storage: Storage, userId: string, audience: DiscoveryAudience): DiscoveryDraft {
  const key = userDraftKey(userId, audience);
  const existing = loadDiscoveryDraft(storage, key, audience);
  const anonymous = loadDiscoveryDraft(storage, anonymousDraftKey(audience), audience);
  const merged = { ...existing, query: anonymous.query || existing.query, brief: anonymous.brief || existing.brief };
  saveDiscoveryDraft(storage, key, merged);
  storage.removeItem(anonymousDraftKey(audience));
  return merged;
}
