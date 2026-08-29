const STORAGE_KEY = 'openscience.evidence-default-collapsed';
const CHANGE_EVENT = 'openscience:evidence-reading-preference';

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readLocalEvidenceDefaultCollapsed(storage?: PreferenceStorage): boolean {
  if (!storage && typeof window === 'undefined') return false;
  try {
    return (storage ?? window.localStorage).getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeLocalEvidenceDefaultCollapsed(collapsed: boolean, storage?: PreferenceStorage): void {
  if (!storage && typeof window === 'undefined') return;
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, String(collapsed));
    if (!storage) window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: collapsed }));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; the reading surface remains expanded.
  }
}

export function subscribeEvidenceReadingPreference(listener: (collapsed: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => listener((event as CustomEvent<boolean>).detail);
  window.addEventListener(CHANGE_EVENT, handle);
  return () => window.removeEventListener(CHANGE_EVENT, handle);
}
