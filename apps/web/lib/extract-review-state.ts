import { SDF_FIELDS, type SdfField } from './suggestions';

export interface ExtractReviewCheckpoint {
  version: 1;
  idempotencyKey: string;
  taskId?: string;
  retryAvailable: boolean;
  dismissedFields: SdfField[];
  acknowledgedMissingFields: SdfField[];
  updatedAt: number;
}

const MAX_AGE_MS = 24 * 3600 * 1000;
const storageKey = (roId: string) => `openscience:extract-review:${roId}`;

const isFieldList = (value: unknown): value is SdfField[] => (
  Array.isArray(value) && value.every((field) => SDF_FIELDS.includes(field))
);

export function loadExtractReviewState(storage: Storage, roId: string, now = Date.now()): ExtractReviewCheckpoint | null {
  try {
    const key = storageKey(roId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ExtractReviewCheckpoint>;
    const invalid = value.version !== 1
      || typeof value.idempotencyKey !== 'string'
      || (value.taskId !== undefined && typeof value.taskId !== 'string')
      || typeof value.retryAvailable !== 'boolean'
      || !isFieldList(value.dismissedFields)
      || !isFieldList(value.acknowledgedMissingFields)
      || typeof value.updatedAt !== 'number'
      || now - value.updatedAt > MAX_AGE_MS;
    if (invalid) {
      storage.removeItem(key);
      return null;
    }
    return value as ExtractReviewCheckpoint;
  } catch {
    return null;
  }
}

export function saveExtractReviewState(storage: Storage, roId: string, value: ExtractReviewCheckpoint): void {
  try {
    storage.setItem(storageKey(roId), JSON.stringify(value));
  } catch {
    // Recovery is best effort; storage denial must never block the paid task itself.
  }
}

export function clearExtractReviewState(storage: Storage, roId: string): void {
  try {
    storage.removeItem(storageKey(roId));
  } catch {
    // Best-effort cleanup for privacy-mode or disabled storage.
  }
}
