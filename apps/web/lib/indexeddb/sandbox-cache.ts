const DB_NAME = 'openscience_sandbox_cache';
const DB_VERSION = 1;
const STORE_NAME = 'jobResults';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedJobResult {
  jobId: string;
  workspaceId: string;
  script: string;
  status: 'completed' | 'failed' | 'timeout';
  result: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    timeout?: boolean;
    runtimeSeconds: number;
  };
  artifacts: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    blob: Blob;
  }>;
  environment: {
    pythonVersion: string;
    packages: string[];
  };
  metadata: {
    visualizationType?: 'plot' | 'simulation' | 'diagram';
    description?: string;
    tags: string[];
  };
  createdAt: number;
  expiresAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
        store.createIndex('by-expires', 'expiresAt', { unique: false });
        store.createIndex('by-workspace', 'workspaceId', { unique: false });
      }
    };
  });
}

export async function putJobResult(data: Omit<CachedJobResult, 'createdAt' | 'expiresAt'>): Promise<void> {
  const db = await openDB();
  const now = Date.now();
  const entry: CachedJobResult = {
    ...data,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(entry);

    request.onsuccess = () => {
      // 触发清理过期数据
      deleteExpired().catch(console.warn);
      resolve();
    };
    request.onerror = () => {
      // QuotaExceededError 处理
      if (request.error?.name === 'QuotaExceededError') {
        cleanupOldest().then(() => putJobResult(data)).then(resolve).catch(reject);
      } else {
        reject(request.error);
      }
    };
  });
}

export async function getJobResult(jobId: string): Promise<CachedJobResult | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(jobId);

    request.onsuccess = () => {
      const result = request.result as CachedJobResult | undefined;

      // 检查是否过期
      if (result && result.expiresAt < Date.now()) {
        // 异步删除过期条目
        deleteJob(jobId).catch(console.warn);
        resolve(null);
      } else {
        resolve(result ?? null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteExpired(): Promise<void> {
  const db = await openDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by-expires');
    const request = index.openCursor(IDBKeyRange.upperBound(now));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteJob(jobId: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(jobId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** QuotaExceededError 处理：删除最早的 20% 条目。 */
async function cleanupOldest(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as CachedJobResult[];
      const sorted = all.sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = sorted.slice(0, Math.ceil(all.length * 0.2));

      toDelete.forEach((item) => store.delete(item.jobId));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
