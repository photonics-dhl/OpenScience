import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { parsePresentationGenerationPayload, requirePresentationWriteScope } from '../assets/presentation-asset';

const RECOVERY = 'saved_science_candidate';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const fail = (): never => { throw new Error('[blocked] Saved science recovery evidence or authority changed'); };
type RecoveryDb = Pick<Prisma.TransactionClient, 'auditLog' | 'presentationAsset' | 'version' | 'workspace' | 'membership' | 'claimNode' | 'evidenceRecord'>;
type Owner = { id: string; payload: unknown; executionAttempt: number; retryCount: number; result: unknown };
export type SavedScienceIdentity = { payload: unknown; sourceEvidenceIdentity: string; claimContent: string;
  baseIdentity: string | null; narrativeSourceIdentity?: string };
type Candidate = { structuredAttempt: number; kind: 'schema_validation' | 'json_parse'; text: string; diagnostic: string };
export type StandaloneScienceDiagnostics = SavedScienceIdentity & { executionAttempt: number; candidates: Candidate[];
  sources: Array<{ sourceId: string; claimId: string; evidenceId: string; text: string; relation: string }> };

export function hasStandaloneScienceDiagnostics(result: unknown): boolean {
  return Object.hasOwn(record(result), 'storyboardScienceDiagnostics');
}

/** Private input only. This shape check grants no permission and accepts no successful checkpoint. */
export function readStandaloneScienceDiagnostics(result: unknown, payload: unknown, executionAttempt: number): StandaloneScienceDiagnostics {
  const root = record(result), d = record(root.storyboardScienceDiagnostics);
  const parsed = parsePresentationGenerationPayload(payload);
  if (parsed.hermesRunAuthority || parsed.kind !== 'interactive_html' || parsed.storyboard?.output !== 'image'
    || parsed.storyboard.narrative || parsed.storyboard.figurePlan || parsed.storyboard.revisionMode || parsed.storyboard.baseAssetId
    || parsed.storyboard.revisionTaskId || parsed.storyboard.revisionImageAssetId
    || Object.keys(root).join(',') !== 'storyboardScienceDiagnostics'
    || Object.keys(d).sort().join(',') !== ['payload', 'sourceEvidenceIdentity', 'claimContent', 'baseIdentity',
      'executionAttempt', 'sources', 'candidates', ...(d.narrativeSourceIdentity === undefined ? [] : ['narrativeSourceIdentity'])].sort().join(',')
    || !isDeepStrictEqual(d.payload, payload) || d.executionAttempt !== executionAttempt || d.baseIdentity !== null
    || typeof d.sourceEvidenceIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(d.sourceEvidenceIdentity)
    || typeof d.claimContent !== 'string' || (d.narrativeSourceIdentity !== undefined && typeof d.narrativeSourceIdentity !== 'string')
    || !Array.isArray(d.sources) || !d.sources.length || Buffer.byteLength(JSON.stringify(d.sources)) > 524_288
    || d.sources.some((raw, index) => { const s = record(raw); return Object.keys(s).sort().join(',') !== 'claimId,evidenceId,relation,sourceId,text'
      || ['claimId', 'evidenceId', 'relation', 'sourceId', 'text'].some(key => typeof s[key] !== 'string')
      || s.sourceId !== `s${index}` || !parsed.sourceClaimIds.includes(s.claimId as string); })
    || !Array.isArray(d.candidates) || d.candidates.length !== 3
    || d.candidates.some((raw, index) => { const c = record(raw); return Object.keys(c).sort().join(',') !== 'diagnostic,kind,structuredAttempt,text'
      || c.structuredAttempt !== index + 1 || !['schema_validation', 'json_parse'].includes(String(c.kind))
      || typeof c.text !== 'string' || !c.text || c.text.length > 131_072 || typeof c.diagnostic !== 'string' || c.diagnostic.length > 512; })
    || record(d.candidates.at(-1)).kind !== 'schema_validation') fail();
  return d as StandaloneScienceDiagnostics;
}

async function requireSource(db: RecoveryDb, actorId: string, payload: unknown, sources?: StandaloneScienceDiagnostics['sources']) {
  const p = parsePresentationGenerationPayload(payload);
  if (p.hermesRunAuthority || p.storyboard?.narrative || p.storyboard?.output !== 'image') fail();
  await requirePresentationWriteScope(db, { userId: actorId, researchObjectId: p.researchObjectId, versionId: p.versionId });
  const claims = await db.claimNode.findMany({ where: { id: { in: p.sourceClaimIds }, researchObjectId: p.researchObjectId, versionId: p.versionId } });
  if (claims.length !== p.sourceClaimIds.length || claims.some(c => c.extractionStatus !== 'succeeded')) fail();
  if (sources) {
    const evidence = await db.evidenceRecord.findMany({ where: { id: { in: sources.map(s => s.evidenceId) }, claimId: { in: p.sourceClaimIds } } });
    if (sources.some(s => !evidence.some(e => e.id === s.evidenceId && e.claimId === s.claimId
      && e.extractionStatus === 'succeeded' && e.exactQuote === s.text))) fail();
    // SourceMap headings may project raw `supports` to `context`. The worker
    // compares the complete current projection, including relations, before materialization.
  }
}

type Proof = { recoveryClass: typeof RECOVERY; taskId: string; sourceEvidenceIdentity: string;
  previousExecutionAttempt: number; authorizedExecutionAttempt: number; authorizedRetryCount: number;
  structuredAttempt: number; candidateHash: string; candidateBytes: number;
  planningAuditIds: string[]; rejectionAuditIds: string[]; noScienceSubmission: true; noProviderSwitch: true };

async function paidEvidence(db: RecoveryDb, taskId: string, actorId: string) {
  const calls = await db.auditLog.findMany({ where: { requestId: taskId, action: 'ai.gateway.call' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 4 });
  const rejections = await db.auditLog.findMany({ where: { action: 'presentation.storyboard_science_candidate_rejected',
    targetType: 'agent_task', targetId: taskId, actorId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 4 });
  return { calls, rejections };
}

/** Called only inside the existing retry transaction, after owner/session authorization. */
export async function inspectStandaloneScienceRecovery(db: RecoveryDb, task: Owner & { status: string; error: string | null; createdAt: Date; updatedAt: Date }, actorId: string): Promise<Proof> {
  if (task.status !== 'failed' || task.executionAttempt !== 1 || task.retryCount !== 0 || task.error !== '结构化输出超过重试上限') fail();
  const d = readStandaloneScienceDiagnostics(task.result, task.payload, task.executionAttempt);
  await requireSource(db, actorId, task.payload, d.sources);
  if (await db.presentationAsset.findUnique({ where: { id: task.id } })) fail();
  const { calls, rejections } = await paidEvidence(db, task.id, actorId);
  if (calls.length !== 3 || rejections.length !== 3) fail();
  const first = record(calls[0]!.metadata);
  for (const [i, c] of d.candidates.entries()) {
    const call = calls[i]!, rejection = rejections[i]!, m = record(call.metadata), r = record(rejection.metadata);
    if (call.actorId !== null || call.targetType !== 'ai_gateway' || m.operation !== 'text' || m.outcome !== 'succeeded'
      || m.error !== null || m.finishReason !== 'stop' || m.fallbackReason !== null || m.retryCount !== 0
      || typeof m.provider !== 'string' || !m.provider || typeof m.model !== 'string' || !m.model
      || m.provider !== first.provider || m.model !== first.model || typeof m.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(m.promptHash)
      || call.createdAt < task.createdAt || rejection.createdAt > task.updatedAt || call.createdAt > rejection.createdAt
      || i > 0 && call.createdAt < rejections[i - 1]!.createdAt
      || r.executionAttempt !== task.executionAttempt || r.structuredAttempt !== c.structuredAttempt || r.kind !== c.kind
      || r.candidateHash !== createHash('sha256').update(c.text).digest('hex') || r.candidateBytes !== Buffer.byteLength(c.text)) fail();
  }
  const last = record(rejections.at(-1)!.metadata);
  return { recoveryClass: RECOVERY, taskId: task.id, sourceEvidenceIdentity: d.sourceEvidenceIdentity,
    previousExecutionAttempt: task.executionAttempt, authorizedExecutionAttempt: 2, authorizedRetryCount: 1,
    structuredAttempt: 3, candidateHash: last.candidateHash as string, candidateBytes: last.candidateBytes as number,
    planningAuditIds: calls.map(c => c.id), rejectionAuditIds: rejections.map(r => r.id), noScienceSubmission: true, noProviderSwitch: true };
}

/** Reads server-produced authority, never a flag supplied in the task payload or diagnostics. */
export async function readStandaloneScienceRecovery(db: RecoveryDb, task: Owner, actorId: string, identity: SavedScienceIdentity,
  beforeSubmission: boolean) {
  const receipts = await db.auditLog.findMany({ where: { action: 'agent.task.retry', targetType: 'agent_task', targetId: task.id, actorId }, take: 2 });
  if (!receipts.length) return undefined;
  const receipt = receipts[0]!, proof = record(receipt.metadata) as unknown as Proof;
  if (proof.recoveryClass !== RECOVERY) return undefined;
  const result = record(task.result);
  const storedIdentity = record(result.storyboardScienceDiagnostics ?? result.storyboardPlanningCheckpoint ?? result.storyboardCheckpoint);
  if (receipts.length !== 1 || task.executionAttempt !== 2 || task.retryCount !== 1 || proof.taskId !== task.id
    || proof.previousExecutionAttempt !== 1 || proof.authorizedExecutionAttempt !== task.executionAttempt || proof.authorizedRetryCount !== task.retryCount
    || proof.structuredAttempt !== 3 || proof.noScienceSubmission !== true || proof.noProviderSwitch !== true
    || identity.baseIdentity !== null || proof.sourceEvidenceIdentity !== identity.sourceEvidenceIdentity
    || storedIdentity.narrativeSourceIdentity !== identity.narrativeSourceIdentity
    || Object.entries(identity).some(([key, value]) => !isDeepStrictEqual(storedIdentity[key], value))
    || !isDeepStrictEqual(storedIdentity.payload, task.payload) || !Array.isArray(proof.planningAuditIds) || proof.planningAuditIds.length !== 3
    || !Array.isArray(proof.rejectionAuditIds) || proof.rejectionAuditIds.length !== 3) fail();
  await requireSource(db, actorId, task.payload);
  if (await db.presentationAsset.findUnique({ where: { id: task.id } })) fail();
  const calls = await db.auditLog.findMany({ where: { requestId: task.id, action: 'ai.gateway.call',
    ...(beforeSubmission ? {} : { id: { in: proof.planningAuditIds } }) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 4 });
  const rejected = await db.auditLog.findMany({ where: { action: 'presentation.storyboard_science_candidate_rejected',
    actorId, targetType: 'agent_task', targetId: task.id, id: { in: proof.rejectionAuditIds } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 4 });
  const firstCall = record(calls[0]?.metadata);
  if (!isDeepStrictEqual(calls.map(c => c.id), proof.planningAuditIds)
    || !isDeepStrictEqual(rejected.map(r => r.id), proof.rejectionAuditIds)
    || calls.some(c => { const m = record(c.metadata); return c.createdAt >= receipt.createdAt || c.actorId !== null
      || c.targetType !== 'ai_gateway' || m.outcome !== 'succeeded' || m.provider !== firstCall.provider || m.model !== firstCall.model
      || typeof m.provider !== 'string' || !m.provider || typeof m.model !== 'string' || !m.model
      || m.operation !== 'text' || m.finishReason !== 'stop' || m.error !== null || m.fallbackReason !== null || m.retryCount !== 0; })
    || rejected.some(r => r.createdAt > receipt.createdAt)
    || record(rejected.at(-1)?.metadata).candidateHash !== proof.candidateHash
    || record(rejected.at(-1)?.metadata).candidateBytes !== proof.candidateBytes) fail();
  let diagnostics: StandaloneScienceDiagnostics | undefined;
  if (hasStandaloneScienceDiagnostics(task.result)) {
    diagnostics = readStandaloneScienceDiagnostics(task.result, task.payload, proof.previousExecutionAttempt);
    if (diagnostics.narrativeSourceIdentity !== identity.narrativeSourceIdentity
      || Object.entries(identity).some(([key, value]) => !isDeepStrictEqual(record(diagnostics)[key], value))) fail();
    const candidate = diagnostics.candidates.at(-1)!;
    if (createHash('sha256').update(candidate.text).digest('hex') !== proof.candidateHash || Buffer.byteLength(candidate.text) !== proof.candidateBytes) fail();
  }
  return { receiptId: receipt.id, metadata: receipt.metadata, diagnostics };
}
