import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { persistDocumentSourceMapReference } from '../src/research-intelligence/source-map-ref';
import { confirmSourceIdentity, projectSourceIdentity, type SourceIdentityProposal } from '../src/ingestion/source-identity';

const artifactId = 'artifact-1';
const contentHash = 'a'.repeat(64);
const locator = (blockId: string, start: number, end: number) => ({ artifactId, contentHash, page: 1, blockId,
  charRange: { start, end }, boundingBox: { x: 0, y: 0, width: 100, height: 20 } });
const empty = (value: string | string[]) => ({ state: 'not_extracted' as const, value, evidenceSegments: [] });
const proposal = (segments = [{ quote: 'Paper title', sourceLocator: locator('b1', 0, 11) }]): SourceIdentityProposal => ({
  schemaVersion: '0.1.0',
  title: { state: 'proposed', value: 'Paper title', evidenceSegments: segments },
  authors: empty([]), doi: empty(''), articleLicense: empty(''),
});

async function fixture() {
  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: vi.fn(async (key, body) => { const bytes = Buffer.isBuffer(body) ? body : Buffer.concat(await (body as Readable).toArray()); objects.set(key, bytes); return { key, size: bytes.length, etag: 'test' }; }),
    getObject: vi.fn(async key => { const bytes = objects.get(key); if (!bytes) throw new Error('missing'); return { body: Readable.from([bytes]), size: bytes.length }; }),
    headObject: vi.fn(async key => objects.has(key) ? { size: objects.get(key)!.length, etag: 'test' } : null),
    deleteObject: vi.fn(async key => { objects.delete(key); }),
  };
  const sourceMapRef = await persistDocumentSourceMapReference(storage, { artifactId, contentHash,
    parser: { name: 'fixture', version: '1' }, pages: [{ page: 1, width: 600, height: 800, blocks: [
      { id: 'b1', kind: 'paragraph', text: 'Paper title', boundingBox: { x: 0, y: 0, width: 100, height: 20 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
      { id: 'b2', kind: 'paragraph', text: 'Second line', boundingBox: { x: 0, y: 30, width: 100, height: 20 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
    ] }] }, 'succeeded');
  return { storage, sourceMapRef };
}

describe('source identity confirmation', () => {
  it('requires explicit review and records only selected proposed fields', async () => {
    const { storage, sourceMapRef } = await fixture();
    const result = { sourceMapRef, sourceIdentity: proposal() };
    const projected = projectSourceIdentity({ taskId: 'task-1', artifactId, contentHash, result })!;
    expect(projected.sourceIdentityToken).toMatch(/^[a-f0-9]{64}$/);
    await expect(confirmSourceIdentity({ storage, taskId: 'task-1', artifactId, contentHash, result })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const snapshot = await confirmSourceIdentity({ storage, taskId: 'task-1', artifactId, contentHash, result,
      review: { token: projected.sourceIdentityToken, acceptedFields: ['title'] } });
    expect(snapshot).toMatchObject({ reviewed: true, title: { state: 'recorded', value: 'Paper title' },
      authors: { state: 'not_recorded', value: [] } });
    expect(JSON.stringify(snapshot)).not.toContain('verified');
  });

  it.each([
    ['changed quote', proposal([{ quote: 'Wrong title', sourceLocator: locator('b1', 0, 11) }])],
    ['reversed blocks', proposal([{ quote: 'Second line', sourceLocator: locator('b2', 0, 11) }, { quote: 'Paper title', sourceLocator: locator('b1', 0, 11) }])],
  ])('rejects %s instead of freezing ungrounded metadata', async (_name, sourceIdentity) => {
    const { storage, sourceMapRef } = await fixture();
    const result = { sourceMapRef, sourceIdentity };
    const { sourceIdentityToken: token } = projectSourceIdentity({ taskId: 'task-1', artifactId, contentHash, result })!;
    await expect(confirmSourceIdentity({ storage, taskId: 'task-1', artifactId, contentHash, result,
      review: { token, acceptedFields: ['title'] } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a stale proposal token before loading source evidence', async () => {
    const { storage, sourceMapRef } = await fixture();
    const result = { sourceMapRef, sourceIdentity: proposal() };
    await expect(confirmSourceIdentity({ storage, taskId: 'task-1', artifactId, contentHash, result,
      review: { token: '0'.repeat(64), acceptedFields: ['title'] } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(storage.getObject).not.toHaveBeenCalled();
  });
});
