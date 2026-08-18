import { describe, expect, it } from 'vitest';
import {
  clearExtractReviewState,
  loadExtractReviewState,
  saveExtractReviewState,
  type ExtractReviewCheckpoint,
} from '../lib/extract-review-state';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const checkpoint: ExtractReviewCheckpoint = {
  version: 1,
  idempotencyKey: 'extract-run-1',
  taskId: 'task-1',
  retryAvailable: false,
  dismissedFields: ['method'],
  acknowledgedMissingFields: ['results'],
  updatedAt: 1_700_000_000_000,
};

describe('extract review recovery state', () => {
  it('round-trips only task identity and non-content review decisions', () => {
    const storage = new MemoryStorage();
    saveExtractReviewState(storage, 'ro-1', checkpoint);
    expect(loadExtractReviewState(storage, 'ro-1', checkpoint.updatedAt + 1000)).toEqual(checkpoint);
    expect(storage.getItem('openscience:extract-review:ro-1')).not.toMatch(/source manuscript|Bounded problem|chars:0-7/);
  });

  it('removes stale or malformed checkpoints and can clear a completed review', () => {
    const storage = new MemoryStorage();
    storage.setItem('openscience:extract-review:ro-1', JSON.stringify({ version: 2, taskId: 'wrong' }));
    expect(loadExtractReviewState(storage, 'ro-1', checkpoint.updatedAt)).toBeNull();
    saveExtractReviewState(storage, 'ro-1', checkpoint);
    expect(loadExtractReviewState(storage, 'ro-1', checkpoint.updatedAt + 24 * 3600 * 1000 + 1)).toBeNull();
    expect(storage.getItem('openscience:extract-review:ro-1')).toBeNull();
    saveExtractReviewState(storage, 'ro-1', checkpoint);
    clearExtractReviewState(storage, 'ro-1');
    expect(loadExtractReviewState(storage, 'ro-1')).toBeNull();
  });

  it('does not make extraction fail when browser storage is unavailable', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => { throw new DOMException('quota'); };
    expect(() => saveExtractReviewState(storage, 'ro-1', checkpoint)).not.toThrow();
  });
});
