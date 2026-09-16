import type { Prisma } from '@prisma/client';
import { parseDocumentSourceMapReference, type DocumentSourceMapReference } from '../research-intelligence/source-map-ref';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class SearchIndexSourceError extends Error {
  constructor() { super('[blocked] search source generation is unavailable'); }
}
export interface SourceMapSearchIndexPayload {
  artifactId: string;
  versionId: string;
  sourceTaskId: string;
  sourceExecutionAttempt: number;
  sourceMapRef: DocumentSourceMapReference;
}

export function parseSourceMapSearchIndexPayload(value: unknown): SourceMapSearchIndexPayload | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SearchIndexSourceError();
  const raw = value as Record<string, unknown>;
  // Existing explicitly supplied inline source maps retain their established handler.
  if (!('sourceTaskId' in raw) && !('sourceMapRef' in raw)) return undefined;
  const keys = ['artifactId', 'versionId', 'sourceTaskId', 'sourceExecutionAttempt', 'sourceMapRef'];
  if (Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key))
    || !['artifactId', 'versionId', 'sourceTaskId'].every(key => typeof raw[key] === 'string' && UUID.test(raw[key] as string))
    || !Number.isSafeInteger(raw.sourceExecutionAttempt) || Number(raw.sourceExecutionAttempt) < 1) throw new SearchIndexSourceError();
  let reference: DocumentSourceMapReference;
  try { reference = parseDocumentSourceMapReference(raw.sourceMapRef); } catch { throw new SearchIndexSourceError(); }
  if (reference.parserStatus !== 'succeeded' || reference.artifactId !== raw.artifactId) throw new SearchIndexSourceError();
  return { artifactId: raw.artifactId as string, versionId: raw.versionId as string,
    sourceTaskId: raw.sourceTaskId as string, sourceExecutionAttempt: raw.sourceExecutionAttempt as number, sourceMapRef: reference };
}

/** The derived job cannot outlive or silently switch the parsing generation it consumes. */
export async function assertSearchIndexSourceLive(
  core: Pick<Prisma.TransactionClient, 'agentTask'>,
  task: { sessionId: string; payload: unknown },
): Promise<{ payload: SourceMapSearchIndexPayload } | undefined> {
  const payload = parseSourceMapSearchIndexPayload(task.payload);
  if (!payload) return undefined;
  const source = await core.agentTask.findUnique({ where: { id: payload.sourceTaskId }, include: { session: true } });
  if (!source || source.deletedAt || source.session.deletedAt || source.sessionId !== task.sessionId
    || source.kind !== 'sdf.extract' || source.status !== 'succeeded'
    || source.executionAttempt !== payload.sourceExecutionAttempt) throw new SearchIndexSourceError();
  const sourcePayload = source.payload as Record<string, unknown>;
  if (sourcePayload.artifactId !== payload.artifactId || sourcePayload.researchObjectId !== source.session.researchObjectId) throw new SearchIndexSourceError();
  let reference: DocumentSourceMapReference;
  try { reference = parseDocumentSourceMapReference((source.result as Record<string, unknown> | null)?.sourceMapRef); }
  catch { throw new SearchIndexSourceError(); }
  if (JSON.stringify(reference) !== JSON.stringify(payload.sourceMapRef)) throw new SearchIndexSourceError();
  return { payload };
}
