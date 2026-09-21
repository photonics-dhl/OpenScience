import type { Prisma } from '@prisma/client';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';

export type SavedIngestionOrigin = { executor: 'human' } | { executor: 'hermes'; runId: string };
type SavedSourceReader = Pick<Prisma.TransactionClient, 'commit' | 'version' | 'ingestionTask' | 'hermesResearchRun'>;

/** Read a persisted source version; this neither confirms a proposal nor starts analysis. */
export async function findSavedIngestionCommit(prisma: SavedSourceReader, input: {
  taskId: string; researchObjectId: string; idempotencyKey?: string;
}) {
  const manualKey = `ingestion-confirm:${input.taskId}`;
  const readCommit = async (key: string) => {
    const commit = await prisma.commit.findUnique({ where: { idempotencyKey: key } });
    if (!commit || commit.researchObjectId !== input.researchObjectId) return null;
    const version = await prisma.version.findFirst({ where: { commitId: commit.id, researchObjectId: input.researchObjectId },
      include: { manifest: { include: { entries: true } } } });
    if (!version?.manifest) return null;
    return { commit, version, manifest: version.manifest };
  };
  // A save replay may only read its exact key. Unkeyed history reads select the
  // newest valid version, including later Hermes materialization of a human-saved source.
  let latest: (NonNullable<Awaited<ReturnType<typeof readCommit>>> & { origin: SavedIngestionOrigin }) | null = null;
  if (input.idempotencyKey === undefined || input.idempotencyKey === manualKey) {
    const manual = await readCommit(manualKey);
    if (manual) latest = { ...manual, origin: { executor: 'human' } };
    if (input.idempotencyKey !== undefined) return latest;
  }
  const explicitRun = input.idempotencyKey === undefined ? undefined
    : /^hermes-ingestion:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(input.idempotencyKey);
  if (input.idempotencyKey !== undefined && (!explicitRun || explicitRun[2] !== input.taskId)) return null;
  const task = await prisma.ingestionTask.findUnique({ where: { id: input.taskId },
    include: { artifact: true, batch: { include: { researchObject: true } }, agentTask: { include: { session: true } } } });
  if (!task || task.state !== 'confirmed' || task.batch.researchObjectId !== input.researchObjectId
    || task.batch.researchObject.deletedAt || task.artifact.deletedAt || task.artifact.bytesPurgedAt
    || task.artifact.workspaceId !== task.batch.researchObject.workspaceId || !task.agentTask
    || task.agentTask.deletedAt || task.agentTask.session.deletedAt
    || task.agentTask.kind !== 'sdf.extract' || task.agentTask.status !== 'succeeded'
    || task.agentTask.session.researchObjectId !== input.researchObjectId || task.agentTask.session.userId !== task.batch.userId) return latest;
  const sourcePayload = task.agentTask.payload as Record<string, unknown> | null;
  if (!sourcePayload || sourcePayload.artifactId !== task.artifactId || sourcePayload.researchObjectId !== input.researchObjectId) return latest;
  const runs = await prisma.hermesResearchRun.findMany({ where: {
    researchObjectId: input.researchObjectId, actorId: task.batch.userId, profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9,
    ...(explicitRun ? { id: explicitRun[1] } : { versionId: { not: null } }),
    steps: { some: { stage: 'source_ingestion', ingestionTaskId: task.id, artifactId: task.artifactId, agentTaskId: task.agentTaskId } },
  }, include: { steps: { where: { stage: 'source_ingestion' } } } });
  for (const run of runs) {
    if (run.steps.length !== 1 || run.steps[0]!.ingestionTaskId !== task.id
      || run.steps[0]!.artifactId !== task.artifactId || run.steps[0]!.agentTaskId !== task.agentTaskId) continue;
    const saved = await readCommit(input.idempotencyKey ?? `hermes-ingestion:${run.id}:${task.id}`);
    if (!saved || saved.commit.authorId !== run.actorId
      || (run.versionId !== saved.version.id && !(explicitRun && run.versionId === null && run.status === 'awaiting_source_review'))
      || !saved.manifest.entries.some(entry => entry.artifactId === task.artifactId && entry.blobSha256 === task.artifact.blobSha256)) continue;
    if (!latest || saved.version.versionNo > latest.version.versionNo)
      latest = { ...saved, origin: { executor: 'hermes', runId: run.id } };
  }
  return latest;
}
