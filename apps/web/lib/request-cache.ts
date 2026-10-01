export interface ReadOptions { fresh?: boolean }

export class RequestCacheInvalidatedError extends Error {
  constructor() {
    super('This read was superseded by an account change or write. Refresh to read the current state.');
    this.name = 'RequestCacheInvalidatedError';
  }
}

interface Entry {
  pending?: Promise<unknown>;
  value?: unknown;
  expiresAt: number;
}

/** Bounded memory-only JSON reads. Invalidation also fences pending responses. */
export class RequestCache {
  private readonly entries = new Map<string, Entry>();
  private revision = 0;

  constructor(private readonly reuseMs: number, private readonly capacity = 32) {}

  invalidate(): void {
    this.revision += 1;
    this.entries.clear();
  }

  async read<T>(key: string, load: () => Promise<T>, options: ReadOptions = {}): Promise<T> {
    const now = Date.now();
    const revision = this.revision;
    for (const [entryKey, entry] of this.entries) {
      if (!entry.pending && entry.expiresAt <= now) this.entries.delete(entryKey);
    }
    const existing = this.entries.get(key);
    if (existing?.pending) {
      const value = await existing.pending;
      if (revision !== this.revision) throw new RequestCacheInvalidatedError();
      return structuredClone(value) as T;
    }
    if (existing && !options.fresh) return structuredClone(existing.value) as T;

    const entry: Entry = { expiresAt: 0 };
    const pending = load().then((value) => {
      if (revision !== this.revision) throw new RequestCacheInvalidatedError();
      // A capacity eviction may stop reuse, but must not invalidate the caller's read.
      if (this.entries.get(key) === entry) {
        entry.value = value;
        entry.expiresAt = Date.now() + this.reuseMs;
        entry.pending = undefined;
      }
      return value;
    }).catch((cause) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw cause;
    });
    entry.pending = pending;
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    const value = await pending;
    if (revision !== this.revision) throw new RequestCacheInvalidatedError();
    return structuredClone(value);
  }
}
