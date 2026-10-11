// Explicit repair for the two authorized real papers. Default mode only reads IDs/status.
// --recover-token-limit-task <original-owner UUID> plans the single historical
// recovery below; add --apply to reuse its remaining budget without re-enqueueing.
const { createRequire } = require('node:module');
const read = createRequire(`${process.cwd()}/package.json`);
const { createPrismaClient, createRedisClient, createPrismaAuditSink } = read('@openscience/database');
const { Prisma } = read('@prisma/client');
const domain = read('@openscience/domain');
const core = createPrismaClient();
const scope = ['9067a2d5-42ad-4c06-b234-753728b71064', 'c896802c-35dd-4b59-8db1-5f374f83a6d8'];
const apply = process.argv.includes('--apply');
const retryIncomplete = apply && process.argv.includes('--retry-incomplete');
const recoverySelector = process.argv.indexOf('--recover-token-limit-task');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recoveryTaskId = recoverySelector === -1 ? undefined : process.argv[recoverySelector + 1]?.toLowerCase();
let redis;
let search;
(async () => {
  const seen = new Set();
  for (let index = 2; index < process.argv.length; index += 1) {
    const option = process.argv[index];
    if (!['--apply', '--retry-incomplete', '--recover-token-limit-task'].includes(option) || seen.has(option)) {
      throw new Error('source_index_arguments_invalid');
    }
    seen.add(option);
    if (option === '--recover-token-limit-task' && !UUID.test(process.argv[++index] ?? '')) {
      throw new Error('token_limit_recovery_selector_invalid');
    }
  }
  if (recoverySelector !== -1 && seen.has('--retry-incomplete')) {
    throw new Error('token_limit_recovery_selector_invalid');
  }
  // This branch never runs the historical two-paper enqueue loop. The retry
  // transaction revalidates the original producer/owner binding before dispatch.
  if (recoverySelector !== -1) {
    const task = await core.agentTask.findUnique({
      where: { id: recoveryTaskId }, include: { session: { include: { researchObject: true } } },
    });
    const ro = task?.session?.researchObject;
    if (!task || task.id !== recoveryTaskId || task.deletedAt || task.kind !== 'search.index'
      || task.status !== 'succeeded' || task.result?.status !== 'needs_review'
      || task.result.errorCode !== 'token_limit_exceeded' || task.retryCount >= 2
      || task.session.deletedAt || task.session.status !== 'active' || !ro || ro.deletedAt
      || task.session.researchObjectId !== ro.id || !scope.includes(ro.id)) {
      throw new Error('token_limit_recovery_owner_unavailable');
    }
    const payload = domain.parseSourceMapSearchIndexPayload(task.payload);
    if (!payload) throw new Error('token_limit_recovery_source_unavailable');
    const { createSearchPrismaClient, loadSearchIndexRuntimeConfig } = require('../packages/search/dist/index.js');
    const runtime = loadSearchIndexRuntimeConfig();
    if (!runtime.enabled) throw new Error('token_limit_recovery_model_unavailable');
    search = createSearchPrismaClient();
    const currentGenerations = await search.searchIndexTask.findMany({
      where: { workspaceId: ro.workspaceId, researchObjectId: ro.id, artifactId: payload.artifactId, isCurrent: true },
      include: { modelVersion: true }, take: 2,
    });
    // A current row validates the requested owner; it never selects another task.
    const generation = currentGenerations.length === 1 ? currentGenerations[0] : undefined;
    const identity = runtime.modelIdentity;
    const model = generation?.modelVersion;
    if (!generation || !generation.isCurrent
      || generation.status !== 'needs_review' || generation.errorCode !== 'embedding_unavailable'
      || generation.attemptCount >= 3 || generation.fenceOwnerTaskId !== task.id
      || generation.fenceOwnerAttempt !== task.executionAttempt
      || generation.fenceOwnerCreatedAt?.getTime() !== task.createdAt.getTime()
      || generation.workspaceId !== ro.workspaceId || generation.researchObjectId !== ro.id
      || generation.artifactId !== payload.artifactId || generation.sourceVersionId !== payload.versionId
      || generation.contentHash !== payload.sourceMapRef.contentHash
      || generation.modelVersionId !== identity.modelVersionId || !model
      || model.id !== identity.modelVersionId || model.status !== 'active'
      || model.provider !== 'BAAI' || model.model !== 'bge-m3' || model.dimension !== 1024
      || model.revision !== identity.modelRevision || model.sourceSha256 !== identity.sourceSha256
      || model.packageFreezeSha256 !== identity.packageFreezeSha256
      || model.modelManifestSha256 !== identity.modelManifestSha256) {
      throw new Error('token_limit_recovery_generation_unavailable');
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'plan', taskId: task.id, generationId: generation.id,
      researchObjectId: ro.id, artifactId: payload.artifactId, versionId: payload.versionId,
      sourceTaskId: payload.sourceTaskId, parserExecutionAttempt: payload.sourceExecutionAttempt,
      indexExecutionAttempt: task.executionAttempt, retryCount: task.retryCount,
      storageAttemptCount: generation.attemptCount, modelVersionId: generation.modelVersionId,
      sourceGenerationSha256: generation.sourceGenerationSha256 }));
    if (!apply) return;
    redis = createRedisClient(process.env.REDIS_URL);
    const retried = await domain.retryAgentTask({ prisma: core, redis, audit: createPrismaAuditSink(core) }, {
      userId: task.session.userId, taskId: task.id, sourceIndexRecovery: 'token-limit-after-upgrade',
    });
    console.log(JSON.stringify({ taskId: task.id, status: retried.status, retryCount: retried.retryCount, retried: true }));
    return;
  }
  const tasks = await core.ingestionTask.findMany({
    where: { state: 'confirmed', batch: { researchObjectId: { in: scope } } },
    select: { id: true, artifactId: true, agentTaskId: true,
      batch: { select: { userId: true, researchObjectId: true, researchObject: { select: { workspaceId: true, deletedAt: true } } } },
      artifact: { select: { deletedAt: true, bytesPurgedAt: true, blobSha256: true } },
      agentTask: { select: { id: true, status: true, executionAttempt: true, deletedAt: true,
        session: { select: { deletedAt: true, status: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  const plans = [];
  for (const task of tasks) {
    const sourceRows = task.agentTaskId ? await core.$queryRaw(Prisma.sql`
      SELECT result->'sourceMapRef' AS reference, payload->>'artifactId' AS artifact_id,
             payload->>'researchObjectId' AS research_object_id
      FROM agent_tasks WHERE id = ${task.agentTaskId}::uuid
    `) : [];
    const version = await core.version.findFirst({
      where: { researchObjectId: task.batch.researchObjectId, commit: { idempotencyKey: `ingestion-confirm:${task.id}` },
        manifest: { entries: { some: { artifactId: task.artifactId, blobSha256: task.artifact.blobSha256 } } } },
      select: { id: true, versionNo: true },
    });
    let reference;
    try { reference = domain.parseDocumentSourceMapReference(sourceRows[0]?.reference); } catch { /* Report only fixed eligibility below. */ }
    const live = !task.batch.researchObject.deletedAt && !task.artifact.deletedAt && !task.artifact.bytesPurgedAt
      && task.agentTask && !task.agentTask.deletedAt && !task.agentTask.session.deletedAt && task.agentTask.session.status === 'active';
    const matches = reference?.artifactId === task.artifactId && reference?.contentHash === task.artifact.blobSha256
      && sourceRows[0]?.artifact_id === task.artifactId && sourceRows[0]?.research_object_id === task.batch.researchObjectId;
    const eligible = Boolean(live && version && matches && reference?.parserStatus === 'succeeded'
      && task.agentTask?.status === 'succeeded' && task.agentTask.executionAttempt > 0);
    plans.push({ researchObjectId: task.batch.researchObjectId, ingestionTaskId: task.id,
      artifactId: task.artifactId, sourceTaskId: task.agentTaskId, sourceExecutionAttempt: task.agentTask?.executionAttempt ?? null,
      userId: task.batch.userId, versionId: version?.id ?? null, versionNo: version?.versionNo ?? null,
      sourceStatus: task.agentTask?.status ?? null, parserStatus: reference?.parserStatus ?? null, eligible,
      reason: eligible ? null : !live ? 'source_not_live' : !version ? 'confirmation_version_missing'
        : !reference ? 'source_reference_missing' : !matches ? 'source_identity_mismatch' : 'source_not_ready',
    });
  }
  const selectedByArtifact = new Map();
  for (const plan of plans.filter(plan => plan.eligible)) {
    const key = `${plan.researchObjectId}:${plan.artifactId}`;
    const previous = selectedByArtifact.get(key);
    if (!previous || plan.versionNo > previous.versionNo) selectedByArtifact.set(key, plan);
  }
  const selected = [...selectedByArtifact.values()];
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'plan', scope, plans,
    selected: selected.map(({ researchObjectId, ingestionTaskId, sourceTaskId, versionId, artifactId }) =>
      ({ researchObjectId, ingestionTaskId, sourceTaskId, versionId, artifactId })) }));
  if (!apply) return;
  if (typeof domain.enqueueSourceMapSearchIndex !== 'function') throw new Error('producer_unavailable');
  if (scope.some(id => !selected.some(plan => plan.researchObjectId === id))) throw new Error('confirmed_source_unavailable');
  redis = createRedisClient(process.env.REDIS_URL);
  const deps = { prisma: core, redis, audit: createPrismaAuditSink(core) };
  for (const plan of selected) {
    const result = await domain.enqueueSourceMapSearchIndex(deps, {
      userId: plan.userId, sourceTaskId: plan.sourceTaskId, versionId: plan.versionId,
    });
    console.log(JSON.stringify({ researchObjectId: plan.researchObjectId, artifactId: plan.artifactId, ...result }));
    if (retryIncomplete) {
      const task = await domain.getAgentTask(deps, { userId: plan.userId, taskId: result.taskId });
      if (task.canRetry) {
        const retried = await domain.retryAgentTask(deps, { userId: plan.userId, taskId: result.taskId });
        console.log(JSON.stringify({ researchObjectId: plan.researchObjectId, taskId: result.taskId, status: retried.status, retried: true }));
      }
    }
  }
})().catch(() => { console.error('confirmed_source_index_operation_failed'); process.exitCode = 1; })
  .finally(async () => { await core.$disconnect(); if (search) await search.$disconnect(); if (redis) await redis.quit(); });
