import type { AuditContext } from '@openscience/observability';
import type { ArtifactDeps } from '../artifact/artifacts';
import { requireActiveMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { carryVersionEvidence } from '../ingestion/ingestion-evidence';
import { createCommit } from './commits';
import { carryVersionMedia } from './carry-media';
import { freezeResearchRecord } from './research-record-snapshot';
import { CommitError } from './errors';
import { lockTrashReferences } from '../trash/trash';
import { recordValue } from './research-record-snapshot';
import { frozenClaims, sealVersionHistory } from './version-history';
import { randomUUID } from 'node:crypto';
import type { Prisma, ClaimKind, ClaimAssessment, EvidenceKind, ClaimRelation, ExtractionStatus } from '@prisma/client';
import { CLAIM_KINDS, CLAIM_ASSESSMENTS, EVIDENCE_KINDS, CLAIM_RELATIONS } from '../research-intelligence/types';

/** Reconstruct scientific content solely from the saved dto/private source receipt. */
async function restoreFrozenGraph(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; sourceVersionId: string; versionId: string; workspaceId: string; researchRecord: unknown;
}) {
  const record = recordValue(input.researchRecord);
  const sources = recordValue(record.sources);
  const claims = frozenClaims(record);
  const evidenceValue = recordValue(record.dto).evidence;
  const evidence = Array.isArray(evidenceValue) ? evidenceValue.map(recordValue) : [];
  const ids = new Map(claims.map(claim => [claim.id, randomUUID()]));
  const pending = [...claims];
  const inserted = new Set<unknown>();
  const status = (value: unknown): ExtractionStatus => ['blocked', 'succeeded', 'failed', 'needs_review'].includes(String(value)) ? value as ExtractionStatus : 'needs_review';
  while (pending.length) {
    const index = pending.findIndex(claim => !claim.parentClaimId || inserted.has(claim.parentClaimId));
    if (index < 0) throw new CommitError('VALIDATION_ERROR', '历史科研论证关系不完整，无法恢复');
    const claim = pending.splice(index, 1)[0]!;
    if (typeof claim.id !== 'string' || typeof claim.statement !== 'string' || !CLAIM_KINDS.includes(claim.kind as ClaimKind) || !CLAIM_ASSESSMENTS.includes(claim.assessment as ClaimAssessment)) throw new CommitError('VALIDATION_ERROR', '历史科研内容格式不完整');
    const captured = recordValue(recordValue(sources.claims)[claim.id]);
    await tx.claimNode.create({ data: {
      id: ids.get(claim.id)!, researchObjectId: input.researchObjectId, versionId: input.versionId,
      parentClaimId: claim.parentClaimId ? ids.get(claim.parentClaimId) : null,
      kind: claim.kind as ClaimKind, statement: claim.statement, assessment: claim.assessment as ClaimAssessment,
      conditions: Array.isArray(claim.conditions) ? claim.conditions as string[] : [], limitations: Array.isArray(claim.limitations) ? claim.limitations as string[] : [],
      extractionStatus: status(claim.extractionStatus),
      provenance: { ...recordValue(captured.provenance), source: recordValue(captured.provenance).source ?? 'history_snapshot',
        previousVersionId: input.sourceVersionId, previousClaimId: claim.id, restoredFromFrozenRecord: true } as Prisma.InputJsonValue,
    } });
    inserted.add(claim.id);
  }
  for (const item of evidence) {
    if (typeof item.id !== 'string' || !ids.has(item.claimId) || typeof item.artifactId !== 'string' || typeof item.title !== 'string'
      || typeof item.contentHash !== 'string' || !EVIDENCE_KINDS.includes(item.kind as EvidenceKind) || !CLAIM_RELATIONS.includes(item.relation as ClaimRelation)) throw new CommitError('VALIDATION_ERROR', '历史证据格式不完整');
    const source = recordValue(sources[item.id]);
    const artifact = await tx.artifact.findUnique({ where: { id: item.artifactId }, select: { bytesPurgedAt: true, deletedAt: true } });
    if (!artifact || artifact.bytesPurgedAt || artifact.deletedAt) {
      await tx.claimNode.update({ where: { id: ids.get(item.claimId)! }, data: { extractionStatus: 'needs_review', assessment: 'missing' } });
      continue;
    }
    const capturedProvenance = recordValue(source.provenance);
    const verifierId = typeof source.verifiedByUserId === 'string' && await tx.user.findUnique({ where: { id: source.verifiedByUserId }, select: { id: true } }) ? source.verifiedByUserId : null;
    await tx.evidenceRecord.create({ data: {
      researchObjectId: input.researchObjectId, versionId: input.versionId, workspaceId: input.workspaceId,
      claimId: ids.get(item.claimId)!, artifactId: item.artifactId, kind: item.kind as EvidenceKind, title: item.title,
      exactQuote: typeof source.exactQuote === 'string' ? source.exactQuote : null,
      relation: item.relation as ClaimRelation, locator: { artifactId: item.artifactId, contentHash: item.contentHash, ...recordValue(source.locator ?? item.locator) } as Prisma.InputJsonValue,
      contentHash: item.contentHash, extractionConfidence: typeof item.extractionConfidence === 'number' ? item.extractionConfidence : null,
      extractionStatus: status(item.extractionStatus), verifiedByUserId: verifierId,
      provenance: { ...capturedProvenance, source: capturedProvenance.source ?? 'history_snapshot',
        ...(source.sourceMapRef ? { sourceMapRef: source.sourceMapRef } : {}), previousVersionId: input.sourceVersionId, previousEvidenceId: item.id,
        restoredFromFrozenRecord: true, ...(source.verifiedByUserId === undefined ? { originalVerifier: 'not_recorded' } : {}) } as Prisma.InputJsonValue,
    } });
  }
}

/** Restore a saved body/material set as a new private draft, retaining the prior current draft. */
export async function restoreVersionDraft(deps: ArtifactDeps, input: {
  researchObjectId: string; versionId: string; userId: string; version: number;
}, ctx: AuditContext = {}) {
  return deps.prisma.$transaction(async (tx) => {
    await lockTrashReferences(tx);
    await tx.$queryRaw`SELECT id FROM research_objects WHERE id = ${input.researchObjectId}::uuid FOR UPDATE`;
    const ro = await tx.researchObject.findUnique({ where: { id: input.researchObjectId }, include: { sdfDocument: true } });
    if (!ro || ro.deletedAt) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究工作不存在');
    const { membership } = await requireActiveMembership(tx, ro.workspaceId, input.userId);
    if (!['owner', 'maintainer', 'author', 'contributor'].includes(membership.role)) throw new CommitError('FORBIDDEN', '无权恢复草稿');
    if (ro.version !== input.version) throw new CommitError('CONCURRENT_UPDATE', '草稿已改变，请刷新后再恢复');
    await sealVersionHistory(tx, { researchObjectId: ro.id, versionId: input.versionId });
    const source = await tx.version.findFirst({ where: { id: input.versionId, researchObjectId: ro.id }, include: { manifest: { include: { entries: true } } } });
    if (!source?.manifest) throw new CommitError('VALIDATION_ERROR', '所选历史稿不存在');
    const artifactIds = source.manifest.entries.map(entry => entry.artifactId);
    if (await tx.artifact.count({ where: { id: { in: artifactIds }, workspaceId: ro.workspaceId, deletedAt: null } }) !== new Set(artifactIds).size) {
      throw new CommitError('VALIDATION_ERROR', '历史材料已移入回收站，请先恢复相关材料');
    }
    // The user can recover the replaced state even if it predates automatic draft history.
    const latest = await tx.version.findFirst({ where: { researchObjectId: ro.id, commit: { branch: { isDefault: true } } }, orderBy: { versionNo: 'desc' }, include: { manifest: true } });
    let currentRevision = ro.version;
    if (ro.sdfDocument && JSON.stringify(latest?.manifest?.coreJson) !== JSON.stringify(ro.sdfDocument.coreJson)) {
      const saved = await createCommit(deps, { researchObjectId: ro.id, userId: input.userId, version: currentRevision, sdfCore: ro.sdfDocument.coreJson as Record<string, unknown>, message: 'Save draft before restoring history' }, ctx, tx);
      if (latest) {
        await carryVersionEvidence(tx, { researchObjectId: ro.id, previousVersionId: latest.id, versionId: saved.versionId });
        await carryVersionMedia(tx, { researchObjectId: ro.id, previousVersionId: latest.id, versionId: saved.versionId });
      }
      await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: saved.versionId });
      currentRevision += 1;
    }
    const restored = await createCommit(deps, {
      researchObjectId: ro.id, userId: input.userId, version: currentRevision,
      sdfCore: source.manifest.coreJson as Record<string, unknown>,
      artifacts: source.manifest.entries.map(entry => ({ artifactId: entry.artifactId, logicalPath: entry.logicalPath })),
      message: `Restore draft from ${source.createdAt.toISOString()}`,
    }, ctx, tx);
    await restoreFrozenGraph(tx, { researchObjectId: ro.id, sourceVersionId: source.id, versionId: restored.versionId, workspaceId: ro.workspaceId, researchRecord: source.researchRecord });
    await carryVersionMedia(tx, { researchObjectId: ro.id, previousVersionId: source.id, versionId: restored.versionId });
    await freezeResearchRecord(tx, { researchObjectId: ro.id, versionId: restored.versionId });
    await recordAudit(deps, tx, { actorId: input.userId, action: 'draft.restore', workspaceId: ro.workspaceId, targetType: 'research_object', targetId: ro.id, metadata: { sourceVersionId: source.id, versionId: restored.versionId } }, ctx);
    const current = await tx.researchObject.findUniqueOrThrow({ where: { id: ro.id }, include: { sdfDocument: { include: { nodes: true } } } });
    return { researchObject: { id: ro.id, workspaceId: ro.workspaceId, title: current.title, publicId: current.publicId,
      visibility: current.visibility, status: current.status, version: current.version, createdAt: current.createdAt,
      sdf: { core: current.sdfDocument!.coreJson, nodes: current.sdfDocument!.nodes.map(node => ({ nodeType: node.nodeType, content: node.content })) } }, versionId: restored.versionId };
  }, { isolationLevel: 'Serializable', timeout: 30_000 }).catch((error: unknown) => {
    if ((error as { code?: string }).code === 'P2034') throw new CommitError('CONCURRENT_UPDATE', '草稿已改变，请刷新后再恢复');
    throw error;
  });
}
