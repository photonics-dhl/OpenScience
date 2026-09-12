import type { SdfCore } from './api';
import { SDF_FIELDS, type SdfField } from './suggestions';

const PREFIX = 'openscience:ingestion-proposal:';

export interface IngestionProposalScope {
  userId: string;
  researchObjectId: string;
  researchObjectVersion: number;
  taskId: string;
  agentTaskId: string;
}

export interface IngestionProposalDraft {
  core: SdfCore;
  touched: SdfField[];
  savedAt: number;
}

function key(scope: IngestionProposalScope): string {
  return `${PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.researchObjectId)}:${scope.researchObjectVersion}:${encodeURIComponent(scope.taskId)}:${encodeURIComponent(scope.agentTaskId)}:v2`;
}

export function getIngestionProposalStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

export function loadIngestionProposalDraft(storage: Storage | null, scope: IngestionProposalScope): IngestionProposalDraft | null {
  try {
    const raw = storage?.getItem(key(scope));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<IngestionProposalDraft> & { version?: unknown };
    if (value.version !== 2 || typeof value.savedAt !== 'number' || !value.core || typeof value.core !== 'object'
      || !Array.isArray(value.touched) || value.touched.some((field) => !SDF_FIELDS.includes(field))) return null;
    if (typeof value.core.schemaVersion !== 'string' || SDF_FIELDS.some((field) => typeof value.core?.[field] !== 'string')) return null;
    return { core: value.core, touched: [...new Set(value.touched)], savedAt: value.savedAt };
  } catch { return null; }
}

export function saveIngestionProposalDraft(storage: Storage | null, scope: IngestionProposalScope, draft: IngestionProposalDraft): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key(scope), JSON.stringify({ version: 2, ...draft }));
    return true;
  } catch { return false; }
}

export function clearIngestionProposalDraft(storage: Storage | null, scope: IngestionProposalScope): void {
  try { storage?.removeItem(key(scope)); } catch { /* Session storage may be unavailable. */ }
}
