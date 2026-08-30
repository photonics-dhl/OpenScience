import { describe, expect, it } from 'vitest';
import {
  TEMPORARY_DOCUMENT_TTL_MS,
  buildTemporaryDocumentObjectKey,
  temporaryDocumentExpiresAt,
} from '../../src/retrieval/temporary-document';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const contentHash = 'a'.repeat(64);

describe('temporary document boundary', () => {
  it('uses the private tenant/document/hash key and exact 72-hour TTL', () => {
    expect(buildTemporaryDocumentObjectKey({ workspaceId, documentId, contentHash }))
      .toBe(`hermes-cache/${workspaceId}/${documentId}/${contentHash}`);
    expect(TEMPORARY_DOCUMENT_TTL_MS).toBe(72 * 60 * 60 * 1000);
    expect(temporaryDocumentExpiresAt(new Date('2026-08-30T00:00:00.000Z')).toISOString())
      .toBe('2026-09-02T00:00:00.000Z');
  });

  it('rejects path fragments and invalid hashes', () => {
    expect(() => buildTemporaryDocumentObjectKey({
      workspaceId: '../outside', documentId, contentHash,
    })).toThrow('workspaceId');
    expect(() => buildTemporaryDocumentObjectKey({
      workspaceId, documentId, contentHash: 'not-a-hash',
    })).toThrow('contentHash');
  });
});
