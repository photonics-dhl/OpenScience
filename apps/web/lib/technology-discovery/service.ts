import { getAgentTask, retryAgentTask, submitLiteratureAcquisition, type AgentTaskView } from '@/lib/api';
import { acquirePendingLiteratureIntent, settlePendingLiteratureIntent, startLiteratureTaskPolling } from '@/lib/literature-acquisition-state';
import type { DiscoveryAudience } from './types';

const target = { kind: 'personal' } as const;
const namespace = (audience: DiscoveryAudience) => `technology-discovery-${audience}`;

export async function submitDiscoveryQuery(storage: Storage, userId: string, audience: DiscoveryAudience, query: string): Promise<AgentTaskView> {
  const input = { query };
  const pending = await acquirePendingLiteratureIntent(storage, { userId, target: `research-object:${namespace(audience)}`, input }, () => crypto.randomUUID());
  if (pending.status === 'blocked') throw new Error('pending-intent');
  try {
    const { task } = await submitLiteratureAcquisition(input, pending.key, target);
    settlePendingLiteratureIntent(storage, { userId, target: `research-object:${namespace(audience)}` }, { kind: 'accepted' });
    return task;
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
    settlePendingLiteratureIntent(storage, { userId, target: `research-object:${namespace(audience)}` }, { kind: 'failure', status });
    throw error;
  }
}

export const readDiscoveryTask = async (taskId: string, signal?: AbortSignal) => (await getAgentTask('', taskId, signal)).task;
export const retryDiscoveryTask = async (taskId: string) => (await retryAgentTask(taskId)).task;
export { startLiteratureTaskPolling };
