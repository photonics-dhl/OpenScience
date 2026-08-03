import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { getBlobStorageKey, putBlob, getBlob, headBlob, deleteBlob } from '../src/blob';
import { ChecksumMismatchError, ObjectNotFoundError } from '../src/errors';
import type { GetObjectResult, HeadObjectResult, PutObjectOptions, PutObjectResult, StorageAdapter } from '../src/types';

/** 内存版 StorageAdapter：模拟 MinIO 的 put/get/head/delete + sha256 校验。 */
interface MemoryStorage extends StorageAdapter {
  store: Map<string, { body: Buffer; contentType?: string }>;
}

function createMemoryAdapter(): MemoryStorage {
  const store = new Map<string, { body: Buffer; contentType?: string }>();
  const adapter: StorageAdapter = {
    putObject: async (key: string, body: Buffer | Readable, opts: PutObjectOptions = {}): Promise<PutObjectResult> => {
      const buf = Buffer.isBuffer(body) ? body : await streamToBuf(body);
      if (opts.sha256) {
        const actual = createHash('sha256').update(buf).digest('hex');
        if (actual !== opts.sha256.toLowerCase()) {
          throw new ChecksumMismatchError(`sha256 mismatch for "${key}": expected ${opts.sha256}, got ${actual}`);
        }
      }
      store.set(key, { body: buf, contentType: opts.contentType });
      return { key, size: buf.length, etag: `"${opts.sha256 ?? ''}"` };
    },
    getObject: async (key: string): Promise<GetObjectResult> => {
      const hit = store.get(key);
      if (!hit) throw new ObjectNotFoundError(`Object not found: ${key}`);
      return { body: Readable.from(hit.body), size: hit.body.length, contentType: hit.contentType };
    },
    headObject: async (key: string): Promise<HeadObjectResult | null> => {
      const hit = store.get(key);
      if (!hit) return null;
      return { size: hit.body.length, etag: 'x', contentType: hit.contentType };
    },
    deleteObject: async (key: string): Promise<void> => {
      store.delete(key);
    },
  };
  return { ...adapter, store };
}

async function streamToBuf(s: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

const CONTENT = Buffer.from('hello blob content');

describe('getBlobStorageKey', () => {
  it('分段键 blobs/<h2>/<h4>/<sha256>', () => {
    const sha = 'abcdef1234567890'.padEnd(64, '0');
    expect(getBlobStorageKey(sha)).toBe(`blobs/ab/cd/${sha}`);
  });
});

describe('putBlob（去重，§7.1）', () => {
  it('首次上传 → alreadyExists=false，内容入对象存储', async () => {
    const mem = createMemoryAdapter();
    const result = await putBlob(mem, CONTENT);
    expect(result.alreadyExists).toBe(false);
    expect(result.size).toBe(CONTENT.length);
    expect(mem.store.has(getBlobStorageKey(result.sha256))).toBe(true);
  });

  it('相同内容二次上传 → alreadyExists=true，不产生新对象', async () => {
    const mem = createMemoryAdapter();
    const first = await putBlob(mem, CONTENT);
    const second = await putBlob(mem, Buffer.from(CONTENT)); // 同内容
    expect(second.alreadyExists).toBe(true);
    expect(second.sha256).toBe(first.sha256);
    expect(mem.store.size).toBe(1); // 去重：只有一个对象
  });

  it('不同内容 → 不同 sha256，各自存储', async () => {
    const mem = createMemoryAdapter();
    const a = await putBlob(mem, Buffer.from('AAAA'));
    const b = await putBlob(mem, Buffer.from('BBBB'));
    expect(a.sha256).not.toBe(b.sha256);
    expect(mem.store.size).toBe(2);
  });

  it('Readable 流内容 → 计算 sha256 并存储', async () => {
    const mem = createMemoryAdapter();
    const result = await putBlob(mem, Readable.from([CONTENT]));
    expect(result.size).toBe(CONTENT.length);
    expect(mem.store.has(getBlobStorageKey(result.sha256))).toBe(true);
  });
});

describe('getBlob / headBlob / deleteBlob', () => {
  it('getBlob 读回内容一致', async () => {
    const mem = createMemoryAdapter();
    const { sha256 } = await putBlob(mem, CONTENT);
    const got = await getBlob(mem, sha256);
    const body = await streamToBuf(got.body as Readable);
    expect(body.equals(CONTENT)).toBe(true);
    expect(got.size).toBe(CONTENT.length);
  });

  it('headBlob 不存在 → null', async () => {
    const mem = createMemoryAdapter();
    expect(await headBlob(mem, 'a'.repeat(64))).toBeNull();
  });

  it('deleteBlob 删除后 headBlob 为 null', async () => {
    const mem = createMemoryAdapter();
    const { sha256 } = await putBlob(mem, CONTENT);
    await deleteBlob(mem, sha256);
    expect(await headBlob(mem, sha256)).toBeNull();
  });

  it('getBlob 不存在 → ObjectNotFoundError', async () => {
    const mem = createMemoryAdapter();
    await expect(getBlob(mem, 'a'.repeat(64))).rejects.toThrow(ObjectNotFoundError);
  });
});
