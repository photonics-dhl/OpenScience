import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { AuditContext, AuditSink } from '@openscience/observability';
import { AuthError } from './errors';
import type { Mailer } from './mailer';
import { generateSessionToken, generateVerificationCode, hashVerificationCode } from './tokens';
import { CODE_TTL_MS, inCooldown, isCodeExpired, isLocked, registerFailedAttempt } from './verification';

const ORCID_STATE_TTL_SECONDS = 10 * 60;
const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export interface OrcidConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
}

export interface AcademicIdentityDeps {
  prisma: PrismaClient;
  redis: Redis;
  mailer: Mailer;
  orcid: OrcidConfig;
  institutionEmailDomains: string[];
  now?: () => Date;
  audit?: AuditSink;
  fetch?: typeof fetch;
}

export interface AcademicIdentityStatus {
  steps: {
    registered: true;
    emailVerified: boolean;
    orcidConnected: boolean;
    institutionEmailVerified: boolean;
  };
  credentials: Array<{
    type: 'orcid' | 'institution_email';
    externalId: string;
    displayLabel: string;
    verifiedAt: string;
  }>;
  scopedRoles: Array<{
    scopeType: string;
    scopeId: string;
    role: string;
    expiresAt: string | null;
  }>;
  capabilities: {
    orcid: boolean;
    institutionEmail: boolean;
  };
}

function currentTime(deps: AcademicIdentityDeps): Date {
  return deps.now ? deps.now() : new Date();
}

function normalizedDomains(domains: string[]): string[] {
  return domains.map((domain) => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
}

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

function domainCandidates(domain: string): string[] {
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) return [];
  const labels = domain.split('.');
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
}

export interface InstitutionMatch {
  id: string | null;
  rorId: string | null;
  name: string;
  domain: string;
  source: 'ror' | 'configured_override';
}

export async function resolveInstitutionDomain(
  deps: Pick<AcademicIdentityDeps, 'prisma' | 'institutionEmailDomains'>,
  domain: string,
): Promise<InstitutionMatch | null> {
  const candidates = domainCandidates(domain);
  for (const candidate of candidates) {
    const organizations = await deps.prisma.researchOrganization.findMany({
      where: { status: 'active', domains: { has: candidate } },
      orderBy: { name: 'asc' },
      take: 2,
      select: { id: true, rorId: true, name: true },
    });
    if (organizations.length === 1) return { ...organizations[0], domain: candidate, source: 'ror' };
    if (organizations.length > 1) return null;
  }
  const override = normalizedDomains(deps.institutionEmailDomains)
    .find((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
  return override ? { id: null, rorId: null, name: override, domain: override, source: 'configured_override' } : null;
}

function orcidConfigured(config: OrcidConfig): boolean {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri && config.baseUrl);
}

function assertOrcid(orcid: string): void {
  if (!ORCID_PATTERN.test(orcid)) throw new AuthError('ORCID_AUTHORIZATION_FAILED', 'ORCID 返回了无效的研究者标识');
  const digits = orcid.replaceAll('-', '');
  let total = 0;
  for (const character of digits.slice(0, 15)) total = (total + Number(character)) * 2;
  const remainder = (12 - (total % 11)) % 11;
  const check = remainder === 10 ? 'X' : String(remainder);
  if (check !== digits[15]) throw new AuthError('ORCID_AUTHORIZATION_FAILED', 'ORCID 返回了无效的研究者标识');
}

async function audit(
  deps: AcademicIdentityDeps,
  event: { actorId: string; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> },
  ctx: AuditContext,
): Promise<void> {
  await deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip });
}

export async function getAcademicIdentityStatus(
  deps: AcademicIdentityDeps,
  userId: string,
): Promise<AcademicIdentityStatus> {
  const at = currentTime(deps);
  const [user, credentials, roles] = await Promise.all([
    deps.prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
    deps.prisma.identityCredential.findMany({
      where: { userId, status: 'verified' },
      orderBy: { verifiedAt: 'asc' },
      select: { type: true, externalId: true, displayLabel: true, verifiedAt: true },
    }),
    deps.prisma.scopedRoleAssignment.findMany({
      where: { userId, status: 'active', startsAt: { lte: at }, OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
      orderBy: [{ scopeType: 'asc' }, { role: 'asc' }],
      select: { scopeType: true, scopeId: true, role: true, expiresAt: true },
    }),
  ]);
  if (!user) throw new AuthError('SESSION_INVALID', '会话已失效');
  const publicCredentials = credentials.map((credential) => ({
    ...credential,
    verifiedAt: credential.verifiedAt.toISOString(),
  }));
  return {
    steps: {
      registered: true,
      emailVerified: user.status === 'email_verified' || user.status === 'identity_verified',
      orcidConnected: credentials.some((credential) => credential.type === 'orcid'),
      institutionEmailVerified: credentials.some((credential) => credential.type === 'institution_email'),
    },
    credentials: publicCredentials,
    scopedRoles: roles.map((role) => ({ ...role, expiresAt: role.expiresAt?.toISOString() ?? null })),
    capabilities: {
      orcid: orcidConfigured(deps.orcid),
      institutionEmail: true,
    },
  };
}

export async function beginOrcidConnection(
  deps: AcademicIdentityDeps,
  userId: string,
  returnTo = '/settings',
): Promise<{ authorizationUrl: string }> {
  if (!orcidConfigured(deps.orcid)) throw new AuthError('ORCID_NOT_CONFIGURED', 'ORCID 连接尚未配置');
  const state = generateSessionToken();
  const stored = await deps.redis.set(
    `orcid:state:${state}`,
    JSON.stringify({ userId, returnTo: returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/settings' }),
    'EX',
    ORCID_STATE_TTL_SECONDS,
    'NX',
  );
  if (stored !== 'OK') throw new AuthError('ORCID_AUTHORIZATION_FAILED', '无法建立 ORCID 安全连接');
  const url = new URL('/oauth/authorize', deps.orcid.baseUrl);
  url.searchParams.set('client_id', deps.orcid.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', '/authenticate');
  url.searchParams.set('redirect_uri', deps.orcid.redirectUri);
  url.searchParams.set('state', state);
  return { authorizationUrl: url.toString() };
}

export async function completeOrcidConnection(
  deps: AcademicIdentityDeps,
  userId: string,
  input: { code: string; state: string },
  ctx: AuditContext = {},
): Promise<{ returnTo: string; orcid: string }> {
  if (!orcidConfigured(deps.orcid)) throw new AuthError('ORCID_NOT_CONFIGURED', 'ORCID 连接尚未配置');
  const stateKey = `orcid:state:${input.state}`;
  const rawState = await deps.redis.get(stateKey);
  await deps.redis.del(stateKey);
  if (!rawState) throw new AuthError('ORCID_AUTHORIZATION_FAILED', 'ORCID 连接请求已失效，请重新开始');
  let state: { userId: string; returnTo: string };
  try { state = JSON.parse(rawState) as { userId: string; returnTo: string }; } catch {
    throw new AuthError('ORCID_AUTHORIZATION_FAILED', 'ORCID 连接请求无效');
  }
  if (state.userId !== userId) throw new AuthError('ORCID_AUTHORIZATION_FAILED', 'ORCID 连接请求与当前账号不匹配');

  const response = await (deps.fetch ?? fetch)(new URL('/oauth/token', deps.orcid.baseUrl), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: deps.orcid.clientId,
      client_secret: deps.orcid.clientSecret,
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: deps.orcid.redirectUri,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => { throw new AuthError('ORCID_AUTHORIZATION_FAILED', '无法连接 ORCID', cause); });
  if (!response.ok) throw new AuthError('ORCID_AUTHORIZATION_FAILED', 'ORCID 授权未完成');
  const token = await response.json() as { orcid?: string; name?: string; scope?: string };
  const orcid = token.orcid ?? '';
  assertOrcid(orcid);
  const existing = await deps.prisma.identityCredential.findUnique({
    where: { type_externalId: { type: 'orcid', externalId: orcid } },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) throw new AuthError('CREDENTIAL_ALREADY_LINKED', '该 ORCID 已连接到其他账号');
  await deps.prisma.identityCredential.upsert({
    where: { userId_type: { userId, type: 'orcid' } },
    create: {
      userId, type: 'orcid', externalId: orcid, displayLabel: token.name?.trim() || orcid,
      source: 'orcid_oauth', metadata: { scope: token.scope ?? '/authenticate' },
    },
    update: {
      externalId: orcid, displayLabel: token.name?.trim() || orcid, source: 'orcid_oauth',
      status: 'verified', verifiedAt: currentTime(deps), revokedAt: null, metadata: { scope: token.scope ?? '/authenticate' },
    },
  });
  await audit(deps, { actorId: userId, action: 'identity.orcid.connect', targetType: 'orcid', targetId: orcid }, ctx);
  return { returnTo: state.returnTo, orcid };
}

export async function requestInstitutionEmailCode(
  deps: AcademicIdentityDeps,
  userId: string,
  input: { email: string },
  ctx: AuditContext = {},
): Promise<{ organization: Omit<InstitutionMatch, 'id'> }> {
  const email = input.email.trim().toLowerCase();
  const domain = emailDomain(email);
  const institution = domain ? await resolveInstitutionDomain(deps, domain) : null;
  if (!institution) {
    throw new AuthError('INSTITUTION_DOMAIN_NOT_ALLOWED', '该邮箱域名尚未登记为受信任学术机构');
  }
  const at = currentTime(deps);
  const previous = await deps.prisma.institutionEmailChallenge.findFirst({
    where: { userId, consumedAt: null }, orderBy: { createdAt: 'desc' },
  });
  if (previous && inCooldown(previous.lastSentAt, at)) {
    return { organization: { rorId: institution.rorId, name: institution.name, domain: institution.domain, source: institution.source } };
  }
  if (previous) {
    await deps.prisma.institutionEmailChallenge.updateMany({
      where: { id: previous.id, consumedAt: null }, data: { consumedAt: at, expiresAt: at },
    });
  }
  const code = generateVerificationCode();
  try {
    await deps.prisma.institutionEmailChallenge.create({
      data: {
        userId, email, domain: institution.domain, researchOrganizationId: institution.id,
        codeHash: hashVerificationCode(code), expiresAt: new Date(at.getTime() + CODE_TTL_MS), lastSentAt: at,
      },
    });
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') {
      return { organization: { rorId: institution.rorId, name: institution.name, domain: institution.domain, source: institution.source } };
    }
    throw cause;
  }
  try {
    await deps.mailer.send({ to: email, subject: 'OpenScience 机构邮箱验证码', text: `你的机构邮箱验证码是 ${code}，10 分钟内有效。` });
  } catch (cause) {
    await deps.prisma.institutionEmailChallenge.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: at, expiresAt: at } });
    throw new AuthError('VERIFICATION_DELIVERY_FAILED', '机构邮箱验证码发送失败', cause);
  }
  await audit(deps, {
    actorId: userId, action: 'identity.institution_email.request', targetType: 'research_organization',
    targetId: institution.rorId ?? institution.domain, metadata: { domain: institution.domain, source: institution.source },
  }, ctx);
  return { organization: { rorId: institution.rorId, name: institution.name, domain: institution.domain, source: institution.source } };
}

export async function verifyInstitutionEmail(
  deps: AcademicIdentityDeps,
  userId: string,
  input: { email: string; code: string },
  ctx: AuditContext = {},
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const at = currentTime(deps);
  const challenge = await deps.prisma.institutionEmailChallenge.findFirst({
    where: { userId, email, consumedAt: null }, orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  if (isLocked(challenge.lockedUntil, at)) throw new AuthError('CODE_LOCKED', '尝试次数过多，请稍后再试');
  if (isCodeExpired(challenge.expiresAt, at)) throw new AuthError('CODE_EXPIRED', '验证码已过期，请重新获取');
  if (challenge.codeHash !== hashVerificationCode(input.code)) {
    let current = challenge;
    for (let retry = 0; retry < 5; retry++) {
      const updated = await deps.prisma.institutionEmailChallenge.updateMany({
        where: { id: current.id, consumedAt: null, attempts: current.attempts },
        data: registerFailedAttempt(current.attempts, at),
      });
      if (updated.count === 1) break;
      const refreshed = await deps.prisma.institutionEmailChallenge.findFirst({
        where: { userId, email, consumedAt: null }, orderBy: { createdAt: 'desc' },
      });
      if (!refreshed || refreshed.id !== challenge.id) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
      if (isLocked(refreshed.lockedUntil, at)) throw new AuthError('CODE_LOCKED', '尝试次数过多，请稍后再试');
      current = refreshed;
    }
    throw new AuthError('CODE_INVALID', '验证码错误或已失效');
  }
  const organization = challenge.researchOrganizationId
    ? await deps.prisma.researchOrganization.findUnique({
      where: { id: challenge.researchOrganizationId }, select: { rorId: true, name: true },
    })
    : null;
  try {
    await deps.prisma.$transaction(async (tx) => {
      const consumed = await tx.institutionEmailChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null }, data: { consumedAt: at },
      });
      if (consumed.count !== 1) throw new AuthError('CODE_INVALID', '验证码错误或已失效');
      await tx.identityCredential.upsert({
        where: { userId_type: { userId, type: 'institution_email' } },
        create: {
          userId, type: 'institution_email', externalId: email, displayLabel: email,
          source: organization ? 'ror_institution_email' : 'institution_email_override',
          researchOrganizationId: challenge.researchOrganizationId,
          metadata: { domain: challenge.domain, rorId: organization?.rorId ?? null, organizationName: organization?.name ?? null },
          verifiedAt: at,
        },
        update: {
          externalId: email, displayLabel: email, source: organization ? 'ror_institution_email' : 'institution_email_override',
          researchOrganizationId: challenge.researchOrganizationId, status: 'verified', verifiedAt: at, revokedAt: null,
          metadata: { domain: challenge.domain, rorId: organization?.rorId ?? null, organizationName: organization?.name ?? null },
        },
      });
    });
  } catch (cause) {
    if ((cause as { code?: string })?.code === 'P2002') {
      throw new AuthError('CREDENTIAL_ALREADY_LINKED', '该机构邮箱已连接到其他账号');
    }
    throw cause;
  }
  await audit(deps, { actorId: userId, action: 'identity.institution_email.verify', targetType: 'institution_email', targetId: email, metadata: { domain: challenge.domain } }, ctx);
}
