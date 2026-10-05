import { expect, it, vi } from 'vitest';
import { reanalyzeConfirmedIngestion, confirmIngestionTask } from '../../src/ingestion/ingestion-service';
import { markTaskProgress } from '../../src/agent/agent';
import { resolveNativeSourceCorrectionExecution } from '../../src/ingestion/source-review-recovery';
import { requireNativeAgentExecutionAuthority } from '../../src/agent/native-agent-execution';
import { nativeSourceCorrectionFixture } from './native-source-correction-fixture';

it('creates a new paid private author revision from the confirmed Native source and replays without another debit', async () => {
  const f = await nativeSourceCorrectionFixture(); const before = structuredClone(f.db);
  const created = await reanalyzeConfirmedIngestion(f.deps, f.input as never);
  const replay = await reanalyzeConfirmedIngestion(f.deps, f.input as never);
  expect(replay).toEqual(created); expect(created.id).not.toBe(f.ids.source);
  const owner = f.db.agentTasks.find(task => task.id === created.agentTaskId)!;
  expect(owner).toMatchObject({ kind: 'sdf.extract', payload: { artifactId: f.ids.artifact, researchObjectId: f.ids.ro },
    result: { nativeAgentExecution: { profile: 'paper-author' } },
    idempotencyKey: `ingestion-analysis-reanalysis:${created.id}:${f.author.id}:source-fidelity` });
  expect(f.db.usageLedger).toHaveLength(before.usageLedger.length + 1);
  expect(f.db.agentTasks[0]).toEqual(before.agentTasks[0]);
  expect(f.db.ingestionTasks[0]).toEqual(before.ingestionTasks[0]);
  expect(f.db.versions).toEqual(before.versions); expect(f.db.hermesResearchRuns).toEqual(before.hermesResearchRuns);
  expect(f.db.auditLogs.find(row => row.action === 'ingestion.task.reanalyze')?.metadata).toMatchObject({
    intent: 'revise_saved_source', sourceAgentTaskId: f.author.id, newAgentTaskId: owner.id,
    authorCheckpointSha256: f.cp.serializedSha256, sourceMapSha256: f.ref.serializedSha256, confirmationPolicy: 'new_draft' });
});

it('preserves the normal confirmed-source reanalysis entry without a correction intent', async () => {
  const f = await nativeSourceCorrectionFixture();
  const created = await reanalyzeConfirmedIngestion(f.deps, { ...f.input, sourceReanalysis: undefined });
  expect(f.db.agentTasks.find(task => task.id === created.agentTaskId)?.idempotencyKey)
    .toBe(`ingestion-analysis-reanalysis:${created.id}:${f.author.id}`);
});

it('reanalyses a confirmed grounded source when its historical record lacks the v5 scientific review', async () => {
  const f = await nativeSourceCorrectionFixture();
  delete f.author.result.nativeAgentExecution;
  delete f.author.result.scientificReview;
  f.db.ingestionTasks[0]!.state = 'confirmed';
  const input = { userId: f.input.userId, taskId: f.input.taskId, sourceAgentTaskId: f.input.sourceAgentTaskId,
    processingConsent: true, idempotencyKey: 'confirmed-grounded-without-v5-review' };
  const created = await reanalyzeConfirmedIngestion(f.deps, input);
  expect(created.id).not.toBe(f.ids.source);
  expect(f.db.ingestionTasks[0]).toMatchObject({ state: 'confirmed', agentTaskId: f.author.id });
});

async function revisionFixture() {
  const f = await nativeSourceCorrectionFixture();
  const source = await reanalyzeConfirmedIngestion(f.deps, f.input);
  const owner = f.db.agentTasks.find(task => task.id === source.agentTaskId)!;
  Object.assign(owner, { status: 'running', executionAttempt: 1 });
  return { ...f, source, owner, binding: { ownerTaskId: owner.id, executionAttempt: 1 } };
}

it('completes an ordinary echo task with a custom source-fidelity suffix outside the correction namespace', async () => {
  const f = await nativeSourceCorrectionFixture();
  Object.assign(f.author, { kind: 'demo.echo', status: 'running', idempotencyKey: 'client:source-fidelity', result: null });
  const receipts = structuredClone(f.db.auditLogs); const transaction = vi.spyOn(f.prisma, '$transaction');
  await expect(markTaskProgress(f.deps, { taskId: f.author.id, status: 'succeeded', expectedExecutionAttempt: 1,
    result: { echoed: true } })).resolves.toMatchObject({ status: 'succeeded' });
  expect(f.db.auditLogs).toEqual(receipts);
  expect(transaction.mock.calls[0]?.[1]).toBeUndefined();
});

it('still rejects a task in the correction namespace after its kind changed', async () => {
  const f = await revisionFixture(); f.owner.kind = 'demo.echo'; const before = structuredClone(f.db);
  await expect(markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', expectedExecutionAttempt: 1,
    result: { echoed: true } })).rejects.toThrow();
  expect(f.db).toEqual(before);
});

it('rejects a malformed correction namespace key even if its receipt is absent', async () => {
  const f = await revisionFixture(); f.owner.idempotencyKey = 'ingestion-analysis-reanalysis:malformed:source-fidelity';
  f.db.auditLogs.splice(f.db.auditLogs.findIndex(row => row.action === 'ingestion.task.reanalyze'), 1);
  const before = structuredClone(f.db);
  await expect(resolveNativeSourceCorrectionExecution(f.prisma as never, f.binding)).rejects.toThrow();
  expect(f.db).toEqual(before);
});

it('binds the actual parent candidate/CP and same SourceMap in the ordinary Native execution authority', async () => {
  const f = await revisionFixture();
  const expected = { sourceAgentTaskId: f.author.id, authorCheckpointSha256: f.cp.serializedSha256,
    sourceMapRef: f.ref, sourceResult: f.author.result };
  expect(await resolveNativeSourceCorrectionExecution(f.prisma as never, f.binding)).toEqual(expected);
  expect((await requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.owner.id, executionAttempt: 1 })).sourceCorrection).toEqual(expected);
});

it.each(['receipt-missing', 'receipt-duplicate', 'intent-missing', 'key', 'author-cp', 'parent-current', 'parent-state',
  'parent-deleted', 'parent-session', 'map', 'membership', 'own-map', 'payload', 'debit', 'lease'])(
  'denies changed %s before Native execution without rewriting source or adding a debit', async change => {
    const f = await revisionFixture();
    const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.reanalyze')!;
    if (change === 'receipt-missing') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
    if (change === 'receipt-duplicate') f.db.auditLogs.push({ ...receipt, id: 'duplicate' });
    if (change === 'intent-missing') delete receipt.metadata.intent;
    if (change === 'key') f.owner.idempotencyKey = f.owner.idempotencyKey.replace(':source-fidelity', '');
    if (change === 'author-cp') f.cp.serializedSha256 = 'a'.repeat(64);
    if (change === 'parent-current') f.db.ingestionTasks[0]!.agentTaskId = f.owner.id;
    if (change === 'parent-state') f.db.ingestionTasks[0]!.state = 'needs_review';
    if (change === 'parent-deleted') f.author.deletedAt = new Date();
    if (change === 'parent-session') f.db.agentSessions[0]!.status = 'cancelled';
    if (change === 'map') f.author.result.sourceMapRef.serializedSha256 = 'f'.repeat(64);
    if (change === 'membership') f.db.memberships[0]!.role = 'viewer';
    if (change === 'own-map') f.owner.result.sourceMapRef = { ...f.ref, contentHash: 'f'.repeat(64) };
    if (change === 'payload') f.owner.payload = { ...f.owner.payload, mode: 'correction' };
    if (change === 'debit') f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${f.owner.id}`)!.delta = 0;
    if (change === 'lease') f.owner.executionAttempt = 2;
    const before = structuredClone(f.db);
    await expect(resolveNativeSourceCorrectionExecution(f.prisma as never, f.binding)).rejects.toThrow();
    await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.owner.id, executionAttempt: 1 })).rejects.toThrow();
    expect(f.db).toEqual(before);
  });

it('keeps normal replay separate from correction and charges no extra task for a reused conflicting client key', async () => {
  const f = await nativeSourceCorrectionFixture();
  const normal = await reanalyzeConfirmedIngestion(f.deps, { ...f.input, sourceReanalysis: undefined });
  const before = structuredClone(f.db);
  expect(await resolveNativeSourceCorrectionExecution(f.prisma as never, { ownerTaskId: normal.agentTaskId! })).toBeNull();
  await expect(reanalyzeConfirmedIngestion(f.deps, f.input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(f.db).toEqual(before);
});

async function terminalFixture() {
  const f = await revisionFixture();
  f.owner.result.sourceMapRef = f.ref;
  f.owner.result.nativeAgentExecution.checkpoint = { ...f.cp, taskId: f.owner.id, serializedSha256: '9'.repeat(64),
    objectKey: `derived/native-agent/${'9'.repeat(64)}.json` };
  const result = structuredClone(f.author.result); delete result.nativeAgentExecution;
  return { ...f, result };
}

it('does not downgrade a correction lease to ordinary paper understanding when its Native role changed', async () => {
  const f = await revisionFixture(); f.owner.result.nativeAgentExecution.profile = 'paper-understanding';
  const before = structuredClone(f.db);
  await expect(requireNativeAgentExecutionAuthority(f.prisma as never, { taskId: f.owner.id, executionAttempt: 1 })).rejects.toThrow();
  expect(f.db).toEqual(before);
});

it.each(['understanding', 'deleted'])('does not adopt a correction terminal after its Native marker was %s', async change => {
  const f = await terminalFixture();
  if (change === 'deleted') delete f.owner.result.nativeAgentExecution;
  else f.owner.result.nativeAgentExecution.profile = 'paper-understanding';
  const before = structuredClone(f.db);
  await expect(markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', expectedExecutionAttempt: 1, result: f.result })).rejects.toThrow();
  expect(f.db).toEqual(before);
});

it('does not confirm a completed correction whose Native marker was deleted', async () => {
  const f = await terminalFixture();
  await markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', expectedExecutionAttempt: 1, result: f.result });
  delete f.owner.result.nativeAgentExecution; const before = structuredClone(f.db);
  await expect(confirmIngestionTask(f.deps, { userId: f.input.userId, taskId: f.source.id,
    sourceAgentTaskId: f.owner.id, version: f.db.researchObjects[0]!.version, core: f.result.core })).rejects.toThrow();
  expect(f.db).toEqual(before);
});

it.each(['unchanged', 'parent-cp', 'receipt', 'permission'])('adopts the actual new author terminal only with unchanged %s authority', async change => {
  const f = await terminalFixture();
  if (change === 'parent-cp') f.cp.serializedSha256 = 'a'.repeat(64);
  if (change === 'receipt') f.db.auditLogs.splice(f.db.auditLogs.findIndex(row => row.action === 'ingestion.task.reanalyze'), 1);
  if (change === 'permission') f.db.memberships[0]!.role = 'viewer';
  const before = structuredClone(f.db); const transaction = vi.spyOn(f.prisma, '$transaction');
  const adopted = markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', expectedExecutionAttempt: 1, result: f.result });
  if (change === 'unchanged') {
    await expect(adopted).resolves.toMatchObject({ status: 'succeeded' });
    expect(f.owner.result.scientificReview).toMatchObject({ profile: 'paper-author', draftClaims: f.result.scientificReview.draftClaims });
    expect(f.owner.result.scientificReview).not.toHaveProperty('sourceAgentTaskId');
  } else { await expect(adopted).rejects.toThrow(); expect(f.db).toEqual(before); }
  expect(transaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: 'Serializable' });
});

it.each(['unchanged', 'parent-cp', 'receipt'])('revalidates completed correction %s during real private confirmation', async change => {
  const f = await terminalFixture();
  await markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', expectedExecutionAttempt: 1, result: f.result });
  if (change === 'parent-cp') f.cp.serializedSha256 = 'a'.repeat(64);
  if (change === 'receipt') f.db.auditLogs.splice(f.db.auditLogs.findIndex(row => row.action === 'ingestion.task.reanalyze'), 1);
  const before = structuredClone(f.db);
  const save = confirmIngestionTask(f.deps, { userId: f.input.userId, taskId: f.source.id,
    sourceAgentTaskId: f.owner.id, version: f.db.researchObjects[0]!.version, core: f.result.core });
  if (change === 'unchanged') {
    await expect(save).resolves.toHaveProperty('confirmation.versionId');
    expect(f.db.versions).toHaveLength(before.versions.length + 1);
    expect(f.db.ingestionTasks[0]).toEqual(before.ingestionTasks[0]); expect(f.db.agentTasks[0]).toEqual(before.agentTasks[0]);
  } else { await expect(save).rejects.toThrow(); expect(f.db).toEqual(before); }
});
