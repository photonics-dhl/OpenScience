const STORAGE_KEY = 'openscience.evidence-default-collapsed';

export function readLocalEvidenceDefaultCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

export function writeLocalEvidenceDefaultCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(collapsed));
}

