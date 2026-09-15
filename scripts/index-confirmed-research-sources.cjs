// Explicit repair for the two authorized real papers. Default mode only reads IDs/status.
const { createRequire } = require('node:module');
const read = createRequire(`${process.cwd()}/package.json`);
const { createPrismaClient, createRedisClient, createPrismaAuditSink } = read('@openscience/database');
const { Prisma } = read('@prisma/client');
const domain = read('@openscience/domain');
const core = createPrismaClient();
const scope = ['9067a2d5-42ad-4c06-b234-753728b71064', 'c896802c-35dd-4b59-8db1-5f374f83a6d8'];
const apply = process.argv.includes('--apply');
const retryIncomplete = apply && process.argv.includes('--retry-incomplete');
let redis;
(async () => {
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
  .finally(async () => { await core.$disconnect(); if (redis) await redis.quit(); });
