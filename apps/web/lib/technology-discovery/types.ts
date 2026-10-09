import type { AgentTaskView } from '@/lib/api';

export type DiscoveryAudience = 'industry' | 'investors';
export type DiscoverySource = { id: string; title: string; url?: string; identifier?: string };
export type DiscoveryTurn = { id: string; query: string; taskId: string; task?: AgentTaskView; selected: string[]; createdAt: string };
export type DiscoveryDraft = { version: 1; audience: DiscoveryAudience; turns: DiscoveryTurn[]; query: string; brief: string };

function safeSourceUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : undefined;
  } catch { return undefined; }
}

export function sourcesFromTask(task: AgentTaskView | undefined): DiscoverySource[] {
  if (!task?.result || !Array.isArray(task.result.sources)) return [];
  return task.result.sources.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return [];
    const source = raw as Record<string, unknown>;
    const identifiers = source.identifiers && typeof source.identifiers === 'object' ? source.identifiers as Record<string, unknown> : {};
    const identifier = ['doi', 'DOI', 'arxiv', 'arXiv'].map(key => identifiers[key]).find(value => typeof value === 'string' && value.trim());
    const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim() : '';
    const url = safeSourceUrl(source.sourceUrl);
    if (!title && !identifier && !url) return [];
    return [{ id: `${task.id}:${typeof source.id === 'string' ? source.id : index}`, title: title || String(identifier || url), ...(url ? { url } : {}), ...(identifier ? { identifier: String(identifier) } : {}) }];
  });
}

export function selectedSources(turns: DiscoveryTurn[]): DiscoverySource[] {
  return turns.flatMap(turn => sourcesFromTask(turn.task).filter(source => turn.selected.includes(source.id))).slice(0, 3);
}
