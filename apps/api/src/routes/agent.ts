import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import { AgentError, buildInterestContext, createAgentSession, getAgentTask, retryAgentTask, listAgentSessions, listAgentTasks, parseWorkspaceGuidePayload, PUBLIC_AGENT_SESSION_KINDS, PUBLIC_AGENT_TASK_KINDS, submitAgentTask, approveApproval, listPendingApprovals, rejectApproval, revokeApproval, validateResearchIdentityProfileState } from '@openscience/domain';
import type { AuditContext } from '@openscience/observability';
import { requireCurrentUser } from './session-guard';

/** agent 路由依赖：AuthDeps（含 redis，队列）。 */
export type AgentRouteDeps = AuthDeps;

function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

export const agentSessionBodySchema = z.object({
  researchObjectId: z.string().uuid().optional(),
  kind: z.enum(PUBLIC_AGENT_SESSION_KINDS),
  title: z.string().max(200).optional(),
});
const workspaceGuideTaskBody = z.object({
  sessionId: z.string().uuid(),
  kind: z.literal('workspace.guide'),
  payload: z.unknown().transform((payload, ctx) => {
    try { return parseWorkspaceGuidePayload(payload); }
    catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'workspace.guide payload 无效' });
      return z.NEVER;
    }
  }),
  activeClaimId: z.string().uuid().optional(),
}).strict();
const genericTaskBody = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum(PUBLIC_AGENT_TASK_KINDS),
  payload: z.record(z.string(), z.unknown()).default({}),
  currentGoal: z.string().trim().min(1).max(2_000).optional(),
  activeClaimId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(value.payload).length > 65_536) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'payload exceeds 64KB' });
  if (Object.hasOwn(value.payload, 'retryContractVersion')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'retryContractVersion is server-reserved' });
  }
  if (value.kind === 'review.analyze') {
    const parsed = z.object({
      versionId: z.string().uuid(),
      coreText: z.string().trim().min(1).max(8_000),
    }).strict().safeParse(value.payload);
    if (!parsed.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'review.analyze payload is invalid' });
  }
});
export const agentTaskBodySchema = z.union([workspaceGuideTaskBody, genericTaskBody]);

function identityStateFromRow(row: Record<string, unknown>) {
  return validateResearchIdentityProfileState({
    identities: row.identities,
    primaryIdentity: row.primaryIdentity,
    disciplines: row.disciplines,
    methods: row.methods,
    topics: row.topics,
    languages: row.languages,
    acceptedSignals: row.acceptedSignals,
    rejectedSignals: row.rejectedSignals,
    profileVersion: row.profileVersion,
  });
}

/**
 * P1D-2：/agent Hermes 会话与异步任务 API（§9.3 长任务 + §16 幂等 + §18.3 进度可恢复 + §9.1 配额）。
 * POST /agent/sessions       建会话
 * GET  /agent/sessions       当前用户会话列表
 * POST /agent/tasks          提交异步任务（Idempotency-Key 头；AI Credit 配额校验）
 * GET  /agent/tasks/:id      进度查询（轮询，断线可恢复 §18.3）
 */
export function registerAgentRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  app.post('/agent/sessions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = agentSessionBodySchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'];
    const session = await createAgentSession(
      deps,
      {
        userId: user.userId,
        researchObjectId: body.researchObjectId,
        kind: body.kind,
        title: body.title,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      },
      auditCtx(req),
    );
    return reply.status(201).send({ session });
  });

  app.get('/agent/sessions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ sessions: await listAgentSessions(deps, { userId: user.userId }) });
  });

  app.get('/agent/tasks', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { actionable, kind, recovery, researchObjectId, targetKind } = z.object({
      actionable: z.enum(['true', 'false']).default('true'),
      kind: z.string().min(1).max(64).optional(),
      recovery: z.enum(['true']).optional(),
      targetKind: z.enum(['personal', 'research_object']).optional(),
      researchObjectId: z.string().uuid().optional(),
    }).strict().parse(req.query);
    if (recovery === 'true' && (actionable !== 'false' || kind !== 'source.retrieve')) {
      throw new AgentError('VALIDATION_ERROR', 'Recovery priority requires non-actionable source.retrieve');
    }
    if (recovery !== 'true' && (targetKind || researchObjectId)) {
      throw new AgentError('VALIDATION_ERROR', 'Recovery target requires recovery mode');
    }
    if (recovery === 'true' && (!targetKind
      || (targetKind === 'personal' && researchObjectId)
      || (targetKind === 'research_object' && !researchObjectId))) {
      throw new AgentError('VALIDATION_ERROR', 'Recovery target is invalid');
    }
    const recoveryTarget = recovery === 'true'
      ? targetKind === 'research_object'
        ? { kind: 'research_object' as const, researchObjectId: researchObjectId! }
        : { kind: 'personal' as const }
      : undefined;
    return reply.send({ tasks: await listAgentTasks(deps, {
      userId: user.userId, actionableOnly: actionable === 'true', kind, recoveryPreferred: recovery === 'true', recoveryTarget,
    }) });
  });

  app.post('/agent/tasks', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const body = agentTaskBodySchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'];
    const session = await deps.prisma.agentSession.findUnique({ where: { id: body.sessionId } });
    if (!session || session.userId !== user.userId) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '会话不存在');
    if (body.activeClaimId) {
      const claim = await deps.prisma.claimNode.findUnique({ where: { id: body.activeClaimId } });
      if (!claim || !session.researchObjectId || claim.researchObjectId !== session.researchObjectId) {
        throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', 'Claim 不存在或不属于当前研究对象');
      }
    }
    const profileRow = await deps.prisma.researchIdentityProfile.findUnique({ where: { userId: user.userId } });
    const interestContext = buildInterestContext({
      ...(profileRow ? { profile: identityStateFromRow(profileRow as unknown as Record<string, unknown>) } : {}),
      currentGoal: body.kind === 'workspace.guide' ? body.payload.goal : body.currentGoal,
      ...(session.researchObjectId ? { activeResearchObjectId: session.researchObjectId } : {}),
      ...(body.activeClaimId ? { activeClaimId: body.activeClaimId } : {}),
    });
    const task = await submitAgentTask(
      deps,
      {
        sessionId: body.sessionId,
        userId: user.userId,
        kind: body.kind,
        payload: body.payload,
        interestContext,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      },
      auditCtx(req),
    );
    return reply.status(201).send({ task });
  });

  app.get('/agent/tasks/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ task: await getAgentTask(deps, { userId: user.userId, taskId: id }) });
  });

  app.post('/agent/tasks/:id/retry', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ task: await retryAgentTask(deps, { userId: user.userId, taskId: id }, auditCtx(req)) });
  });

  // P1D-4：R0-R4 审批（§9.4 + §15 ToolApproval）
  app.get('/agent/approvals/pending', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    return reply.send({ approvals: await listPendingApprovals(deps, { userId: user.userId }) });
  });

  app.post('/agent/approvals/:id/approve', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ scopeGrant: z.string().max(200).optional() }).parse(req.body ?? {});
    return reply.send({ approval: await approveApproval(deps, { userId: user.userId, approvalId: id, scopeGrant: body.scopeGrant }, auditCtx(req)) });
  });

  app.post('/agent/approvals/:id/reject', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ approval: await rejectApproval(deps, { userId: user.userId, approvalId: id }, auditCtx(req)) });
  });

  app.post('/agent/approvals/:id/revoke', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ approval: await revokeApproval(deps, { userId: user.userId, approvalId: id }, auditCtx(req)) });
  });
}
