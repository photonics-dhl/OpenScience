import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  getCurrentUser,
  login,
  logout,
  register,
  requestSignupCode,
  confirmSignup,
  resendCode,
  verifyEmail,
  beginOrcidConnection,
  completeOrcidConnection,
  getAcademicIdentityStatus,
  requestInstitutionEmailCode,
  verifyInstitutionEmail,
  AuthError,
  type AuthDeps,
  type OrcidConfig,
} from '@openscience/auth';
import type { AuditContext } from '@openscience/observability';
import { RESEARCH_IDENTITIES, validateResearchIdentityProfile } from '@openscience/domain';
import { SESSION_COOKIE, sessionTokenFrom } from './session-guard';
import { buildErrorBody } from '@openscience/observability';

export interface AuthRouteDeps extends AuthDeps {
  secureCookies: boolean;
  orcid?: OrcidConfig;
  institutionEmailDomains?: string[];
}

/** P1A-6：请求级审计上下文（requestId/ip），随写操作尾参传入 domain/auth。 */
function auditCtx(req: FastifyRequest): AuditContext {
  return { requestId: String(req.id), ip: req.ip };
}

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600;

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/[0-9]/, '密码需包含数字');

const registerBody = z.object({
  invitationCode: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(64),
});
const verifyBody = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) });
const emailBody = z.object({ email: z.string().email() });
const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const orcidStartBody = z.object({ returnTo: z.string().max(500).optional() }).strict();
const orcidCallbackQuery = z.object({ code: z.string().min(1), state: z.string().min(20) });
const institutionEmailBody = z.object({ email: z.string().email() }).strict();
const institutionEmailVerifyBody = institutionEmailBody.extend({ code: z.string().regex(/^\d{6}$/) });
const signupRequestBody = z.object({ email: z.string().email() });
const signupConfirmBody = signupRequestBody.extend({
  code: z.string().regex(/^\d{6}$/),
  password: passwordSchema,
  displayName: z.string().min(1).max(64),
  researchIdentity: z.object({
    identities: z.array(z.enum(RESEARCH_IDENTITIES)).min(1).max(RESEARCH_IDENTITIES.length),
    primaryIdentity: z.enum(RESEARCH_IDENTITIES),
    disciplines: z.array(z.string().trim().min(1).max(160)).max(100),
    methods: z.array(z.string().trim().min(1).max(160)).max(100),
    topics: z.array(z.string().trim().min(1).max(160)).max(100),
    languages: z.array(z.string().trim().min(1).max(160)).max(100),
  }).strict(),
});

const neutralResearchIdentity = validateResearchIdentityProfile({
  identities: ['reader'],
  primaryIdentity: 'reader',
  disciplines: [] as string[],
  methods: [] as string[],
  topics: [] as string[],
  languages: [] as string[],
});

function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function academicIdentityDeps(deps: AuthRouteDeps) {
  return {
    ...deps,
    orcid: deps.orcid ?? { clientId: '', clientSecret: '', redirectUri: '', baseUrl: '' },
    institutionEmailDomains: deps.institutionEmailDomains ?? [],
  };
}

async function currentUserId(req: FastifyRequest, reply: FastifyReply, deps: AuthRouteDeps): Promise<string | null> {
  const token = sessionTokenFrom(req);
  if (!token) {
    await reply.status(401).send(buildErrorBody('SESSION_INVALID', '未登录', String(req.id)));
    return null;
  }
  return (await getCurrentUser(deps, token)).userId;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  app.post('/request-signup-code', async (req, reply) => {
    const body = signupRequestBody.parse(req.body);
    await requestSignupCode(deps, body, auditCtx(req));
    return reply.status(202).send({ ok: true });
  });

  app.post('/confirm-signup', async (req, reply) => {
    const body = signupConfirmBody.parse(req.body);
    const profile = validateResearchIdentityProfile(body.researchIdentity);
    const result = await confirmSignup(
      deps,
      {
        email: body.email,
        code: body.code,
        password: body.password,
        displayName: body.displayName,
      },
      auditCtx(req),
      async (tx, user) => {
        await tx.researchIdentityProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...profile },
          update: profile,
        });
      },
    );
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.status(201).send({ userId: result.userId, status: result.status });
  });

  app.post('/register', async (req, reply) => {
    const body = registerBody.parse(req.body);
    const result = await register(deps, body, auditCtx(req), async (tx, user) => {
      await tx.researchIdentityProfile.create({ data: { userId: user.id, ...neutralResearchIdentity } });
    });
    return reply.status(201).send({ userId: result.userId, status: result.status });
  });

  app.post('/verify-email', async (req, reply) => {
    const body = verifyBody.parse(req.body);
    const result = await verifyEmail(deps, body, auditCtx(req));
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.send({ userId: result.userId, status: result.status });
  });

  app.post('/resend-code', async (req, reply) => {
    const body = emailBody.parse(req.body);
    await resendCode(deps, body, auditCtx(req));
    return reply.status(202).send({ ok: true });
  });

  app.post('/login', async (req, reply) => {
    const body = loginBody.parse(req.body);
    const result = await login(deps, body, auditCtx(req));
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.send({ userId: result.userId, status: result.status });
  });

  app.post('/logout', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (token) await logout(deps, token, auditCtx(req));
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/me', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (!token) return reply.status(401).send(buildErrorBody('SESSION_INVALID', '未登录', String(req.id)));
    const me = await getCurrentUser(deps, token);
    return reply.send(me);
  });

  app.get('/academic-identity', async (req, reply) => {
    const userId = await currentUserId(req, reply, deps);
    if (!userId) return;
    return reply.send(await getAcademicIdentityStatus(academicIdentityDeps(deps), userId));
  });

  app.post('/orcid/start', async (req, reply) => {
    const userId = await currentUserId(req, reply, deps);
    if (!userId) return;
    const body = orcidStartBody.parse(req.body ?? {});
    return reply.send(await beginOrcidConnection(academicIdentityDeps(deps), userId, body.returnTo));
  });

  app.get('/orcid/callback', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (!token) return reply.redirect('/auth/login?returnTo=%2Fsettings');
    let userId: string;
    try { userId = (await getCurrentUser(deps, token)).userId; } catch {
      return reply.redirect('/auth/login?returnTo=%2Fsettings');
    }
    try {
      const query = orcidCallbackQuery.parse(req.query);
      const result = await completeOrcidConnection(academicIdentityDeps(deps), userId, query, auditCtx(req));
      const separator = result.returnTo.includes('?') ? '&' : '?';
      return reply.redirect(`${result.returnTo}${separator}identity=orcid-connected`);
    } catch (cause) {
      const code = cause instanceof AuthError ? cause.code : 'ORCID_AUTHORIZATION_FAILED';
      return reply.redirect(`/settings?identityError=${encodeURIComponent(code)}`);
    }
  });

  app.post('/institution-email/request', async (req, reply) => {
    const userId = await currentUserId(req, reply, deps);
    if (!userId) return;
    const result = await requestInstitutionEmailCode(academicIdentityDeps(deps), userId, institutionEmailBody.parse(req.body), auditCtx(req));
    return reply.status(202).send({ ok: true, ...result });
  });

  app.post('/institution-email/verify', async (req, reply) => {
    const userId = await currentUserId(req, reply, deps);
    if (!userId) return;
    await verifyInstitutionEmail(academicIdentityDeps(deps), userId, institutionEmailVerifyBody.parse(req.body), auditCtx(req));
    return reply.send({ ok: true });
  });
}
