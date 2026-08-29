import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import {
  loadDocumentSourceMapReference,
  persistDocumentSourceMapReference,
} from '../../src/research-intelligence/source-map-ref';

const sourceMap = {
  artifactId: 'artifact-1',
  contentHash: 'a'.repeat(64),
  parser: { name: 'fixture-parser', version: '1' },
  pages: [{
    page: 1,
    width: 600,
    height: 800,
    blocks: [{
      id: 'block-1',
      kind: 'paragraph' as const,
      text: 'The measured lifetime is 43 fs.',
      boundingBox: { x: 10, y: 20, width: 300, height: 30 },
      parser: { name: 'fixture-parser', version: '1' },
      transformations: [],
    }],
  }],
};

function memoryStorage(): StorageAdapter & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    putObject: vi.fn(async (key, body) => {
      const chunks: Buffer[] = [];
      if (Buffer.isBuffer(body)) chunks.push(body);
      else for await (const chunk of body) chunks.push(Buffer.from(chunk));
      const value = Buffer.concat(chunks);
      objects.set(key, value);
      return { key, size: value.length, etag: 'fixture' };
    }),
    getObject: vi.fn(async (key) => {
      const value = objects.get(key);
      if (!value) throw new Error('missing');
      return { body: Readable.from([value]), size: value.length };
    }),
    headObject: vi.fn(async (key) => {
      const value = objects.get(key);
      return value ? { size: value.length, etag: 'fixture' } : null;
    }),
    deleteObject: vi.fn(async () => undefined),
  };
}

describe('trusted DocumentSourceMap references', () => {
  it('stores canonical JSON by digest and round-trips through bounded verification', async () => {
    const storage = memoryStorage();
    const reference = await persistDocumentSourceMapReference(storage, sourceMap, 'succeeded');

    expect(reference).toMatchObject({
      schemaVersion: 1,
      parserStatus: 'succeeded',
      artifactId: 'artifact-1',
      contentHash: 'a'.repeat(64),
      objectKey: expect.stringMatching(/^derived\/source-maps\/[a-f0-9]{64}\.json$/),
      serializedSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(loadDocumentSourceMapReference(storage, reference)).resolves.toEqual(sourceMap);
  });

  it('rejects a forged key and tampered stored bytes', async () => {
    const storage = memoryStorage();
    const reference = await persistDocumentSourceMapReference(storage, sourceMap, 'succeeded');

    await expect(loadDocumentSourceMapReference(storage, { ...reference, objectKey: 'blobs/private' }))
      .rejects.toThrow(/objectKey/i);
    const tampered = Buffer.from(storage.objects.get(reference.objectKey)!);
    tampered[tampered.length - 2] ^= 1;
    storage.objects.set(reference.objectKey, tampered);
    await expect(loadDocumentSourceMapReference(storage, reference)).rejects.toThrow(/digest/i);
  });

  it('rejects an object larger than the declared or allowed size before parsing', async () => {
    const storage = memoryStorage();
    const reference = await persistDocumentSourceMapReference(storage, sourceMap, 'needs_review');
    storage.getObject = vi.fn(async () => ({ body: Readable.from([Buffer.alloc(reference.size + 1)]), size: reference.size + 1 }));

    await expect(loadDocumentSourceMapReference(storage, reference)).rejects.toThrow(/size/i);
  });
});
