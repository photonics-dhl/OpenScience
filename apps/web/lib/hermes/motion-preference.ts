export type HermesMotionPreference = 'full' | 'reduced';

const STORAGE_KEY = 'openscience.hermes.motion';

interface HermesMotionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadHermesMotionPreference(storage: Pick<HermesMotionStorage, 'getItem'>): HermesMotionPreference | null {
  const value = storage.getItem(STORAGE_KEY);
  return value === 'full' || value === 'reduced' ? value : null;
}

export function saveHermesMotionPreference(storage: Pick<HermesMotionStorage, 'setItem'>, preference: HermesMotionPreference) {
  storage.setItem(STORAGE_KEY, preference);
}

export function resolveHermesReducedMotion(
  systemReduced: boolean,
  search: string,
  storedPreference: HermesMotionPreference | null = null,
): boolean {
  const preference = new URLSearchParams(search).get('hermes-motion');
  if (preference === 'full') return false;
  if (preference === 'reduced') return true;
  if (storedPreference === 'full') return false;
  if (storedPreference === 'reduced') return true;
  return systemReduced;
}
