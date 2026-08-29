import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { StorageAdapter } from '@openscience/storage';
import {
  CLAIM_ASSESSMENTS,
  CLAIM_KINDS,
  CLAIM_RELATIONS,
  EVIDENCE_KINDS,
  createClaim,
  createEvidence,
  deleteClaim,
  deleteEvidence,
  getEvidenceSource,
  listClaims,
  listEvidence,
  updateClaim,
  updateEvidence,
  verifyEvidence,
} from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

export type ClaimEvidenceRouteDeps = AuthDeps & { storage: StorageAdapter };

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const scopeParams = z.object({
  roId: z.string().uuid(),
  versionId: z.string().uuid(),
}).strict();
const claimParams = scopeParams.extend({ claimId: z.string().uuid() }).strict();
const evidenceParams = scopeParams.extend({ evidenceId: z.string().uuid() }).strict();
const timestamp = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const stringList = z.array(z.string().trim().min(1).max(500)).max(100);

const claimFields = {
  parentClaimId: z.string().uuid().optional(),
  kind: z.enum(CLAIM_KINDS),
  statement: z.string().trim().min(1).max(4_000),
  assessment: z.enum(CLAIM_ASSESSMENTS),
  conditions: stringList.optional(),
  limitations: stringList.optional(),
};
const createClaimBody = z.object({ id: z.string().uuid(), ...claimFields }).strict();
const updateClaimBody = z.object({
  expectedUpdatedAt: timestamp,
  patch: z.object({
    parentClaimId: z.string().uuid().nullable().optional(),
    kind: z.enum(CLAIM_KINDS).optional(),
    statement: z.string().trim().min(1).max(4_000).optional(),
    assessment: z.enum(CLAIM_ASSESSMENTS).optional(),
    conditions: stringList.optional(),
    limitations: stringList.optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, 'patch must not be empty'),
}).strict();
const deleteBody = z.object({ expectedUpdatedAt: timestamp }).strict();

const boundingBox = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
}).strict();
const locator = z.object({
  artifactId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  blockId: z.string().trim().min(1).max(200).optional(),
  page: z.number().int().positive().optional(),
  boundingBox: boundingBox.optional(),
  charRange: z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict().optional(),
  tableCell: z.object({
    sheet: z.string().trim().min(1).max(200).optional(),
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict();
const rights = z.object({
  decision: z.enum(['reuse', 'link_only', 'metadata_only', 'deny']),
  sourceUrl: z.string().url().max(2_000).optional(),
  license: z.string().trim().min(1).max(200).optional(),
  checkedAt: z.string().datetime({ offset: true }).optional(),
}).strict();
const evidenceFields = {
  claimId: z.string().uuid(),
  artifactId: z.string().uuid(),
  kind: z.enum(EVIDENCE_KINDS),
  title: z.string().trim().min(1).max(500),
  exactQuote: z.string().trim().min(1).max(20_000).optional(),
  relation: z.enum(CLAIM_RELATIONS),
  locator,
  extractionConfidence: z.number().min(0).max(1).optional(),
  rights: rights.optional(),
};
const createEvidenceBody = z.object({ id: z.string().uuid(), ...evidenceFields }).strict();
const updateEvidenceBody = z.object({
  expectedUpdatedAt: timestamp,
  patch: z.object({
    claimId: evidenceFields.claimId.optional(),
    artifactId: evidenceFields.artifactId.optional(),
    kind: evidenceFields.kind.optional(),
    title: evidenceFields.title.optional(),
    exactQuote: evidenceFields.exactQuote.nullable().optional(),
    relation: evidenceFields.relation.optional(),
    locator: evidenceFields.locator.optional(),
    extractionConfidence: evidenceFields.extractionConfidence.nullable().optional(),
    rights: evidenceFields.rights.nullable().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, 'patch must not be empty'),
}).strict();

export function registerClaimEvidenceRoutes(app: FastifyInstance, deps: ClaimEvidenceRouteDeps): void {
  app.get('/research-objects/:roId/versions/:versionId/claims', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    return reply.send({ claims: await listClaims(deps, { ...params, researchObjectId: params.roId, userId: user.userId }) });
  });

  app.post('/research-objects/:roId/versions/:versionId/claims', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    const body = createClaimBody.parse(req.body);
    const claim = await createClaim(deps, { ...body, researchObjectId: params.roId, versionId: params.versionId, userId: user.userId }, auditCtx(req));
    return reply.status(201).send({ claim });
  });

  app.patch('/research-objects/:roId/versions/:versionId/claims/:claimId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = claimParams.parse(req.params);
    const body = updateClaimBody.parse(req.body);
    return reply.send({ claim: await updateClaim(deps, {
      userId: user.userId, researchObjectId: params.roId, versionId: params.versionId,
      claimId: params.claimId, expectedUpdatedAt: body.expectedUpdatedAt, patch: body.patch,
    }, auditCtx(req)) });
  });

  app.delete('/research-objects/:roId/versions/:versionId/claims/:claimId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = claimParams.parse(req.params);
    const body = deleteBody.parse(req.body);
    await deleteClaim(deps, {
      userId: user.userId, researchObjectId: params.roId, versionId: params.versionId,
      claimId: params.claimId, expectedUpdatedAt: body.expectedUpdatedAt,
    }, auditCtx(req));
    return reply.status(204).send();
  });

  app.get('/research-objects/:roId/versions/:versionId/evidence', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    return reply.send({ evidence: await listEvidence(deps, { ...params, researchObjectId: params.roId, userId: user.userId }) });
  });

  app.post('/research-objects/:roId/versions/:versionId/evidence', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = scopeParams.parse(req.params);
    const body = createEvidenceBody.parse(req.body);
    const evidence = await createEvidence(deps, { ...body, researchObjectId: params.roId, versionId: params.versionId, userId: user.userId }, auditCtx(req));
    return reply.status(201).send({ evidence });
  });

  app.patch('/research-objects/:roId/versions/:versionId/evidence/:evidenceId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = evidenceParams.parse(req.params);
    const body = updateEvidenceBody.parse(req.body);
    return reply.send({ evidence: await updateEvidence(deps, {
      userId: user.userId, researchObjectId: params.roId, versionId: params.versionId,
      evidenceId: params.evidenceId, expectedUpdatedAt: body.expectedUpdatedAt, patch: body.patch,
    }, auditCtx(req)) });
  });

  app.post('/research-objects/:roId/versions/:versionId/evidence/:evidenceId/verify', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = evidenceParams.parse(req.params);
    const body = deleteBody.parse(req.body);
    return reply.send({ evidence: await verifyEvidence(deps, {
      userId: user.userId, researchObjectId: params.roId, versionId: params.versionId,
      evidenceId: params.evidenceId, expectedUpdatedAt: body.expectedUpdatedAt,
    }, auditCtx(req)) });
  });

  app.get('/research-objects/:roId/versions/:versionId/evidence/:evidenceId/source', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = evidenceParams.parse(req.params);
    return reply.send({ source: await getEvidenceSource(deps, {
      userId: user.userId, researchObjectId: params.roId, versionId: params.versionId,
      evidenceId: params.evidenceId,
    }) });
  });

  app.delete('/research-objects/:roId/versions/:versionId/evidence/:evidenceId', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const params = evidenceParams.parse(req.params);
    const body = deleteBody.parse(req.body);
    await deleteEvidence(deps, {
      userId: user.userId, researchObjectId: params.roId, versionId: params.versionId,
      evidenceId: params.evidenceId, expectedUpdatedAt: body.expectedUpdatedAt,
    }, auditCtx(req));
    return reply.status(204).send();
  });
}
