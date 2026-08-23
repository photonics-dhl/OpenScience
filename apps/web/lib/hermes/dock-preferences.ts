import { resolveHermesSettledDock } from './companion-placement';

export type HermesActivityLevel = 'quiet' | 'balanced' | 'active';
export type HermesViewportClass = 'desktop' | 'mobile';

export interface HermesDockPreferences {
  activity: HermesActivityLevel;
  particles: boolean;
  proactiveHints: boolean;
  sound: boolean;
  xRatio: number;
  yRatio: number;
}

interface HermesPreferenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const DEFAULT_PREFERENCES: HermesDockPreferences = {
  activity: 'balanced',
  particles: true,
  proactiveHints: true,
  sound: false,
  xRatio: .88,
  yRatio: .78,
};

const storageKey = (workspaceId: string, viewportClass: HermesViewportClass) => (
  `openscience:hermes-dock:v1:${workspaceId}:${viewportClass}`
);

export function hasStoredHermesDockPreferences(
  storage: HermesPreferenceStorage,
  workspaceId: string,
  viewportClass: HermesViewportClass,
) {
  return storage.getItem(storageKey(workspaceId, viewportClass)) !== null;
}

const valid = (value: unknown): value is HermesDockPreferences => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HermesDockPreferences>;
  return (candidate.activity === 'quiet' || candidate.activity === 'balanced' || candidate.activity === 'active')
    && typeof candidate.particles === 'boolean'
    && typeof candidate.proactiveHints === 'boolean'
    && typeof candidate.sound === 'boolean'
    && Number.isFinite(candidate.xRatio)
    && Number.isFinite(candidate.yRatio);
};

export function loadHermesDockPreferences(
  storage: HermesPreferenceStorage,
  workspaceId: string,
  viewportClass: HermesViewportClass,
): HermesDockPreferences {
  try {
    const raw = storage.getItem(storageKey(workspaceId, viewportClass));
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveHermesDockPreferences(
  storage: HermesPreferenceStorage,
  workspaceId: string,
  viewportClass: HermesViewportClass,
  preferences: HermesDockPreferences,
) {
  storage.setItem(storageKey(workspaceId, viewportClass), JSON.stringify(preferences));
}

export function resetHermesDockPreferences(
  storage: HermesPreferenceStorage,
  workspaceId: string,
  viewportClass: HermesViewportClass,
) {
  storage.removeItem(storageKey(workspaceId, viewportClass));
}

export function resolveHermesDock(
  preferences: HermesDockPreferences,
  viewport: { width: number; height: number },
  actor: { width: number; height: number },
  viewportChanged: boolean,
) {
  const desired = { x: preferences.xRatio * viewport.width, y: preferences.yRatio * viewport.height };
  if (!viewportChanged) return desired;
  return resolveHermesSettledDock({
    desired,
    footprint: {
      bottom: actor.height / 2,
      left: actor.width / 2,
      right: actor.width / 2,
      top: actor.height / 2,
    },
    obstacles: [],
    viewport: { bottom: viewport.height, left: 0, right: viewport.width, top: 0 },
  }).point;
}
