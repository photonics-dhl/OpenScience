import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MAX_DOWNLOAD_TOKEN_TTL_SECONDS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DownloadTokenPayload {
  v: 1;
  aud: 'temporary-document-download';
  keyId: string;
  accessId: string;
  workspaceId: string;
  documentId: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('download signing secret is too short');
}

function validateUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new Error(`${label} is invalid`);
}

function signature(secret: string, encodedPayload: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function parsePayload(encoded: string): DownloadTokenPayload {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('download token payload is invalid');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('download token payload is invalid');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'accessId,aud,documentId,expiresAt,issuedAt,keyId,userId,v,workspaceId'
    || record.v !== 1
    || record.aud !== 'temporary-document-download'
    || typeof record.keyId !== 'string'
    || typeof record.accessId !== 'string'
    || typeof record.workspaceId !== 'string'
    || typeof record.documentId !== 'string'
    || typeof record.userId !== 'string'
    || !Number.isInteger(record.issuedAt)
    || !Number.isInteger(record.expiresAt)) {
    throw new Error('download token payload is invalid');
  }
  return record as unknown as DownloadTokenPayload;
}

export function issueTemporaryDownloadToken(input: {
  secret: string;
  keyId: string;
  accessId: string;
  workspaceId: string;
  documentId: string;
  userId: string;
  now?: Date;
  ttlSeconds?: number;
}): { token: string; tokenHash: string; expiresAt: Date } {
  validateSecret(input.secret);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(input.keyId)) throw new Error('download signing keyId is invalid');
  validateUuid(input.accessId, 'accessId');
  validateUuid(input.workspaceId, 'workspaceId');
  validateUuid(input.documentId, 'documentId');
  validateUuid(input.userId, 'userId');
  const ttlSeconds = input.ttlSeconds ?? MAX_DOWNLOAD_TOKEN_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_DOWNLOAD_TOKEN_TTL_SECONDS) {
    throw new Error('download token TTL must be between 1 and 600 seconds');
  }
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload: DownloadTokenPayload = {
    v: 1,
    aud: 'temporary-document-download',
    keyId: input.keyId,
    accessId: input.accessId,
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    userId: input.userId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const token = `${encodedPayload}.${signature(input.secret, encodedPayload)}`;
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(payload.expiresAt * 1000),
  };
}

export function verifyTemporaryDownloadToken(input: {
  secret: string;
  keyId: string;
  accessId: string;
  workspaceId: string;
  token: string;
  documentId: string;
  userId: string;
  now?: Date;
}): DownloadTokenPayload {
  validateSecret(input.secret);
  validateUuid(input.accessId, 'accessId');
  validateUuid(input.workspaceId, 'workspaceId');
  validateUuid(input.documentId, 'documentId');
  validateUuid(input.userId, 'userId');
  const parts = input.token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('download token format is invalid');
  const expected = Buffer.from(signature(input.secret, parts[0]), 'base64url');
  let provided: Buffer;
  try {
    provided = Buffer.from(parts[1], 'base64url');
  } catch {
    throw new Error('download token signature is invalid');
  }
  if (provided.toString('base64url') !== parts[1]
    || provided.length !== expected.length
    || !timingSafeEqual(provided, expected)) {
    throw new Error('download token signature is invalid');
  }
  const payload = parsePayload(parts[0]);
  validateUuid(payload.documentId, 'documentId');
  validateUuid(payload.userId, 'userId');
  validateUuid(payload.accessId, 'accessId');
  validateUuid(payload.workspaceId, 'workspaceId');
  if (payload.aud !== 'temporary-document-download'
    || payload.keyId !== input.keyId
    || payload.accessId !== input.accessId
    || payload.workspaceId !== input.workspaceId
    || payload.documentId !== input.documentId
    || payload.userId !== input.userId) {
    throw new Error('download token audience is invalid');
  }
  if (payload.expiresAt <= payload.issuedAt
    || payload.expiresAt - payload.issuedAt > MAX_DOWNLOAD_TOKEN_TTL_SECONDS) {
    throw new Error('download token TTL is invalid');
  }
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (payload.issuedAt > now + 30) throw new Error('download token issuedAt is invalid');
  if (now >= payload.expiresAt) throw new Error('download token expired');
  return payload;
}
