export const TEMPORARY_DOCUMENT_TTL_MS = 72 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

function uuid(value: string, label: string): string {
  if (!UUID.test(value)) throw new Error(`${label} is invalid`);
  return value.toLowerCase();
}

export function buildTemporaryDocumentObjectKey(input: {
  workspaceId: string;
  documentId: string;
  contentHash: string;
}): string {
  const workspaceId = uuid(input.workspaceId, 'workspaceId');
  const documentId = uuid(input.documentId, 'documentId');
  const contentHash = input.contentHash.toLowerCase();
  if (!SHA256.test(contentHash)) throw new Error('contentHash is invalid');
  return `hermes-cache/${workspaceId}/${documentId}/${contentHash}`;
}

export function temporaryDocumentExpiresAt(now: Date = new Date()): Date {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new Error('now is invalid');
  return new Date(timestamp + TEMPORARY_DOCUMENT_TTL_MS);
}
