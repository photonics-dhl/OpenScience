import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  issueTemporaryDownloadToken,
  verifyTemporaryDownloadToken,
} from '../../src/retrieval/signed-links';

const secret = 'task10-test-secret-that-is-at-least-32-bytes';
const documentId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const accessId = '44444444-4444-4444-8444-444444444444';
const keyId = 'download-v1';
const now = new Date('2026-08-30T00:00:00.000Z');

const audience = { documentId, userId, workspaceId, accessId, keyId };

describe('temporary download capabilities', () => {
  it('issues a user-bound token for at most ten minutes', () => {
    const issued = issueTemporaryDownloadToken({ secret, ...audience, now });
    expect(issued.expiresAt.toISOString()).toBe('2026-08-30T00:10:00.000Z');
    expect(issued.tokenHash).toBe(createHash('sha256').update(issued.token).digest('hex'));
    expect(verifyTemporaryDownloadToken({ secret, token: issued.token, ...audience, now })).toMatchObject({
      documentId, userId, workspaceId, accessId, keyId, aud: 'temporary-document-download',
    });
  });

  it('rejects a TTL above 600 seconds', () => {
    expect(() => issueTemporaryDownloadToken({ secret, ...audience, now, ttlSeconds: 601 }))
      .toThrow('TTL');
  });

  it('rejects a different user, tampering, and expiry', () => {
    const issued = issueTemporaryDownloadToken({ secret, ...audience, now });
    expect(() => verifyTemporaryDownloadToken({
      secret, token: issued.token, ...audience, userId: '55555555-5555-4555-8555-555555555555', now,
    })).toThrow('audience');
    expect(() => verifyTemporaryDownloadToken({
      secret, token: issued.token.slice(0, -1) + (issued.token.endsWith('a') ? 'b' : 'a'), ...audience, now,
    })).toThrow('signature');
    expect(() => verifyTemporaryDownloadToken({
      secret, token: issued.token, ...audience, now: new Date('2026-08-30T00:10:01.000Z'),
    })).toThrow('expired');
  });

  it('requires a non-trivial signing secret', () => {
    expect(() => issueTemporaryDownloadToken({ secret: 'short', ...audience, now }))
      .toThrow('secret');
  });

  it('creates distinct capabilities for distinct access audit rows', () => {
    const first = issueTemporaryDownloadToken({ secret, ...audience, now });
    const second = issueTemporaryDownloadToken({
      secret, ...audience, accessId: '66666666-6666-4666-8666-666666666666', now,
    });
    expect(first.token).not.toBe(second.token);
  });
});
