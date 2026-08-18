export type HermesVisualState =
  | 'idle'
  | 'guiding'
  | 'scanning'
  | 'suggesting'
  | 'awaiting_approval'
  | 'failed';

export interface HermesTaskLink {
  id: string;
  researchObjectId: string;
}

export interface HermesStateInput {
  state: string;
}

const PRIORITY: Record<string, number> = {
  needs_review: 6,
  failed_retryable: 5,
  failed_blocked: 5,
  parsing: 4,
  uploading: 4,
  stored: 3,
  queued: 2,
};

export function deriveHermesVisualState(tasks: HermesStateInput[]): HermesVisualState {
  const task = [...tasks].sort((a, b) => (PRIORITY[b.state] ?? 0) - (PRIORITY[a.state] ?? 0))[0];
  if (!task) return 'idle';
  if (task.state === 'needs_review') return 'awaiting_approval';
  if (task.state.startsWith('failed_')) return 'failed';
  if (task.state === 'parsing' || task.state === 'uploading') return 'scanning';
  if (task.state === 'stored') return 'suggesting';
  return 'guiding';
}

export function deriveHermesCompositeVisualState(tasks: HermesStateInput[], guideActive: boolean): HermesVisualState {
  const ingestionState = deriveHermesVisualState(tasks);
  if (ingestionState === 'awaiting_approval') return ingestionState;
  return guideActive ? 'scanning' : ingestionState;
}

export function hermesTaskHref(task: HermesTaskLink): string {
  return `/research-objects/${encodeURIComponent(task.researchObjectId)}/hermes?task=${encodeURIComponent(task.id)}`;
}
