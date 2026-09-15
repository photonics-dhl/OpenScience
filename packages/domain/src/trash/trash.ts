import { Prisma, type TrashEntry } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import type { WorkspaceDeps } from '../workspace/types';
import { requireActiveMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { TrashError } from './errors';
import { historyMediaItems, publicHistoryMedia } from '../commit/version-history';

export const TRASH_KINDS = ['research_object', 'session', 'task', 'asset', 'artifact'] as const;
export type TrashKind = typeof TRASH_KINDS[number];
export interface TrashSearchScope { trashEntryId: string; workspaceId?: string; researchObjectId?: string; taskIds: string[]; artifactIds: string[]; assetIds: string[] }
export interface TrashDeps extends WorkspaceDeps {
  storage: StorageAdapter;
  deleteSearchContent?: (scope: TrashSearchScope) => Promise<void>;
  deletePrivateJobCopies?: (scope: TrashSearchScope) => Promise<void>;
  setSearchContentVisibility?: (scope: TrashSearchScope, visible: boolean, tx: Prisma.TransactionClient) => Promise<void>;
}
type Tx = Prisma.TransactionClient;
const TABLES = { research_object: 'research_objects', session: 'agent_sessions', task: 'agent_tasks', asset: 'presentation_assets', artifact: 'artifacts' } as const;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Writers and physical cleanup take this same transaction lock. See migration reference guard.
export async function lockTrashReferences(tx: Pick<Tx, '$executeRaw'>): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728413920)`;
}
export async function lockLiveResearchObject(tx: Tx, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ deleted_at: Date | null }>>`SELECT deleted_at FROM research_objects WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows[0] || rows[0].deleted_at) throw new TrashError('NOT_FOUND', '工作已移入回收站或不存在');
}
async function maintenance(tx: Tx): Promise<void> {
  await lockTrashReferences(tx);
  await tx.$executeRaw`SELECT set_config('openscience.trash_mutation', 'on', true)`;
}
async function lockResource(tx: Tx, kind: TrashKind, id: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(TABLES[kind])} WHERE id = ${id}::uuid FOR UPDATE`);
}

async function scopeFor(tx: Tx, kind: TrashKind, resourceId: string) {
  if (kind === 'research_object') {
    const ro = await tx.researchObject.findUnique({ where: { id: resourceId } });
    return ro && { ownerId: ro.createdBy, workspaceId: ro.workspaceId, researchObjectId: ro.id, label: ro.title, deletedAt: ro.deletedAt };
  }
  if (kind === 'artifact') {
    const artifact = await tx.artifact.findUnique({ where: { id: resourceId } });
    return artifact && { ownerId: artifact.uploadedBy, workspaceId: artifact.workspaceId, researchObjectId: null, label: artifact.logicalPath, deletedAt: artifact.deletedAt };
  }
  if (kind === 'asset') {
    const asset = await tx.presentationAsset.findUnique({ where: { id: resourceId }, include: { researchObject: true } });
    return asset && { ownerId: asset.researchObject.createdBy, workspaceId: asset.researchObject.workspaceId, researchObjectId: asset.researchObjectId, label: asset.kind, deletedAt: asset.deletedAt };
  }
  const session = kind === 'session'
    ? await tx.agentSession.findUnique({ where: { id: resourceId }, include: { researchObject: true } })
    : (await tx.agentTask.findUnique({ where: { id: resourceId }, include: { session: { include: { researchObject: true } } } }))?.session;
  if (!session) return null;
  const task = kind === 'task' ? await tx.agentTask.findUnique({ where: { id: resourceId } }) : null;
  const result = jsonObject(task?.result);
  const writing = jsonObject(result.writingDraft);
  return { ownerId: session.userId, workspaceId: session.researchObject?.workspaceId ?? null, researchObjectId: session.researchObjectId,
    label: kind === 'task' ? String(writing.title ?? task?.kind ?? '研究内容') : session.title || 'Hermes 会话', deletedAt: kind === 'task' ? task?.deletedAt ?? null : session.deletedAt };
}
async function authorize(tx: Tx, scope: { ownerId: string; workspaceId: string | null }, userId: string, conversation = false): Promise<void> {
  if (conversation && scope.ownerId !== userId) throw new TrashError('NOT_FOUND', '内容不存在');
  if (!scope.workspaceId) {
    if (scope.ownerId !== userId) throw new TrashError('NOT_FOUND', '内容不存在');
    return;
  }
  const { membership } = await requireActiveMembership(tx, scope.workspaceId, userId);
  if (membership.role === 'owner') return;
  if (scope.ownerId === userId && ['maintainer', 'author', 'contributor'].includes(membership.role)) return;
  throw new TrashError('FORBIDDEN', '需要内容所有权或空间所有者权限');
}
function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function objectsIn(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'objectKey' && typeof child === 'string' && /^(derived\/|presentation\/|blobs\/|temporary\/)/u.test(child)) keys.push(child);
    else if (child && typeof child === 'object') keys.push(...objectsIn(child));
  }
  return keys;
}
async function mark(tx: Tx, kind: TrashKind, id: string, entryId: string, at: Date | null): Promise<void> {
  await tx.$executeRaw(Prisma.sql`UPDATE ${Prisma.raw(TABLES[kind])} SET deleted_at = ${at}, trash_entry_id = ${at ? entryId : null}::uuid WHERE id = ${id}::uuid`);
}
async function hasPublicHistory(tx: Tx, roId: string): Promise<boolean> {
  return Boolean(await tx.publication.findFirst({ where: { version: { researchObjectId: roId } }, select: { id: true } }));
}
async function taskIsAdopted(tx: Tx, id: string): Promise<boolean> {
  const ingestion = await tx.ingestionTask.findFirst({ where: { agentTaskId: id, state: { in: ['confirmed', 'written'] } }, select: { id: true } });
  if (ingestion) return true;
  const rows = await tx.$queryRaw<Array<{ used: boolean }>>`SELECT (
    EXISTS (SELECT 1 FROM agent_tasks WHERE id <> ${id}::uuid AND (payload::text LIKE ${'%' + id + '%'} OR result::text LIKE ${'%' + id + '%'}))
    OR EXISTS (SELECT 1 FROM versions WHERE research_record::text LIKE ${'%' + id + '%'})
    OR EXISTS (SELECT 1 FROM sdf_documents WHERE core_json::text LIKE ${'%' + id + '%'})
    OR EXISTS (SELECT 1 FROM hermes_research_steps WHERE agent_task_id = ${id}::uuid)
  ) AS used`;
  return Boolean(rows[0]?.used);
}
async function taskHasProtectedReference(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ used: boolean }>>`SELECT (
    EXISTS (SELECT 1 FROM versions v JOIN publications p ON p.version_id=v.id WHERE v.research_record::text LIKE ${'%' + id + '%'})
    OR EXISTS (SELECT 1 FROM evidence_records e JOIN publications p ON p.version_id=e.version_id WHERE e.provenance::text LIKE ${'%' + id + '%'})
    OR EXISTS (SELECT 1 FROM agent_tasks other JOIN agent_sessions os ON os.id=other.session_id
      JOIN agent_tasks source ON source.id=${id}::uuid JOIN agent_sessions ss ON ss.id=source.session_id
      WHERE other.id<>source.id AND os.research_object_id IS DISTINCT FROM ss.research_object_id
        AND (other.payload::text LIKE ${'%' + id + '%'} OR other.result::text LIKE ${'%' + id + '%'}))
  ) AS used`;
  return Boolean(rows[0]?.used);
}
async function assetIsReferenced(tx: Tx, id: string): Promise<boolean> {
  const asset = await tx.presentationAsset.findUnique({ where: { id } });
  if (!asset) return false;
  const publicVersions = await tx.version.findMany({ where: { publications: { some: {} } }, select: { researchRecord: true } });
  const recorded = new Map(publicVersions.flatMap(version => historyMediaItems(version.researchRecord)).map(row => [row.id, row]));
  const pending = publicVersions.flatMap(version => publicHistoryMedia(version.researchRecord)).map(row => row.id);
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === id) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const row = recorded.get(current) ?? await tx.presentationAsset.findUnique({ where: { id: current }, select: { provenance: true } });
    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (['assetId','baseAssetId','storyboardAssetId'].includes(key) && typeof child === 'string') pending.push(child);
        else if (key === 'sceneImageAssetIds' && Array.isArray(child)) pending.push(...child.filter((item): item is string => typeof item === 'string'));
        else if (child && typeof child === 'object') walk(child);
      }
    };
    walk(row?.provenance);
  }
  const rows = await tx.$queryRaw<Array<{ used: boolean }>>`SELECT (
    EXISTS (SELECT 1 FROM presentation_assets WHERE id <> ${id}::uuid AND deleted_at IS NULL AND status IN ('draft','approved') AND provenance::text LIKE ${'%' + id + '%'})
    OR EXISTS (SELECT 1 FROM sdf_documents WHERE core_json::text LIKE ${'%' + id + '%'})
  ) AS used`;
  return Boolean(rows[0]?.used);
}

async function addEntry(tx: Tx, input: { kind: TrashKind; resourceId: string; userId: string; parentId?: string; at: Date }) {
  const prior = await tx.trashEntry.findFirst({ where: { kind: input.kind, resourceId: input.resourceId, state: { in: ['trashed', 'purge_pending'] } } });
  if (prior) return prior;
  const scope = await scopeFor(tx, input.kind, input.resourceId);
  if (!scope || scope.deletedAt) return null;
  const entry = await tx.trashEntry.create({ data: { kind: input.kind, resourceId: input.resourceId, ownerId: input.userId,
    workspaceId: scope.workspaceId, researchObjectId: scope.researchObjectId, label: scope.label.slice(0, 300), parentId: input.parentId,
    deletedAt: input.at, purgeAfter: new Date(input.at.getTime() + RETENTION_MS) } });
  await mark(tx, input.kind, input.resourceId, entry.id, input.at);
  return entry;
}

async function setTrashSearchVisibility(deps: TrashDeps, tx: Tx, entry: TrashEntry, visible: boolean): Promise<void> {
  if (!deps.setSearchContentVisibility) throw new TrashError('CONFLICT', '搜索内容暂无法同步，请稍后重试');
  const children = await tx.trashEntry.findMany({ where: { parentId: entry.id, state: visible ? 'restored' : 'trashed' }, select: { kind: true, resourceId: true } });
  const items = [entry, ...children];
  const scope: TrashSearchScope = { trashEntryId: entry.id, ...(entry.workspaceId ? { workspaceId: entry.workspaceId } : {}),
    ...(entry.kind === 'research_object' ? { researchObjectId: entry.resourceId } : {}),
    taskIds: entry.kind === 'research_object' ? [] : items.filter(item => item.kind === 'task').map(item => item.resourceId),
    artifactIds: entry.kind === 'research_object' ? [] : items.filter(item => item.kind === 'artifact').map(item => item.resourceId),
    assetIds: entry.kind === 'research_object' ? [] : items.filter(item => item.kind === 'asset').map(item => item.resourceId) };
  await deps.setSearchContentVisibility(scope, visible, tx);
}

async function syncTrashSearchVisibility(deps: TrashDeps, id: string): Promise<void> {
  try {
    await deps.prisma.$transaction(async tx => {
      await lockTrashReferences(tx);
      const entry = await tx.trashEntry.findUnique({ where: { id } });
      if (!entry || !['trashed','purge_pending','restored'].includes(entry.state)) return;
      await setTrashSearchVisibility(deps, tx, entry, entry.state === 'restored');
      if (entry.lastError === 'search_visibility_pending') await tx.trashEntry.update({ where: { id }, data: { lastError: null } });
    }, { timeout: 30_000 });
  } catch {
    await deps.prisma.trashEntry.updateMany({ where: { id, state: { in: ['trashed','purge_pending','restored'] } }, data: { lastError: 'search_visibility_pending' } });
  }
}

export async function moveToTrash(deps: TrashDeps, input: { userId: string; kind: TrashKind; resourceId: string; deleteUnadopted?: boolean }, ctx: AuditContext = {}) {
  const moved = await deps.prisma.$transaction(async tx => {
    await maintenance(tx);
    const scope = await scopeFor(tx, input.kind, input.resourceId);
    if (!scope) throw new TrashError('NOT_FOUND', '内容不存在');
    await authorize(tx, scope, input.userId, input.kind === 'session' || input.kind === 'task');
    if (scope.researchObjectId) await tx.$queryRaw`SELECT id FROM research_objects WHERE id = ${scope.researchObjectId}::uuid FOR UPDATE`;
    await lockResource(tx, input.kind, input.resourceId);
    const at = deps.now?.() ?? new Date();
    const entry = await addEntry(tx, { ...input, at });
    if (!entry) throw new TrashError('CONFLICT', '内容随上级工作删除，请从回收站恢复上级工作');
    const retained: Array<{ kind: TrashKind; resourceId: string; reason: string }> = [];
    if (input.kind === 'research_object') {
      if (await hasPublicHistory(tx, input.resourceId)) {
        await tx.trashEntry.update({ where: { id: entry.id }, data: { retainedReason: '已归档个人工作；公开历史和引用持续保留', purgeAfter: new Date('9999-12-31T00:00:00.000Z') } });
      }
      const [sessions, tasks, assets] = await Promise.all([
        tx.agentSession.findMany({ where: { researchObjectId: input.resourceId, deletedAt: null }, select: { id: true } }),
        tx.agentTask.findMany({ where: { session: { researchObjectId: input.resourceId }, deletedAt: null }, select: { id: true } }),
        tx.presentationAsset.findMany({ where: { researchObjectId: input.resourceId, deletedAt: null }, select: { id: true } }),
      ]);
      for (const [kind, rows] of [['session', sessions], ['task', tasks], ['asset', assets]] as const) {
        for (const row of rows) await addEntry(tx, { kind, resourceId: row.id, userId: input.userId, parentId: entry.id, at });
      }
      const candidateArtifacts = await tx.artifact.findMany({ where: { deletedAt: null, OR: [
        { ingestionTasks: { some: { batch: { researchObjectId: input.resourceId } } } },
        { evidenceRecords: { some: { researchObjectId: input.resourceId } } },
      ] }, select: { id: true } });
      const manifests = await tx.manifestEntry.findMany({ where: { manifest: { version: { researchObjectId: input.resourceId } } }, select: { artifactId: true } });
      for (const artifactId of new Set([...candidateArtifacts.map(a => a.id), ...manifests.map(m => m.artifactId)])) {
        const shared = await tx.manifestEntry.findFirst({ where: { artifactId, manifest: { version: { researchObjectId: { not: input.resourceId } } } } })
          || await tx.ingestionTask.findFirst({ where: { artifactId, batch: { researchObjectId: { not: input.resourceId } } } })
          || await tx.evidenceRecord.findFirst({ where: { artifactId, researchObjectId: { not: input.resourceId } } });
        if (!shared) await addEntry(tx, { kind: 'artifact', resourceId: artifactId, userId: input.userId, parentId: entry.id, at });
      }
      // Stop orchestration immediately. Restore permits explicit continuation, never late writeback.
      await tx.hermesResearchRun.updateMany({ where: { researchObjectId: input.resourceId }, data: { status: 'cancelled', error: null } });
    } else if (input.kind === 'session' && input.deleteUnadopted) {
      const tasks = await tx.agentTask.findMany({ where: { sessionId: input.resourceId, deletedAt: null } });
      for (const task of tasks) {
        if (await taskIsAdopted(tx, task.id)) { retained.push({ kind: 'task', resourceId: task.id, reason: '已有内容或研究流程引用' }); continue; }
        const assets = await tx.presentationAsset.findMany({ where: { OR: [{ id: task.id }, { provenance: { path: ['taskId'], equals: task.id } }] } });
        if (await Promise.all(assets.map(asset => assetIsReferenced(tx, asset.id))).then(values => values.some(Boolean))) {
          retained.push({ kind: 'task', resourceId: task.id, reason: '生成内容已被采用或公开' }); continue;
        }
        await addEntry(tx, { kind: 'task', resourceId: task.id, userId: input.userId, parentId: entry.id, at });
        for (const asset of assets) await addEntry(tx, { kind: 'asset', resourceId: asset.id, userId: input.userId, parentId: entry.id, at });
      }
    }
    const taskScope: Prisma.AgentTaskWhereInput = input.kind === 'task' ? { id: input.resourceId } : input.kind === 'session'
      ? { sessionId: input.resourceId } : input.kind === 'research_object' ? { session: { researchObjectId: input.resourceId } } : { id: { in: [] } };
    await tx.agentTask.updateMany({ where: { ...taskScope, status: { in: ['pending', 'running'] } }, data: { status: 'failed', error: '[blocked] content moved to trash', executionAttempt: { increment: 1 } } });
    await recordAudit(deps, tx, { actorId: input.userId, action: 'trash.move', workspaceId: scope.workspaceId, targetType: input.kind, targetId: input.resourceId, metadata: { trashEntryId: entry.id } }, ctx);
    return { entry: await tx.trashEntry.findUniqueOrThrow({ where: { id: entry.id } }), retained };
  }, { isolationLevel: 'Serializable', timeout: 30_000 });
  await syncTrashSearchVisibility(deps, moved.entry.id);
  return moved;
}

export async function listTrash(deps: TrashDeps, input: { userId: string }) {
  return deps.prisma.trashEntry.findMany({ where: { ownerId: input.userId, parentId: null, state: { in: ['trashed', 'purge_pending'] } }, orderBy: { deletedAt: 'desc' }, take: 200 });
}
export async function restoreTrash(deps: TrashDeps, input: { userId: string; id: string }, ctx: AuditContext = {}) {
  const restored = await deps.prisma.$transaction(async tx => {
    await maintenance(tx);
    const entry = await tx.trashEntry.findUnique({ where: { id: input.id } });
    if (!entry || entry.ownerId !== input.userId) throw new TrashError('NOT_FOUND', '回收站项目不存在');
    if (entry.state === 'restored') return entry;
    if (entry.state !== 'trashed' || entry.purgeAfter <= (deps.now?.() ?? new Date())) throw new TrashError('CONFLICT', '清除已开始或保留期已结束');
    const scope = await scopeFor(tx, entry.kind as TrashKind, entry.resourceId);
    if (!scope) throw new TrashError('NOT_FOUND', '内容不存在');
    await authorize(tx, scope, input.userId, entry.kind === 'session' || entry.kind === 'task');
    if (entry.researchObjectId) {
      const ro = await tx.researchObject.findUnique({ where: { id: entry.researchObjectId } });
      if (ro?.deletedAt && entry.kind !== 'research_object') throw new TrashError('CONFLICT', '请先恢复所属工作');
    }
    const children = await tx.trashEntry.findMany({ where: { parentId: entry.id, state: 'trashed' } });
    for (const row of [entry, ...children]) {
      await mark(tx, row.kind as TrashKind, row.resourceId, row.id, null);
      await tx.trashEntry.update({ where: { id: row.id }, data: { state: 'restored', lastError: null } });
    }
    await recordAudit(deps, tx, { actorId: input.userId, action: 'trash.restore', workspaceId: entry.workspaceId, targetType: entry.kind, targetId: entry.resourceId }, ctx);
    return tx.trashEntry.findUniqueOrThrow({ where: { id: entry.id } });
  }, { isolationLevel: 'Serializable' });
  // Search is physically separate; re-read core liveness under its lock after commit.
  await syncTrashSearchVisibility(deps, restored.id);
  return restored;
}

export async function listCleanableContent(deps: TrashDeps, input: { userId: string; researchObjectId?: string }) {
  const ro = input.researchObjectId ? await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } }) : null;
  if (input.researchObjectId && (!ro || ro.deletedAt)) throw new TrashError('NOT_FOUND', '工作不存在');
  const authority = ro ? await requireActiveMembership(deps.prisma, ro.workspaceId, input.userId) : null;
  const canDeleteMaterials = Boolean(ro && (authority?.membership.role === 'owner' || (ro.createdBy === input.userId && ['maintainer','author','contributor'].includes(authority?.membership.role ?? ''))));
  const [sessions, tasks, assets, artifacts] = await Promise.all([
    deps.prisma.agentSession.findMany({ where: { researchObjectId: ro?.id ?? null, userId: input.userId, deletedAt: null, kind: { not: 'retained.products' } }, select: { id: true, title: true, createdAt: true } }),
    deps.prisma.agentTask.findMany({ where: { session: { researchObjectId: ro?.id ?? null, userId: input.userId }, deletedAt: null, result: { not: Prisma.DbNull },
      OR: [{ session: { deletedAt: null } }, { kind: { not: 'workspace.guide' } }, { result: { path: ['writingDraft'], not: Prisma.AnyNull } }],
    }, select: { id: true, kind: true, result: true, createdAt: true } }),
    ro ? deps.prisma.presentationAsset.findMany({ where: { researchObjectId: ro.id, deletedAt: null }, select: { id: true, kind: true, createdAt: true } }) : [],
    ro ? deps.prisma.artifact.findMany({ where: { deletedAt: null, workspaceId: ro.workspaceId, OR: [{ ingestionTasks: { some: { batch: { researchObjectId: ro.id } } } }, { evidenceRecords: { some: { researchObjectId: ro.id } } }] }, select: { id: true, logicalPath: true, uploadedBy: true, createdAt: true } }) : [],
  ]);
  return [
    ...sessions.map(s => ({ kind: 'session' as const, resourceId: s.id, title: s.title || 'Hermes 会话', createdAt: s.createdAt, adopted: false, canDelete: true })),
    ...await Promise.all(tasks.map(async t => ({ kind: 'task' as const, resourceId: t.id, title: String(jsonObject(jsonObject(t.result).writingDraft).title ?? (t.kind === 'sdf.extract' ? '论文分析草稿' : 'Hermes 研究内容')), createdAt: t.createdAt, adopted: await taskIsAdopted(deps.prisma, t.id), canDelete: true }))),
    ...await Promise.all(assets.map(async a => ({ kind: 'asset' as const, resourceId: a.id, title: a.kind, createdAt: a.createdAt, adopted: await assetIsReferenced(deps.prisma, a.id), canDelete: canDeleteMaterials }))),
    ...artifacts.map(a => ({ kind: 'artifact' as const, resourceId: a.id, title: a.logicalPath, createdAt: a.createdAt, adopted: true, canDelete: authority?.membership.role === 'owner' || (a.uploadedBy === input.userId && ['maintainer','author','contributor'].includes(authority?.membership.role ?? '')) })),
  ];
}

async function enqueueObjects(tx: Tx, entryId: string, keys: string[]): Promise<void> {
  for (const objectKey of new Set(keys)) await tx.trashObjectCleanup.upsert({ where: { objectKey }, create: { objectKey, trashEntryId: entryId }, update: { state: 'pending', trashEntryId: entryId, lastError: null } });
}
/** A worker may finish after its owner was deleted; remember unreachable derived bytes for cleanup. */
export async function rememberDiscardedTaskResult(prisma: WorkspaceDeps['prisma'], taskId: string, result: unknown): Promise<void> {
  const keys = objectsIn(result);
  if (!keys.length) return;
  await prisma.$transaction(async tx => {
    await maintenance(tx);
    const task = await tx.agentTask.findUnique({ where: { id: taskId }, include: { session: true } });
    const entryId = task?.trashEntryId ?? task?.session.trashEntryId;
    const entry = entryId ? await tx.trashEntry.findUnique({ where: { id: entryId } }) : await tx.trashEntry.findFirst({ where: { OR: [
      { kind: 'task', resourceId: taskId }, { purgeScope: { path: ['taskIds'], array_contains: [taskId] } },
    ], state: { in: ['trashed','purge_pending','purged'] } } });
    if (!entry) return;
    await enqueueObjects(tx, entry.id, keys);
    if (entry.state === 'purged') await tx.trashEntry.update({ where: { id: entry.id }, data: { state: 'purge_pending', lastError: '迟到的解析产物正在清理' } });
  });
}
async function eraseTask(tx: Tx, taskId: string, entryId: string): Promise<void> {
  const task = await tx.agentTask.findUnique({ where: { id: taskId }, include: { temporaryDocument: true } });
  if (!task) return;
  await enqueueObjects(tx, entryId, [...objectsIn(task.result), ...objectsIn(task.payload), ...(task.temporaryDocument ? [task.temporaryDocument.objectKey] : [])]);
  if (task.temporaryDocument) await tx.temporaryDocument.delete({ where: { id: task.temporaryDocument.id } });
  await tx.sourceRightsDecision.deleteMany({ where: { agentTaskId: taskId } });
  await tx.auditLog.updateMany({ where: { targetId: taskId }, data: { metadata: Prisma.DbNull } });
  await tx.agentTask.delete({ where: { id: taskId } });
}
async function eraseArtifact(tx: Tx, artifactId: string, entryId: string): Promise<boolean> {
  const artifact = await tx.artifact.findUnique({ where: { id: artifactId }, include: { blob: true } });
  if (!artifact) return true;
  if (await artifactRetentionReason(tx, artifactId)) return false;
  await tx.manifestEntry.deleteMany({ where: { artifactId, manifest: { version: { publications: { none: {} } } } } });
  const evidenceRows = await tx.evidenceRecord.findMany({ where: { artifactId } });
  for (const evidence of evidenceRows) {
    const provenance = { ...jsonObject(evidence.provenance) };
    await enqueueObjects(tx, entryId, objectsIn(provenance.sourceMapRef));
    delete provenance.sourceMapRef;
    await tx.evidenceRecord.update({ where: { id: evidence.id }, data: { provenance: { ...provenance, sourceRemoved: true } as Prisma.InputJsonValue } });
  }
  const privateVersions = await tx.version.findMany({ where: { publications: { none: {} }, researchRecord: { not: Prisma.DbNull } }, select: { id: true, researchRecord: true } });
  for (const version of privateVersions) {
    const record = jsonObject(version.researchRecord), sources = { ...jsonObject(record.sources) };
    let changed = false;
    for (const [id, source] of Object.entries(sources)) {
      const value = jsonObject(source);
      if (value.artifactId !== artifactId) continue;
      changed = true;
      await enqueueObjects(tx, entryId, [...objectsIn(value.sourceMapRef), ...objectsIn(jsonObject(value.provenance).sourceMapRef)]);
      const provenance = { ...jsonObject(value.provenance) }; delete provenance.sourceMapRef;
      sources[id] = { ...value, sourceMapRef: null, provenance: { ...provenance, sourceRemoved: true } };
    }
    const dto = jsonObject(record.dto);
    const manifest = Array.isArray(dto.manifest) ? dto.manifest.filter(item => jsonObject(item).artifactId !== artifactId) : dto.manifest;
    if (changed || (Array.isArray(dto.manifest) && Array.isArray(manifest) && manifest.length !== dto.manifest.length)) {
      await tx.version.update({ where: { id: version.id }, data: { researchRecord: { ...record, sources, dto: { ...dto, ...(manifest ? { manifest } : {}),
        ...(Array.isArray(dto.evidence) ? { evidence: dto.evidence.map(item => { const value = jsonObject(item); return value.artifactId === artifactId ? { ...value, source: { ...jsonObject(value.source), state: 'not_recorded' } } : item; }) } : {}) } } as Prisma.InputJsonValue } });
    }
  }
  const extractionTasks = await tx.agentTask.findMany({ where: { kind: 'sdf.extract', OR: [
    { ingestionTask: { artifactId } }, { payload: { path: ['artifactId'], equals: artifactId } },
    { result: { path: ['sourceMapRef','artifactId'], equals: artifactId } },
  ] } });
  for (const task of extractionTasks) {
    await enqueueObjects(tx, entryId, [...objectsIn(task.payload), ...objectsIn(task.result)]);
    await tx.agentTask.update({ where: { id: task.id }, data: { payload: {}, result: Prisma.DbNull, interestContext: Prisma.DbNull, status: 'failed', error: '[blocked] source file permanently removed', deletedAt: new Date(), trashEntryId: entryId, executionAttempt: { increment: 1 } } });
    await tx.toolApproval.deleteMany({ where: { taskId: task.id } });
    await tx.auditLog.updateMany({ where: { targetId: task.id }, data: { metadata: Prisma.DbNull } });
  }
  await tx.ingestionTask.updateMany({ where: { artifactId }, data: { state: 'failed_blocked', error: 'Source file permanently removed' } });
  await tx.auditLog.updateMany({ where: { targetId: artifactId }, data: { metadata: Prisma.DbNull } });
  // Evidence citations keep a metadata identity; the original bytes and recoverable parse are erased.
  await tx.artifact.update({ where: { id: artifactId }, data: { bytesPurgedAt: new Date(), deletedAt: new Date(), trashEntryId: entryId, logicalPath: '已清除的来源文件' } });
  await enqueueObjects(tx, entryId, [artifact.blob.storageKey]);
  return true;
}

async function artifactRetentionReason(tx: Tx, artifactId: string): Promise<string | null> {
  const [manifests, evidence, ingestion, steps] = await Promise.all([
    tx.manifestEntry.findMany({ where: { artifactId }, include: { manifest: { include: { version: { select: { researchObjectId: true, publications: { select: { id: true } } } } } } } }),
    tx.evidenceRecord.findMany({ where: { artifactId }, include: { version: { select: { publications: { select: { id: true } } } } } }),
    tx.ingestionTask.findMany({ where: { artifactId }, select: { batch: { select: { researchObjectId: true } } } }),
    tx.hermesResearchStep.findMany({ where: { artifactId }, select: { run: { select: { researchObjectId: true } } } }),
  ]);
  if (manifests.some(row => row.manifest.version.publications.length) || evidence.some(row => row.version.publications.length)) return '公开版本仍引用原始来源文件，保留公开引用所需字节';
  const scopes = new Set([...manifests.map(row => row.manifest.version.researchObjectId), ...evidence.map(row => row.researchObjectId), ...ingestion.map(row => row.batch.researchObjectId), ...steps.map(row => row.run.researchObjectId)]);
  if (scopes.size > 1) return '其他工作仍引用此来源文件，保留共享字节';
  return null;
}

async function retentionReason(tx: Tx, entry: TrashEntry): Promise<string | null> {
  if (entry.kind === 'task' && await taskHasProtectedReference(tx, entry.resourceId)) return '公开版本或其他工作仍采用此结果，引用保留';
  if (entry.kind === 'asset' && await assetIsReferenced(tx, entry.resourceId)) return '公开版本或其他内容仍引用此图片，引用保留';
  if (entry.kind === 'artifact') {
    return artifactRetentionReason(tx, entry.resourceId);
  }
  return null;
}

async function removePrivateMediaReceipt(tx: Tx, assetId: string): Promise<void> {
  // Call only after exact public and adopted-media dependency checks. Keep the rest of each receipt intact.
  const versions = await tx.version.findMany({ where: { researchRecord: { path: ['historyMedia','items'], not: Prisma.AnyNull } }, select: { id: true, researchRecord: true } });
  for (const version of versions) {
    const record = jsonObject(version.researchRecord), history = jsonObject(record.historyMedia);
    if (!Array.isArray(history.items) || !history.items.some(item => jsonObject(item).id === assetId)) continue;
    await tx.version.update({ where: { id: version.id }, data: { researchRecord: { ...record, historyMedia: { ...history, items: history.items.filter(item => jsonObject(item).id !== assetId) } } as Prisma.InputJsonValue } });
  }
}

async function eraseResource(tx: Tx, entry: TrashEntry): Promise<string | null> {
  if (entry.kind === 'artifact') return await eraseArtifact(tx, entry.resourceId, entry.id) ? null : '其他存续内容仍引用该文件，已保留其引用';
  if (entry.kind === 'asset') {
    if (await assetIsReferenced(tx, entry.resourceId)) return '公开版本或其他内容仍引用该图片，已保留其引用';
    const asset = await tx.presentationAsset.findUnique({ where: { id: entry.resourceId } });
    if (asset) { await removePrivateMediaReceipt(tx, asset.id); await enqueueObjects(tx, entry.id, [asset.objectKey]); await tx.auditLog.updateMany({ where: { targetId: asset.id }, data: { metadata: Prisma.DbNull } }); await tx.presentationAsset.delete({ where: { id: asset.id } }); }
    return null;
  }
  if (entry.kind === 'task') {
    if (await taskHasProtectedReference(tx, entry.resourceId)) return '公开版本或其他工作仍引用此分析或稿件，已保留其引用';
    await eraseTask(tx, entry.resourceId, entry.id);
    return null;
  }
  if (entry.kind === 'session') {
    const session = await tx.agentSession.findUnique({ where: { id: entry.resourceId }, include: { tasks: true } });
    if (!session) return null;
    // Scientific outputs keep their existing task IDs and relations; user messages are removed.
    const retained: typeof session.tasks = [];
    for (const task of session.tasks) {
      if ((!task.deletedAt && (task.kind !== 'workspace.guide' || Boolean(jsonObject(task.result).writingDraft))) || await taskIsAdopted(tx, task.id)) retained.push(task);
    }
    if (retained.length) {
      const target = await tx.agentSession.create({ data: { userId: session.userId, researchObjectId: session.researchObjectId, kind: 'retained.products', title: '保留的研究产物', status: 'retained' } });
      for (const task of retained) await tx.agentTask.update({ where: { id: task.id }, data: { sessionId: target.id, payload: {}, interestContext: Prisma.DbNull, error: null,
        ...(task.kind === 'workspace.guide' ? { result: { writingDraft: jsonObject(task.result).writingDraft } as Prisma.InputJsonValue } : {}) } });
    }
    for (const task of session.tasks.filter(task => !retained.some(item => item.id === task.id))) await eraseTask(tx, task.id, entry.id);
    await tx.auditLog.updateMany({ where: { targetId: session.id }, data: { metadata: Prisma.DbNull } });
    await tx.agentSession.delete({ where: { id: session.id } });
    return null;
  }
  const ro = await tx.researchObject.findUnique({ where: { id: entry.resourceId } });
  if (!ro) return null;
  if (await hasPublicHistory(tx, ro.id)) return '个人工作已归档；公开历史及所需材料继续保留，可恢复个人工作';
  if (await tx.forkRelation.findFirst({ where: { sourceRoId: ro.id } })) throw new TrashError('CONFLICT', '其他工作引用此工作的派生关系，暂不能清除');
  const [tasks, assets, artifacts] = await Promise.all([
    tx.agentTask.findMany({ where: { session: { researchObjectId: ro.id } } }),
    tx.presentationAsset.findMany({ where: { researchObjectId: ro.id } }),
    tx.artifact.findMany({ where: { OR: [{ ingestionTasks: { some: { batch: { researchObjectId: ro.id } } } }, { evidenceRecords: { some: { researchObjectId: ro.id } } }] } }),
  ]);
  const manifests = await tx.manifestEntry.findMany({ where: { manifest: { version: { researchObjectId: ro.id } } }, select: { artifactId: true } });
  await enqueueObjects(tx, entry.id, assets.map(asset => asset.objectKey));
  // Remove Restrict edges before deleting the private graph; public graph is rejected above.
  await tx.hermesResearchRun.deleteMany({ where: { researchObjectId: ro.id } });
  for (const task of tasks) await eraseTask(tx, task.id, entry.id);
  await tx.commit.updateMany({ where: { researchObjectId: ro.id }, data: { parentCommitId: null } });
  await tx.forkRelation.deleteMany({ where: { forkedRoId: ro.id } });
  await tx.contribution.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.appeal.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.presentationAssetClaim.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.presentationAsset.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.evidenceRecord.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.claimNode.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.version.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.pullRequest.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.commit.deleteMany({ where: { researchObjectId: ro.id } });
  await tx.branch.deleteMany({ where: { researchObjectId: ro.id } });
  // Legacy notification/audit metadata may contain titles or prose; keep audit operation facts only.
  await tx.$executeRaw`UPDATE audit_logs SET metadata = NULL WHERE target_id = ${ro.id} OR metadata::text LIKE ${'%' + ro.id + '%'}`;
  await tx.$executeRaw`DELETE FROM notifications WHERE payload::text LIKE ${'%' + ro.id + '%'}`;
  await tx.researchObject.delete({ where: { id: ro.id } });
  for (const id of new Set([...artifacts.map(a => a.id), ...manifests.map(a => a.artifactId)])) await eraseArtifact(tx, id, entry.id);
  return null;
}

export async function purgeTrash(deps: TrashDeps, input: { userId: string; id: string }, ctx: AuditContext = {}) {
  const staged = await deps.prisma.$transaction(async tx => {
    await maintenance(tx);
    const entry = await tx.trashEntry.findUnique({ where: { id: input.id } });
    if (!entry || entry.ownerId !== input.userId) throw new TrashError('NOT_FOUND', '回收站项目不存在');
    if (['purged', 'retained'].includes(entry.state)) return { entry, scope: null };
    if (!['trashed', 'purge_pending'].includes(entry.state)) throw new TrashError('CONFLICT', '项目已恢复');
    const scope = await scopeFor(tx, entry.kind as TrashKind, entry.resourceId);
    if (scope) await authorize(tx, scope, input.userId, entry.kind === 'session' || entry.kind === 'task');
    if (entry.kind === 'research_object' && await hasPublicHistory(tx, entry.resourceId)) {
      // Archive remains reversible; public history never enters physical purge.
      return { entry: await tx.trashEntry.update({ where: { id: entry.id }, data: { retainedReason: '已归档个人工作；公开历史及材料保留，仍可恢复', purgeAfter: new Date('9999-12-31T00:00:00.000Z') } }), scope: null };
    }
    const retainedReason = await retentionReason(tx, entry);
    if (retainedReason) return { entry: await tx.trashEntry.update({ where: { id: entry.id }, data: { state: 'trashed', retainedReason, purgeAfter: new Date('9999-12-31T00:00:00.000Z') } }), scope: null };
    const taskWhere: Prisma.AgentTaskWhereInput = entry.kind === 'task' ? { id: entry.resourceId }
      : entry.kind === 'session' ? { sessionId: entry.resourceId, OR: [{ deletedAt: { not: null } }, { kind: 'workspace.guide', NOT: { result: { path: ['writingDraft'], not: Prisma.AnyNull } } }] }
      : entry.kind === 'research_object' ? { session: { researchObjectId: entry.resourceId } } : { id: { in: [] } };
    const tasks = await tx.agentTask.findMany({ where: taskWhere, select: { id: true, payload: true, ingestionTask: { select: { artifactId: true } } } });
    const artifacts = entry.kind === 'research_object' ? await tx.artifact.findMany({ where: { ingestionTasks: { some: { batch: { researchObjectId: entry.resourceId } } } }, select: { id: true } }) : [];
    const assets = entry.kind === 'research_object' ? await tx.presentationAsset.findMany({ where: { researchObjectId: entry.resourceId }, select: { id: true } }) : [];
    const childAssets = await tx.trashEntry.findMany({ where: { parentId: entry.id, kind: 'asset', state: 'trashed' }, select: { resourceId: true } });
    const sourceArtifactIds = tasks.flatMap(task => { const value = task.ingestionTask?.artifactId ?? jsonObject(task.payload).artifactId; return typeof value === 'string' && /^[0-9a-f-]{36}$/iu.test(value) ? [value] : []; });
    const purgeScope = entry.purgeScope ? entry.purgeScope as unknown as TrashSearchScope : { trashEntryId: entry.id,
      ...(entry.workspaceId ? { workspaceId: entry.workspaceId } : {}), ...(entry.kind === 'research_object' ? { researchObjectId: entry.resourceId } : {}), taskIds: tasks.map(t => t.id).sort(),
      artifactIds: [...new Set(entry.kind === 'artifact' ? [entry.resourceId] : [...artifacts.map(a => a.id), ...sourceArtifactIds])].sort(),
      assetIds: [...new Set(entry.kind === 'asset' ? [entry.resourceId] : [...assets.map(a => a.id), ...childAssets.map(a => a.resourceId)])].sort() };
    await tx.trashEntry.update({ where: { id: entry.id }, data: { state: 'purge_pending', lastError: null, purgeScope: purgeScope as unknown as Prisma.InputJsonValue } });
    return { entry, scope: purgeScope };
  }, { isolationLevel: 'Serializable', timeout: 30_000 });
  if (!staged.scope) return staged.entry;
  try {
    if (staged.scope.researchObjectId || staged.scope.taskIds.length || staged.scope.artifactIds.length || staged.scope.assetIds.length) {
      if (!deps.deleteSearchContent) throw new TrashError('CLEANUP_PENDING', '搜索内容清理服务暂不可用，将自动重试');
      if (!deps.deletePrivateJobCopies) throw new TrashError('CLEANUP_PENDING', '等待服务器清理任务副本，将自动继续');
      await deps.deletePrivateJobCopies(staged.scope);
    }
    const result = await deps.prisma.$transaction(async tx => {
      await maintenance(tx);
      const entry = await tx.trashEntry.findUniqueOrThrow({ where: { id: input.id } });
      if (entry.state !== 'purge_pending') return entry;
      if (entry.researchObjectId) await tx.$queryRaw`SELECT id FROM research_objects WHERE id = ${entry.researchObjectId}::uuid FOR UPDATE`;
      // Source bytes can be shared across works; remove only this lifecycle's private index scope.
      if (deps.deleteSearchContent) await deps.deleteSearchContent(staged.entry.kind === 'artifact' ? staged.scope! : { ...staged.scope!, artifactIds: [] });
      const children = await tx.trashEntry.findMany({ where: { parentId: entry.id, state: { in: ['trashed', 'purge_pending'] } } });
      if (entry.kind !== 'research_object') {
        // Outputs are removed first, then the conversation; each refused deletion stays recoverable.
        for (const child of children.sort((a, b) => (a.kind === 'asset' ? -1 : b.kind === 'asset' ? 1 : 0))) {
          const reason = await eraseResource(tx, child);
          if (reason) await tx.trashEntry.update({ where: { id: child.id }, data: { retainedReason: reason, parentId: null } });
          else await tx.trashEntry.update({ where: { id: child.id }, data: { state: 'purged', purgedAt: new Date(), label: '' } });
        }
      }
      const reason = await eraseResource(tx, entry);
      if (reason) return tx.trashEntry.update({ where: { id: entry.id }, data: { state: 'trashed', retainedReason: reason, purgeAfter: new Date('9999-12-31T00:00:00.000Z') } });
      if (entry.kind === 'research_object') await tx.trashEntry.updateMany({ where: { researchObjectId: entry.resourceId, state: { in: ['trashed', 'purge_pending'] } }, data: { state: 'purged', purgedAt: new Date(), label: '' } });
      await recordAudit(deps, tx, { actorId: input.userId, action: 'trash.purge', workspaceId: entry.workspaceId, targetType: entry.kind, targetId: entry.resourceId }, ctx);
      return tx.trashEntry.update({ where: { id: entry.id }, data: { state: 'purged', purgedAt: new Date(), label: '', lastError: null } });
    }, { isolationLevel: 'Serializable', timeout: 30_000 });
    await cleanTrashObjects(deps, input.id);
    const pendingObjects = await deps.prisma.trashObjectCleanup.count({ where: { trashEntryId: input.id, state: { in: ['pending', 'deleting'] } } });
    if (pendingObjects && result.state === 'purged') return deps.prisma.trashEntry.update({ where: { id: input.id }, data: { state: 'purge_pending', lastError: '私有记录已清除，文件清理正在重试' } });
    return result;
  } catch (error) {
    await deps.prisma.trashEntry.updateMany({ where: { id: input.id, state: 'purge_pending' }, data: { lastError: '清除暂未完成，将重试；原内容继续处于回收站' } });
    throw error;
  }
}

/** A committed tombstone + common reference lock make object deletion retryable without broken new references. */
export async function cleanTrashObjects(deps: TrashDeps, trashEntryId?: string): Promise<void> {
  const queued = await deps.prisma.trashObjectCleanup.findMany({ where: { state: { in: ['pending', 'deleting'] }, ...(trashEntryId ? { trashEntryId } : {}) }, take: 100, orderBy: { updatedAt: 'asc' } });
  for (const item of queued) {
    try {
      const claimed = await deps.prisma.$transaction(async tx => {
        await maintenance(tx);
        const current = await tx.trashObjectCleanup.findUnique({ where: { objectKey: item.objectKey } });
        if (!current || !['pending', 'deleting'].includes(current.state)) return false;
        if (current.state === 'deleting') return true;
        const pattern = '%' + item.objectKey.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%';
        const rows = await tx.$queryRaw<Array<{ used: boolean }>>`SELECT (
          EXISTS (SELECT 1 FROM artifacts a JOIN blobs b ON b.sha256 = a.blob_sha256 WHERE b.storage_key = ${item.objectKey} AND a.bytes_purged_at IS NULL)
          OR EXISTS (SELECT 1 FROM manifest_entries m JOIN blobs b ON b.sha256 = m.blob_sha256 WHERE b.storage_key = ${item.objectKey})
          OR EXISTS (SELECT 1 FROM presentation_assets WHERE object_key = ${item.objectKey} OR provenance::text LIKE ${pattern})
          OR EXISTS (SELECT 1 FROM agent_tasks WHERE result::text LIKE ${pattern} OR payload::text LIKE ${pattern})
          OR EXISTS (SELECT 1 FROM versions WHERE research_record::text LIKE ${pattern})
          OR EXISTS (SELECT 1 FROM version_manifests WHERE core_json::text LIKE ${pattern})
          OR EXISTS (SELECT 1 FROM sdf_documents WHERE core_json::text LIKE ${pattern})
          OR EXISTS (SELECT 1 FROM temporary_documents WHERE object_key = ${item.objectKey})
          OR EXISTS (SELECT 1 FROM evidence_records WHERE provenance::text LIKE ${pattern} OR locator::text LIKE ${pattern})
          OR EXISTS (SELECT 1 FROM changesets WHERE payload::text LIKE ${pattern})
        ) AS used`;
        if (rows[0]?.used) {
          await tx.trashObjectCleanup.update({ where: { objectKey: item.objectKey }, data: { state: 'retained', lastError: null } });
          return false;
        }
        // Commit the tombstone before deleting bytes: process death cannot reopen reference creation.
        await tx.trashObjectCleanup.update({ where: { objectKey: item.objectKey }, data: { state: 'deleting' } });
        return true;
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
      if (!claimed) continue;
      await deps.prisma.$transaction(async tx => {
        await maintenance(tx);
        const current = await tx.trashObjectCleanup.findUnique({ where: { objectKey: item.objectKey } });
        if (current?.state !== 'deleting') return;
        await deps.storage.deleteObject(item.objectKey);
        await tx.blob.deleteMany({ where: { storageKey: item.objectKey, artifacts: { none: {} } } });
        await tx.trashObjectCleanup.update({ where: { objectKey: item.objectKey }, data: { state: 'deleted', attempts: { increment: 1 }, lastError: null } });
      }, { isolationLevel: 'Serializable', timeout: 30_000 });
    } catch {
      await deps.prisma.trashObjectCleanup.updateMany({ where: { objectKey: item.objectKey, state: { in: ['pending','deleting'] } }, data: { attempts: { increment: 1 }, lastError: 'storage_delete_retry' } });
    }
  }
}

export async function purgeExpiredTrash(deps: TrashDeps): Promise<{ purged: number; failed: number }> {
  const visibility = await deps.prisma.trashEntry.findMany({ where: { parentId: null, OR: [
    { state: { in: ['trashed','purge_pending'] } }, { state: 'restored', lastError: 'search_visibility_pending' },
  ] }, select: { id: true }, orderBy: { deletedAt: 'desc' }, take: 100 });
  for (const entry of visibility) await syncTrashSearchVisibility(deps, entry.id);
  const rows = await deps.prisma.trashEntry.findMany({ where: { parentId: null, OR: [{ state: 'trashed', purgeAfter: { lte: deps.now?.() ?? new Date() } }, { state: 'purge_pending' }] }, take: 20, orderBy: { purgeAfter: 'asc' } });
  let purged = 0, failed = 0;
  for (const row of rows) {
    try { const result = await purgeTrash(deps, { id: row.id, userId: row.ownerId }); if (result.state === 'purged') purged += 1; }
    catch { failed += 1; }
  }
  await cleanTrashObjects(deps);
  return { purged, failed };
}

