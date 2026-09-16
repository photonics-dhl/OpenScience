import type { Prisma, PrismaClient } from '@prisma/client';
import { assertSearchIndexSourceLive, SearchIndexSourceError } from '@openscience/domain';
import type { PrismaClient as SearchClient } from '../generated/client';

export interface SearchSourceIdentity {
  id: string; workspaceId: string; researchObjectId: string; artifactId: string;
  sourceVersionId: string | null; ownerTaskId: string | null;
}

/** Core lifecycle is authoritative; the search database is physically separate. */
export async function liveSearchSourceIds(core: Prisma.TransactionClient, rows: SearchSourceIdentity[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const [objects, artifacts, tasks, publications] = await Promise.all([
    core.researchObject.findMany({ where: { id: { in: rows.map(r => r.researchObjectId) } }, select: { id: true, workspaceId: true, deletedAt: true } }),
    core.artifact.findMany({ where: { id: { in: rows.map(r => r.artifactId) } }, select: { id: true, workspaceId: true, deletedAt: true, bytesPurgedAt: true } }),
    core.agentTask.findMany({ where: { id: { in: rows.flatMap(r => r.ownerTaskId ? [r.ownerTaskId] : []) } }, select: { id: true, sessionId: true, payload: true, deletedAt: true, session: { select: { deletedAt: true } } } }),
    core.version.findMany({ where: { id: { in: rows.flatMap(r => r.sourceVersionId ? [r.sourceVersionId] : []) }, publications: { some: {} } },
      select: { id: true, researchObjectId: true, status: true, manifest: { select: { entries: { select: { artifactId: true } } } }, evidenceRecords: { select: { artifactId: true } } } }),
  ]);
  const roMap = new Map(objects.map(r => [r.id, r]));
  const artifactMap = new Map(artifacts.map(r => [r.id, r]));
  const taskMap = new Map(tasks.map(r => [r.id, r]));
  const versionMap = new Map(publications.map(r => [r.id, r]));
  const invalidSources = new Set<string>();
  for (const task of tasks) {
    try { await assertSearchIndexSourceLive(core, task); }
    catch (error) {
      if (!(error instanceof SearchIndexSourceError)) throw error;
      invalidSources.add(task.id);
    }
  }
  return new Set(rows.filter(row => {
    const ro = roMap.get(row.researchObjectId), artifact = artifactMap.get(row.artifactId);
    if (!ro || ro.workspaceId !== row.workspaceId || !artifact || artifact.workspaceId !== row.workspaceId || artifact.bytesPurgedAt) return false;
    const publication = row.sourceVersionId ? versionMap.get(row.sourceVersionId) : undefined;
    if (publication) return ['published', 'revised'].includes(publication.status) && publication.researchObjectId === ro.id
      && [...(publication.manifest?.entries ?? []), ...publication.evidenceRecords].some(e => e.artifactId === artifact.id);
    const task = row.ownerTaskId ? taskMap.get(row.ownerTaskId) : undefined;
    return !ro.deletedAt && !artifact.deletedAt && (!row.ownerTaskId || Boolean(task && !task.deletedAt && !task.session.deletedAt && !invalidSources.has(task.id)));
  }).map(row => row.id));
}

/** Caller holds the core reference lock; activation is based on committed core state, never on a stale requested toggle. */
export async function setSearchContentVisibility(search: SearchClient, core: Prisma.TransactionClient, scope: {
  workspaceId?: string; researchObjectId?: string; taskIds: string[]; artifactIds: string[];
}): Promise<void> {
  if (!scope.researchObjectId && !scope.taskIds.length && !scope.artifactIds.length) return;
  const derivedTasks = scope.taskIds.length ? await core.agentTask.findMany({
    where: { kind: 'search.index', OR: scope.taskIds.map(id => ({ payload: { path: ['sourceTaskId'], equals: id } })) },
    select: { id: true },
  }) : [];
  const taskIds = [...new Set([...scope.taskIds, ...derivedTasks.map(task => task.id)])];
  const where = { ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}), OR: [
    ...(scope.researchObjectId ? [{ researchObjectId: scope.researchObjectId }] : []),
    ...(scope.artifactIds.length ? [{ artifactId: { in: scope.artifactIds } }] : []),
    ...(taskIds.length ? [{ indexTask: { fenceOwnerTaskId: { in: taskIds } } }] : []),
  ] };
  let cursor: string | undefined;
  for (;;) {
    const rows = await search.searchChunk.findMany({ where, orderBy: { id: 'asc' }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, workspaceId: true, researchObjectId: true, artifactId: true, sourceVersionId: true,
        indexTask: { select: { fenceOwnerTaskId: true, isCurrent: true, status: true } } } });
    if (!rows.length) break;
    const live = await liveSearchSourceIds(core, rows.map(r => ({ ...r, ownerTaskId: r.indexTask?.fenceOwnerTaskId ?? null })));
    const active = rows.filter(r => live.has(r.id) && r.indexTask?.isCurrent && r.indexTask.status === 'succeeded').map(r => r.id);
    await search.$transaction([
      search.searchChunk.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { active: false } }),
      search.searchChunk.updateMany({ where: { id: { in: active } }, data: { active: true } }),
    ]);
    cursor = rows.at(-1)!.id;
  }
}

export async function withLiveSearchSources(core: PrismaClient, rows: SearchSourceIdentity[]): Promise<Set<string>> {
  return core.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728413920)`;
    return liveSearchSourceIds(tx, rows);
  });
}
