import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import {
  RESEARCH_IDENTITIES,
  ResearchIdentityProfileError,
  applyResearchIdentityProfilePatch,
  correctResearchInterestSignal,
  validateResearchIdentityProfileState,
  type ResearchIdentityProfileState,
} from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { buildErrorBody } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

export type ResearchIdentityRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const listSchema = z.array(z.string().trim().min(1).max(160)).max(100);
const patchSchema = z.object({
  expectedProfileVersion: z.number().int().positive(),
  identities: z.array(z.enum(RESEARCH_IDENTITIES)).min(1).max(RESEARCH_IDENTITIES.length).optional(),
  primaryIdentity: z.enum(RESEARCH_IDENTITIES).optional(),
  disciplines: listSchema.optional(),
  methods: listSchema.optional(),
  topics: listSchema.optional(),
  languages: listSchema.optional(),
}).strict();
const signalSchema = z.object({
  expectedProfileVersion: z.number().int().positive(),
  signal: z.string().trim().min(1).max(160),
  decision: z.enum(['accept', 'reject']),
}).strict();

function stateFromRow(row: unknown): ResearchIdentityProfileState {
  const value = row as Record<string, unknown>;
  return validateResearchIdentityProfileState({
    identities: value.identities,
    primaryIdentity: value.primaryIdentity,
    disciplines: value.disciplines,
    methods: value.methods,
    topics: value.topics,
    languages: value.languages,
    acceptedSignals: value.acceptedSignals,
    rejectedSignals: value.rejectedSignals,
    profileVersion: value.profileVersion,
  });
}

async function findProfile(deps: ResearchIdentityRouteDeps, userId: string): Promise<ResearchIdentityProfileState | null> {
  const row = await deps.prisma.researchIdentityProfile.findUnique({ where: { userId } });
  return row ? stateFromRow(row) : null;
}

async function persistProfile(
  deps: ResearchIdentityRouteDeps,
  userId: string,
  expectedProfileVersion: number,
  next: ResearchIdentityProfileState,
  action: string,
  ctx: AuditContext,
): Promise<ResearchIdentityProfileState> {
  await deps.prisma.$transaction(async (tx) => {
    const updated = await tx.researchIdentityProfile.updateMany({
      where: { userId, profileVersion: expectedProfileVersion },
      data: {
        identities: next.identities,
        primaryIdentity: next.primaryIdentity,
        disciplines: next.disciplines,
        methods: next.methods,
        topics: next.topics,
        languages: next.languages,
        acceptedSignals: next.acceptedSignals,
        rejectedSignals: next.rejectedSignals,
        profileVersion: next.profileVersion,
      },
    });
    if (updated.count !== 1) {
      throw new ResearchIdentityProfileError('PROFILE_VERSION_CONFLICT', 'research identity profile version conflict');
    }
    await deps.audit?.record({ actorId: userId, action, targetType: 'research_identity_profile', targetId: userId, requestId: ctx.requestId, ip: ctx.ip }, tx);
  });
  return next;
}

export function registerResearchIdentityRoutes(app: FastifyInstance, deps: ResearchIdentityRouteDeps): void {
  app.get('/research-identity', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const profile = await findProfile(deps, user.userId);
    if (!profile) return reply.status(404).send(buildErrorBody('PROFILE_NOT_FOUND', '研究身份资料不存在', String(req.id)));
    return reply.send({ profile });
  });

  app.patch('/research-identity', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const patch = patchSchema.parse(req.body);
    const current = await findProfile(deps, user.userId);
    if (!current) return reply.status(404).send(buildErrorBody('PROFILE_NOT_FOUND', '研究身份资料不存在', String(req.id)));
    const next = applyResearchIdentityProfilePatch(current, patch);
    return reply.send({
      profile: await persistProfile(deps, user.userId, patch.expectedProfileVersion, next, 'research_identity.update', auditCtx(req)),
    });
  });

  app.post('/research-identity/signals', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const correction = signalSchema.parse(req.body);
    const current = await findProfile(deps, user.userId);
    if (!current) return reply.status(404).send(buildErrorBody('PROFILE_NOT_FOUND', '研究身份资料不存在', String(req.id)));
    const next = correctResearchInterestSignal(current, correction);
    return reply.send({
      profile: await persistProfile(deps, user.userId, correction.expectedProfileVersion, next, 'research_identity.signal_correct', auditCtx(req)),
    });
  });
}
