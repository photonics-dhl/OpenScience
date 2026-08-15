import type { HermesVisualState } from '@/components/hermes/hermes-state';

export const HERMES_ACTION_BY_STATE = {
  idle: 'Hermes_Idle',
  guiding: 'Hermes_Guiding',
  scanning: 'Hermes_Scanning',
  suggesting: 'Hermes_Suggesting',
  awaiting_approval: 'Hermes_AwaitingApproval',
  failed: 'Hermes_Failed',
} as const satisfies Record<HermesVisualState, string>;

export type HermesActionName = (typeof HERMES_ACTION_BY_STATE)[HermesVisualState];

export function hermesActionForState(state: HermesVisualState): HermesActionName {
  return HERMES_ACTION_BY_STATE[state];
}
