import type { HermesDockSide } from './travel-path';

export type HermesAnchorId =
  | 'ro-title'
  | 'source-import'
  | 'research-question'
  | 'sdf-problem'
  | 'sdf-insight'
  | 'sdf-method'
  | 'sdf-evidence'
  | 'sdf-results'
  | 'sdf-limitations'
  | 'hermes-diff'
  | 'commit';

export type HermesAnchorAction = 'explain' | 'draft' | 'check';

export interface HermesAnchorRegistration {
  actions: HermesAnchorAction[];
  clearancePx: number;
  element: () => HTMLElement | null;
  id: HermesAnchorId;
  sides: HermesDockSide[];
}

interface HermesAnchorSnapshot {
  actions: HermesAnchorAction[];
  clearancePx: number;
  id: HermesAnchorId;
  rect: { bottom: number; height: number; left: number; right: number; top: number; width: number; x: number; y: number };
  sides: HermesDockSide[];
}

export interface HermesAnchorRegistry {
  register(registration: HermesAnchorRegistration): () => void;
  snapshot(id: HermesAnchorId): HermesAnchorSnapshot | null;
}

export function createHermesAnchorRegistry(): HermesAnchorRegistry {
  const registrations = new Map<HermesAnchorId, { registration: HermesAnchorRegistration; token: symbol }>();
  return {
    register(registration) {
      const token = Symbol(registration.id);
      registrations.set(registration.id, { registration, token });
      return () => {
        if (registrations.get(registration.id)?.token === token) registrations.delete(registration.id);
      };
    },
    snapshot(id) {
      const entry = registrations.get(id);
      const element = entry?.registration.element();
      if (!entry || !element) return null;
      const rect = element.getBoundingClientRect();
      return {
        actions: [...entry.registration.actions],
        clearancePx: entry.registration.clearancePx,
        id,
        rect: {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        },
        sides: [...entry.registration.sides],
      };
    },
  };
}
